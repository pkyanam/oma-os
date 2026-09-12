import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { fs, fingerprintBlob } from "./opfs";
type Node =
  | { kind: "directory"; children: Map<string, Node> }
  | { kind: "file"; data: Blob; deleted?: boolean };
function setup(t: TestContext) {
  const root: Node = { kind: "directory", children: new Map() };
  const control: {
    fail?: "write" | "close";
    pause?: Promise<void>;
    aborted: number;
  } = { aborted: 0 };
  const missing = () => new DOMException("missing", "NotFoundError"),
    mismatch = () => new DOMException("wrong kind", "TypeMismatchError");
  function handle(node: Node, name = ""): unknown {
    if (node.kind === "file")
      return {
        kind: "file",
        name,
        async getFile() {
          if (node.deleted) throw missing();
          return new File([node.data], name);
        },
        async createWritable() {
          if (node.deleted) throw missing();
          let staged = new Blob([]);
          return {
            async write(data: Blob | string) {
              if (control.pause) await control.pause;
              if (control.fail === "write")
                throw new DOMException("quota", "QuotaExceededError");
              staged = data instanceof Blob ? data : new Blob([data]);
            },
            async close() {
              if (control.fail === "close") throw new Error("commit failed");
              if (node.deleted) throw missing();
              node.data = staged;
            },
            async abort() {
              control.aborted++;
            },
          };
        },
      };
    return {
      kind: "directory",
      name,
      async getFileHandle(key: string, options?: { create?: boolean }) {
        let child = node.children.get(key);
        if (child && child.kind !== "file") throw mismatch();
        if (!child) {
          if (!options?.create) throw missing();
          child = { kind: "file", data: new Blob([]) };
          node.children.set(key, child);
        }
        return handle(child, key);
      },
      async getDirectoryHandle(key: string, options?: { create?: boolean }) {
        let child = node.children.get(key);
        if (child && child.kind !== "directory") throw mismatch();
        if (!child) {
          if (!options?.create) throw missing();
          child = { kind: "directory", children: new Map() };
          node.children.set(key, child);
        }
        return handle(child, key);
      },
      async removeEntry(key: string, options?: { recursive?: boolean }) {
        const child = node.children.get(key);
        if (!child) throw missing();
        if (
          child.kind === "directory" &&
          child.children.size &&
          !options?.recursive
        )
          throw new DOMException("not empty", "InvalidModificationError");
        if (child.kind === "file") child.deleted = true;
        node.children.delete(key);
      },
      async *entries() {
        for (const [key, child] of node.children)
          yield [key, handle(child, key)];
      },
    };
  }
  const original = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { storage: { getDirectory: async () => handle(root) } },
  });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, "navigator", original);
    else Reflect.deleteProperty(globalThis, "navigator");
  });
  return control;
}
test("OPFS writes and reads exact binary bytes and recognizes directory existence", async (t) => {
  setup(t);
  await fs.mkdir("/home/guest/Media");
  const data = new Uint8Array([0, 255, 13, 10, 42]);
  await fs.writeBlob("/home/guest/Media/raw.bin", new Blob([data]));
  assert.deepEqual(
    new Uint8Array(
      await (await fs.readBlob("/home/guest/Media/raw.bin")).arrayBuffer(),
    ),
    data,
  );
  assert.equal(await fs.exists("/home/guest/Media"), true);
  assert.equal((await fs.stat("/home/guest/Media")).kind, "directory");
  assert.equal((await fs.ls("/home/guest/Media"))[0].size, 5);
});
test("expected-content save refuses to recreate a deleted empty file", async (t) => {
  setup(t);
  await fs.mkdir("/home/guest");
  await fs.write("draft.txt", "");
  await fs.rm("draft.txt");
  await assert.rejects(
    () => fs.write("draft.txt", "new content", ""),
    /deleted on disk/,
  );
  assert.equal(await fs.exists("draft.txt"), false);
});
test("competing optimistic saves serialize even without Web Locks", async (t) => {
  setup(t);
  await fs.mkdir("/home/guest");
  await fs.write("draft.txt", "base");
  const outcomes = await Promise.allSettled([
    fs.write("draft.txt", "first", "base"),
    fs.write("./draft.txt", "second", "base"),
  ]);
  assert.equal(outcomes.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(await fs.read("draft.txt"), "first");
});
test("create-only binary imports cannot overwrite a concurrent import", async (t) => {
  setup(t);
  await fs.mkdir("/home/guest");
  const outcomes = await Promise.allSettled([
    fs.writeBlob("x.bin", new Blob(["a"]), { overwrite: false }),
    fs.writeBlob("x.bin", new Blob(["b"]), { overwrite: false }),
  ]);
  assert.equal(outcomes.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(await fs.read("x.bin"), "a");
});
test("failed writes abort staging, retain original bytes and remove newly created empty files", async (t) => {
  const control = setup(t);
  await fs.mkdir("/home/guest");
  await fs.write("keep.txt", "original");
  control.fail = "write";
  await assert.rejects(() => fs.write("keep.txt", "replacement"));
  assert.equal(await fs.read("keep.txt"), "original");
  await assert.rejects(() => fs.write("new.txt", "replacement"));
  assert.equal(await fs.exists("new.txt"), false);
  assert.equal(control.aborted, 2);
});
test("failed close preserves original file and rolls back new file creation", async (t) => {
  const control = setup(t);
  await fs.mkdir("/home/guest");
  await fs.write("keep.txt", "original");
  control.fail = "close";
  await assert.rejects(() => fs.write("keep.txt", "replacement"));
  await assert.rejects(() => fs.write("new.txt", "replacement"));
  assert.equal(await fs.read("keep.txt"), "original");
  assert.equal(await fs.exists("new.txt"), false);
});
test("delete waits for an in-progress save instead of resurrecting its path", async (t) => {
  const control = setup(t);
  await fs.mkdir("/home/guest");
  await fs.write("draft.txt", "base");
  let release!: () => void;
  control.pause = new Promise<void>((resolve) => {
    release = resolve;
  });
  const save = fs.write("draft.txt", "saved", "base");
  const remove = fs.rm("draft.txt");
  release();
  await Promise.all([save, remove]);
  assert.equal(await fs.exists("draft.txt"), false);
});
test("touch does not truncate and protected roots cannot be removed", async (t) => {
  setup(t);
  await fs.mkdir("/home/guest");
  await fs.write("keep.txt", "keep");
  await fs.touch("keep.txt");
  assert.equal(await fs.read("keep.txt"), "keep");
  await assert.rejects(() => fs.rm("/home/guest"), /Protected/);
});

test("binary expected fingerprint rejects same-size changed contents and deletion", async (t) => {
  setup(t);
  await fs.mkdir("/home/guest");
  await fs.write("binary.dat", "AAAA");
  const expected = await fingerprintBlob(await fs.readBlob("binary.dat"));
  await fs.write("binary.dat", "BBBB");
  await assert.rejects(
    fs.writeBlob("binary.dat", new Blob(["backup"]), { expected }),
    /changed on disk/,
  );
  assert.equal(await fs.read("binary.dat"), "BBBB");
  await fs.rm("binary.dat");
  await assert.rejects(
    fs.writeBlob("binary.dat", new Blob(["backup"]), { expected }),
    /deleted/,
  );
  assert.equal(await fs.exists("binary.dat"), false);
});
test("restore guard checks again before commit and aborts staged bytes", async (t) => {
  const control = setup(t);
  await fs.mkdir("/home/guest");
  await fs.write("draft.txt", "original");
  let checks = 0;
  await assert.rejects(
    fs.writeBlob("draft.txt", new Blob(["backup"]), {
      guard: () => {
        checks++;
        if (checks === 3) throw new Error("document became dirty");
      },
    }),
    /became dirty/,
  );
  assert.equal(await fs.read("draft.txt"), "original");
  assert.equal(control.aborted, 1);
});
