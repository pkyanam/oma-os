import { test } from "node:test";
import assert from "node:assert/strict";
import { backupPath } from "./backup";
test("backup paths stay inside owned browser files", () => {
  assert.equal(
    backupPath("home/guest/Documents/hello.md"),
    "/home/guest/Documents/hello.md",
  );
  assert.equal(
    backupPath(".oma/conversations/test.json"),
    "/.oma/conversations/test.json",
  );
  for (const path of [
    "etc/passwd",
    "home/guest/../../secret",
    ".oma/../secret",
    "/home/guest/file",
    "home/guest//file",
    "home/guest\\file",
  ])
    assert.throws(() => backupPath(path));
});

import {
  inspectBackup,
  restoreBackup,
  validateBackupManifest,
  type BackupManifest,
} from "./backup";
import { archiveEntries } from "@/lib/files/archive";
import { fingerprintBlob, type fs } from "./opfs";
const encode = (text: string) => new TextEncoder().encode(text);
function manifest(entries: Record<string, Uint8Array>): BackupManifest {
  return {
    format: "oma.os.backup",
    version: 1,
    createdAt: "2026-09-12T12:00:00.000Z",
    files: Object.keys(entries).length,
    bytes: Object.values(entries).reduce((n, v) => n + v.byteLength, 0),
    directories: ["/home/guest", "/.oma"],
  };
}
async function zip(
  entries: Record<string, Uint8Array>,
  value: unknown = manifest(entries),
) {
  return archiveEntries({
    ...entries,
    "oma-backup.json": encode(JSON.stringify(value)),
  });
}
function storage(initial: Record<string, string> = {}) {
  const files = new Map(
    Object.entries(initial).map(([path, content]) => [
      path,
      new Blob([content]),
    ]),
  );
  const writes: string[] = [];
  const directories: string[] = [];
  const adapter = {
    ls: async () => [],
    readBlob: async (path: string) => {
      const blob = files.get(path);
      if (!blob) throw new DOMException("missing", "NotFoundError");
      return new File([blob], path.split("/").pop()!);
    },
    mkdir: async (path: string) => {
      directories.push(path);
    },
    writeBlob: async (
      path: string,
      body: Blob,
      options: Parameters<typeof fs.writeBlob>[2] = {},
    ) => {
      if (options.expected) {
        const current = files.get(path);
        if (!current) throw new Error("deleted");
        assert.deepEqual(
          await fingerprintBlob(current),
          options.expected,
          "destination changed",
        );
      } else if (options.overwrite === false && files.has(path))
        throw new Error("already exists");
      options.guard?.();
      files.set(path, body);
      writes.push(path);
    },
  };
  return { files, writes, directories, adapter };
}
test("backup rejects manifest count/byte mismatches, malformed roots and duplicate directories", () => {
  const entries = { "home/guest/a.txt": encode("abc") },
    base = manifest(entries);
  for (const value of [
    null,
    [],
    { ...base, files: 2 },
    { ...base, bytes: 99 },
    { ...base, directories: ["/home/guest", "/home/guest", "/.oma"] },
    { ...base, directories: ["/home/guest"] },
    { ...base, directories: ["/home/guest", "/.oma", "/home/guest/a.txt"] },
  ])
    assert.throws(() => validateBackupManifest(value, entries));
  assert.throws(
    () =>
      validateBackupManifest(
        manifest({ "home/guest/missing/a.txt": encode("x") }),
        { "home/guest/missing/a.txt": encode("x") },
      ),
    /parent folder/,
  );
});
test("inspect backup validates real archive data before reading destinations", async () => {
  const s = storage(),
    entries = { "home/guest/a.txt": encode("abc") };
  await assert.rejects(
    inspectBackup(
      await zip(entries, { ...manifest(entries), bytes: 4 }),
      s.adapter,
    ),
    /does not match/,
  );
  const preview = await inspectBackup(await zip(entries), s.adapter);
  assert.equal(preview.manifest.files, 1);
  assert.equal(preview.bytes, 3);
  assert.equal(preview.baselines["home/guest/a.txt"], null);
});
test("restore refuses changed destinations and files created after preview", async () => {
  const s = storage({ "/home/guest/a.txt": "original" }),
    entries = {
      "home/guest/a.txt": encode("restore a"),
      "home/guest/b.txt": encode("restore b"),
    };
  const preview = await inspectBackup(await zip(entries), s.adapter);
  s.files.set("/home/guest/a.txt", new Blob(["changed after preview"]));
  s.files.set("/home/guest/b.txt", new Blob(["new after preview"]));
  const result = await restoreBackup(preview, true, { storage: s.adapter });
  assert.equal(result.restored, 0);
  assert.equal(result.failures.length, 2);
  assert.equal(
    await s.files.get("/home/guest/a.txt")!.text(),
    "changed after preview",
  );
  assert.equal(
    await s.files.get("/home/guest/b.txt")!.text(),
    "new after preview",
  );
});
test("restore merges safely, skips existing by default and stops when documents become dirty", async () => {
  const s = storage({ "/home/guest/a.txt": "keep" }),
    entries = {
      "home/guest/a.txt": encode("replace"),
      "home/guest/b.txt": encode("first"),
      "home/guest/c.txt": encode("second"),
    };
  const preview = await inspectBackup(await zip(entries), s.adapter);
  const result = await restoreBackup(preview, false, {
    storage: s.adapter,
    beforeWrite: () => {
      if (s.writes.length) throw new Error("Save your edited document first.");
    },
  });
  assert.equal(result.skipped, 1);
  assert.equal(result.restored, 1);
  assert.match(result.stopped, /edited document/);
  assert.equal(s.files.has("/home/guest/c.txt"), false);
  assert.equal(await s.files.get("/home/guest/a.txt")!.text(), "keep");
});
test("restore replaces an unchanged destination using its preview fingerprint", async () => {
  const s = storage({ "/home/guest/a.txt": "original" }),
    preview = await inspectBackup(
      await zip({ "home/guest/a.txt": encode("restored") }),
      s.adapter,
    );
  const result = await restoreBackup(preview, true, { storage: s.adapter });
  assert.equal(result.restored, 1);
  assert.equal(result.failures.length, 0);
  assert.equal(await s.files.get("/home/guest/a.txt")!.text(), "restored");
});
