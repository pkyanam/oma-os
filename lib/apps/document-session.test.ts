import test from "node:test";
import assert from "node:assert/strict";
import { DocumentSession, type DocumentIO } from "./creative/document-session";
type Value = { text: string };
const create = (): Value => ({ text: "new" });
const parse = (raw: string): Value => {
  const value = JSON.parse(raw);
  if (typeof value.text !== "string") throw new Error("Invalid document");
  return value;
};
function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
function memory() {
  const files = new Map<string, string>();
  let creates = 0;
  const writes: string[] = [];
  const io: DocumentIO = {
    ensureParent: async () => {},
    exists: async (path) => files.has(path),
    read: async (path) => {
      if (!files.has(path)) throw new Error("Missing");
      return files.get(path)!;
    },
    create: async (path, body, guard) => {
      guard();
      if (files.has(path)) throw new Error("Exists");
      creates++;
      files.set(path, body);
    },
    write: async (path, body, expected) => {
      if (files.get(path) !== expected) throw new Error("Conflict");
      writes.push(body);
      files.set(path, body);
    },
    changed: () => {},
  };
  return { files, writes, io, creates: () => creates };
}
test("concurrent initial documents expose only complete valid content", async () => {
  const m = memory(),
    entered = deferred(),
    release = deferred();
  const original = m.io.create;
  m.io.create = async (...args) => {
    entered.resolve();
    await release.promise;
    await original(...args);
  };
  const a = new DocumentSession("/doc", create, parse, m.io, () => {}),
    b = new DocumentSession("/doc", create, parse, m.io, () => {});
  const first = a.load();
  await entered.promise;
  const second = b.load();
  assert.equal(m.files.has("/doc"), false);
  release.resolve();
  await Promise.all([first, second]);
  assert.equal(m.creates(), 1);
  assert.equal(a.state.ready, true);
  assert.equal(b.state.ready, true);
  assert.deepEqual(a.state.value, b.state.value);
});
test("cancelled first mount cannot publish state or corrupt second mount baseline", async () => {
  const m = memory();
  m.files.set("/doc", JSON.stringify({ text: "first" }));
  const entered = deferred(),
    release = deferred();
  let calls = 0;
  const original = m.io.read;
  m.io.read = async (path) => {
    if (++calls === 1) {
      const raw = await original(path);
      entered.resolve();
      await release.promise;
      return raw;
    }
    return original(path);
  };
  let oldNotifications = 0;
  const old = new DocumentSession("/doc", create, parse, m.io, () => {
    oldNotifications++;
  });
  const first = old.load();
  await entered.promise;
  await old.dispose();
  m.files.set("/doc", JSON.stringify({ text: "latest" }));
  const fresh = new DocumentSession("/doc", create, parse, m.io, () => {});
  const second = fresh.load();
  release.resolve();
  await Promise.all([first, second]);
  assert.equal(oldNotifications, 0);
  assert.deepEqual(fresh.state.value, { text: "latest" });
  fresh.update({ text: "edited" });
  await fresh.flush();
  assert.equal(fresh.state.error, "");
  assert.deepEqual(parse(m.files.get("/doc")!), { text: "edited" });
});
test("failed reload retains the unsaved buffer and dirty protection", async () => {
  const m = memory();
  m.files.set("/doc", JSON.stringify({ text: "disk" }));
  const s = new DocumentSession("/doc", create, parse, m.io, () => {});
  await s.load();
  s.update({ text: "unsaved" });
  m.files.set("/doc", "invalid JSON");
  await s.reload();
  assert.equal(s.state.dirty, true);
  assert.deepEqual(s.state.value, { text: "unsaved" });
  assert.equal(s.state.status, "Unsaved");
  assert.ok(s.state.error);
  m.files.set("/doc", JSON.stringify({ text: "disk" }));
  await s.flush();
  assert.equal(s.state.dirty, false);
  assert.deepEqual(parse(m.files.get("/doc")!), { text: "unsaved" });
});
test("typing during reload prevents late disk data from replacing new edits", async () => {
  const m = memory();
  m.files.set("/doc", JSON.stringify({ text: "disk" }));
  const s = new DocumentSession("/doc", create, parse, m.io, () => {});
  await s.load();
  const entered = deferred(),
    release = deferred(),
    original = m.io.read;
  m.io.read = async (path) => {
    const value = await original(path);
    entered.resolve();
    await release.promise;
    return value;
  };
  const reload = s.reload();
  await entered.promise;
  s.update({ text: "keep this" });
  release.resolve();
  await reload;
  assert.equal(s.state.dirty, true);
  assert.deepEqual(s.state.value, { text: "keep this" });
});
test("serialized autosave uses the previous completed write as its next baseline", async () => {
  const m = memory();
  m.files.set("/doc", JSON.stringify({ text: "disk" }));
  const s = new DocumentSession("/doc", create, parse, m.io, () => {});
  await s.load();
  const entered = deferred(),
    release = deferred(),
    original = m.io.write;
  let writes = 0;
  m.io.write = async (...args) => {
    if (++writes === 1) {
      entered.resolve();
      await release.promise;
    }
    await original(...args);
  };
  s.update({ text: "one" });
  const first = s.flush();
  await entered.promise;
  s.update({ text: "two" });
  const second = s.flush();
  release.resolve();
  await Promise.all([first, second]);
  assert.equal(s.state.dirty, false);
  assert.equal(s.state.error, "");
  assert.deepEqual(parse(m.files.get("/doc")!), { text: "two" });
});
test("late clean refresh cannot overwrite a newer local edit", async () => {
  const m = memory();
  m.files.set("/doc", JSON.stringify({ text: "disk" }));
  const s = new DocumentSession("/doc", create, parse, m.io, () => {});
  await s.load();
  m.files.set("/doc", JSON.stringify({ text: "external" }));
  const entered = deferred(),
    release = deferred(),
    original = m.io.read;
  m.io.read = async (path) => {
    const raw = await original(path);
    entered.resolve();
    await release.promise;
    return raw;
  };
  const refresh = s.refresh();
  await entered.promise;
  s.update({ text: "local" });
  release.resolve();
  await refresh;
  assert.deepEqual(s.state.value, { text: "local" });
  assert.equal(s.state.dirty, true);
  await s.flush();
  assert.match(s.state.error, /Conflict/);
  assert.deepEqual(parse(m.files.get("/doc")!), { text: "external" });
});
test("Strict Mode style disposal during creation leaves the replacement mount healthy", async () => {
  const m = memory(),
    entered = deferred(),
    release = deferred(),
    original = m.io.create;
  let attempts = 0;
  m.io.create = async (...args) => {
    if (++attempts === 1) {
      entered.resolve();
      await release.promise;
    }
    await original(...args);
  };
  const firstSession = new DocumentSession(
      "/strict",
      create,
      parse,
      m.io,
      () => {},
    ),
    first = firstSession.load();
  await entered.promise;
  await firstSession.dispose();
  const nextSession = new DocumentSession(
      "/strict",
      create,
      parse,
      m.io,
      () => {},
    ),
    second = nextSession.load();
  release.resolve();
  await Promise.all([first, second]);
  assert.equal(nextSession.state.ready, true);
  assert.equal(nextSession.state.error, "");
  assert.deepEqual(parse(m.files.get("/strict")!), { text: "new" });
  assert.equal(m.creates(), 1);
});
