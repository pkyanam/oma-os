import { test } from "node:test";
import assert from "node:assert/strict";
import { appForPath, validName, fileKind } from "./kinds";
import {
  assertDestination,
  assertMutable,
  uniquePath,
  copyEntry,
  moveEntry,
  type FilePort,
} from "./operations";
import { archiveEntries, extractArchive, safeArchivePath } from "./archive";
import { zipSync } from "fflate";
import type { Entry } from "../fs/opfs";
function memory() {
  const files = new Map<string, Blob>([["/source/a.txt", new Blob(["hello"])]]),
    dirs = new Set(["/", "/source"]);
  const port: FilePort = {
    async exists(p) {
      return files.has(p) || dirs.has(p);
    },
    async ls(p) {
      return [
        ...Array.from(dirs)
          .filter((d) => d !== p && d.slice(0, d.lastIndexOf("/")) === p)
          .map((d) => ({
            path: d,
            name: d.split("/").pop()!,
            kind: "directory" as const,
          })),
        ...Array.from(files)
          .filter(([f]) => f.slice(0, f.lastIndexOf("/")) === p)
          .map(([f, b]) => ({
            path: f,
            name: f.split("/").pop()!,
            kind: "file" as const,
            size: b.size,
          })),
      ];
    },
    async readBlob(p) {
      if (!files.has(p)) throw new Error("missing");
      return files.get(p)!;
    },
    async writeBlob(p, b, o) {
      if (o?.overwrite === false && files.has(p)) throw new Error("exists");
      files.set(p, b);
    },
    async mkdir(p) {
      dirs.add(p);
    },
    async rm(p) {
      files.delete(p);
      dirs.delete(p);
    },
  };
  return { port, files, dirs };
}
test("file types select working viewer and HTML browser", () => {
  assert.equal(appForPath("photo.JPG"), "media");
  assert.equal(appForPath("app.html"), "browser");
  assert.equal(appForPath("notes.md"), "editor");
  assert.equal(fileKind("song.flac"), "audio");
});
test("file names reject traversal and separators", () => {
  for (const value of ["..", ".", "", "a/b", "a\\b", "x\0y"])
    assert.throws(() => validName(value));
  assert.equal(validName(" report.md "), "report.md");
});
test("copy cannot target itself or descendant and system roots cannot move", () => {
  assert.throws(() => assertDestination("/source", "/source"));
  assert.throws(() => assertDestination("/source", "/source/sub"));
  assert.doesNotThrow(() => assertDestination("/source", "/source2"));
  assert.throws(() => assertMutable("/home/guest/../guest"));
});
test("imports select non-conflicting names including directories", async () => {
  const { port } = memory();
  assert.equal(await uniquePath("/source", "a.txt", port), "/source/a (2).txt");
  assert.equal(await uniquePath("/", "source", port), "/source (2)");
});
test("recursive copy preserves original bytes, move deletes only after copy", async () => {
  const { port, files, dirs } = memory();
  const entry: Entry = { path: "/source", name: "source", kind: "directory" };
  await copyEntry(entry, "/copy", port);
  assert.equal(await files.get("/copy/a.txt")?.text(), "hello");
  assert.ok(files.has("/source/a.txt"));
  await moveEntry(entry, "/moved", port);
  assert.ok(!dirs.has("/source"));
  assert.equal(await files.get("/moved/a.txt")?.text(), "hello");
  assert.ok(files.has("/copy/a.txt"));
});
test("failed copy never deletes the source", async () => {
  const { port, files } = memory();
  port.writeBlob = async () => {
    throw new Error("quota exceeded");
  };
  await assert.rejects(() =>
    moveEntry(
      { path: "/source/a.txt", name: "a.txt", kind: "file" },
      "/dest.txt",
      port,
    ),
  );
  assert.ok(files.has("/source/a.txt"));
});
test("zip export and import preserve binary data and empty directories", async () => {
  const source = {
    "photo.bin": new Uint8Array([0, 255, 1, 17]),
    "empty/": new Uint8Array(),
  };
  const result = await extractArchive(await archiveEntries(source));
  assert.deepEqual({ ...result }, source);
});
test("archive rejects absolute, traversal and Windows paths", async () => {
  for (const p of [
    "/etc/passwd",
    "../escape",
    "folder/../escape",
    "C:/temp/a",
    "folder\\a",
    "folder/./a",
  ])
    assert.throws(() => safeArchivePath(p));
  await assert.rejects(
    () => extractArchive(zipSync({ "../escape": new Uint8Array([1]) })),
    /traversal/,
  );
});
