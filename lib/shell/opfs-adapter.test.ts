import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryFs } from "just-bash";
import { OpfsShellFs } from "./opfs-adapter";
import { createShellEngine } from "./engine";
async function fixture() {
  const memory = new InMemoryFs({
    "/home/guest/input.txt": "café\nalpha\n",
    "/.oma/keep.txt": "protected",
  });
  const normalize = (path: string) => memory.resolvePath("/home/guest", path);
  const backend = {
    normalize,
    exists: (path: string) => memory.exists(path),
    mkdir: (path: string) => memory.mkdir(path, { recursive: true }),
    rm: (path: string) => memory.rm(path),
    readBlob: async (path: string) =>
      new File(
        [(await memory.readFileBuffer(path)).slice().buffer as ArrayBuffer],
        path.split("/").pop()!,
      ),
    writeBlob: async (path: string, body: Blob) => {
      await memory.writeFile(path, new Uint8Array(await body.arrayBuffer()));
    },
    write: async (path: string, body: string, expected?: string) => {
      if (expected !== undefined && (await memory.readFile(path)) !== expected)
        throw new Error("changed");
      await memory.writeFile(path, body);
    },
    stat: async (path: string) => {
      const result = await memory.stat(path);
      return {
        name: path.split("/").pop()!,
        path,
        kind: result.isDirectory ? ("directory" as const) : ("file" as const),
        size: result.size,
      };
    },
    ls: async (path: string) =>
      Promise.all(
        (await memory.readdir(path)).map(async (name) => {
          const full = normalize(`${path}/${name}`),
            result = await memory.stat(full);
          return {
            name,
            path: full,
            kind: result.isDirectory
              ? ("directory" as const)
              : ("file" as const),
            size: result.size,
          };
        }),
      ),
  };
  let changes = 0;
  const adapter = new OpfsShellFs(backend, () => changes++);
  return {
    adapter,
    memory,
    get changes() {
      return changes;
    },
  };
}
test("OPFS adapter supports Unicode pipelines and redirection without a mirrored filesystem", async () => {
  const { adapter, memory } = await fixture();
  const shell = createShellEngine(adapter, async () => ({
    stdout: "",
    stderr: "",
    exitCode: 0,
  }));
  const result = await shell.execute(
    "cat input.txt | grep café > result.txt; cat result.txt",
  );
  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout, "café\n");
  assert.equal(await memory.readFile("/home/guest/result.txt"), "café\n");
});
test("protected recursive deletion fails before removing any descendants", async () => {
  const { adapter, memory } = await fixture();
  await assert.rejects(
    adapter.rm("/.oma", { recursive: true, force: true }),
    /protected/,
  );
  assert.equal(await memory.readFile("/.oma/keep.txt"), "protected");
});
test("ordinary shell file lifecycle works through the OPFS adapter", async () => {
  const { adapter, memory } = await fixture();
  const shell = createShellEngine(adapter, async () => ({
    stdout: "",
    stderr: "",
    exitCode: 0,
  }));
  const result = await shell.execute(
    "mkdir -p scratch/deep; cp input.txt scratch/deep/a.txt; mv scratch/deep/a.txt scratch/b.txt; printf 'last\\n' >> scratch/b.txt; cat scratch/b.txt; rm -r scratch",
  );
  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  assert.equal(result.stdout, "café\nalpha\nlast\n");
  assert.equal(await memory.exists("/home/guest/scratch"), false);
});
test("binary roundtrip and recursive copy preserve content", async () => {
  const { adapter } = await fixture();
  await adapter.mkdir("/home/guest/folder");
  await adapter.writeFile(
    "/home/guest/folder/binary",
    new Uint8Array([0, 255, 127, 128]),
  );
  await adapter.cp("/home/guest/folder", "/home/guest/copy", {
    recursive: true,
  });
  assert.deepEqual(
    await adapter.readFileBuffer("/home/guest/copy/binary"),
    new Uint8Array([0, 255, 127, 128]),
  );
  await assert.rejects(
    adapter.cp("/home/guest/folder", "/home/guest/folder/inside", {
      recursive: true,
    }),
    /itself/,
  );
});
test("missing paths, unsupported links and oversized files report errors", async () => {
  const { adapter } = await fixture();
  await assert.rejects(adapter.readFile("/missing"));
  await assert.rejects(adapter.symlink(), /ENOTSUP/);
  await assert.rejects(
    adapter.writeFile("/home/guest/huge", new Uint8Array(16 * 1024 * 1024 + 1)),
    /EFBIG/,
  );
});
