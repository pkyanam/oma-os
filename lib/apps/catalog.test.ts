import test from "node:test";
import assert from "node:assert/strict";
import {
  applicationDirectory,
  parseAppManifest,
  installTemplate,
  appTemplates,
  hideApplication,
} from "./catalog";
import { fs } from "../fs/opfs";
test("application slugs cannot escape the installation root", () => {
  assert.equal(
    applicationDirectory("image-studio"),
    "/home/guest/Applications/image-studio",
  );
  for (const slug of [
    "../outside",
    "/home",
    "foo/bar",
    "foo\\bar",
    "..",
    "",
    "a".repeat(81),
  ])
    assert.throws(() => applicationDirectory(slug));
});
test("optional app metadata is bounded and normalizes untrusted fields", () => {
  assert.deepEqual(
    parseAppManifest(
      '{"title":"Mine","description":"A tool","hidden":true,"entry":"../../secret"}',
    ),
    { title: "Mine", description: "A tool", hidden: true },
  );
  assert.throws(() => parseAppManifest("[]"));
  assert.throws(() => parseAppManifest("x".repeat(16385)));
  assert.equal(parseAppManifest('{"title":123,"hidden":"yes"}').hidden, false);
});
test("template install preserves edited source and registration removal preserves files", async () => {
  const original = {
    mkdir: fs.mkdir,
    exists: fs.exists,
    read: fs.read,
    touch: fs.touch,
    write: fs.write,
  };
  const originalFetch = globalThis.fetch;
  const files = new Map<string, string>();
  let requests = 0;
  try {
    fs.mkdir = async () => {};
    fs.exists = async (path) => files.has(path);
    fs.read = async (path) => {
      if (!files.has(path)) throw new Error("missing");
      return files.get(path)!;
    };
    fs.touch = async (path) => {
      if (!files.has(path)) files.set(path, "");
    };
    fs.write = async (path, body, expected) => {
      if (expected !== undefined && files.get(path) !== expected)
        throw new Error("conflict");
      files.set(path, body);
    };
    globalThis.fetch = async () => {
      requests++;
      return new Response("<!doctype html><html>working app</html>");
    };
    const template = appTemplates[0],
      path = await installTemplate(template);
    assert.equal(requests, 1);
    assert.ok(files.get(path)?.includes("working app"));
    files.set(path, "<!doctype html><html>my edits</html>");
    assert.equal(await installTemplate(template), path);
    assert.equal(requests, 1);
    assert.ok(files.get(path)?.includes("my edits"));
    await hideApplication({
      slug: template.slug,
      title: template.title,
      description: "local",
      path,
      directory: applicationDirectory(template.slug),
      registered: true,
    });
    assert.ok(files.has(path));
    assert.equal(
      JSON.parse(
        files.get(applicationDirectory(template.slug) + "/.oma-app.json")!,
      ).hidden,
      true,
    );
    await installTemplate(template);
    assert.ok(files.get(path)?.includes("my edits"));
    assert.equal(
      JSON.parse(
        files.get(applicationDirectory(template.slug) + "/.oma-app.json")!,
      ).hidden,
      false,
    );
  } finally {
    Object.assign(fs, original);
    globalThis.fetch = originalFetch;
  }
});
