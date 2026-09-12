import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runtimeClosure } from "../../scripts/static-assets.mjs";
test("runtime closure traces imports and URL assets, not virtual filesystem strings", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "oma-assets-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(join(dir, "nested"));
  await writeFile(
    join(dir, "index.js"),
    'import "./nested/part.js"; const virtual="/pglite/lib/regress.js"; const unused="fake.data";',
  );
  await writeFile(
    join(dir, "nested/part.js"),
    'export const wasm=new URL("../engine.wasm",import.meta.url);',
  );
  await writeFile(join(dir, "engine.wasm"), new Uint8Array([0]));
  assert.deepEqual(await runtimeClosure(dir, ["index.js"]), [
    "engine.wasm",
    "index.js",
    "nested/part.js",
  ]);
});
test("PGlite core deployment includes its runtime but omits unused extension archives and declarations", async () => {
  const files = await runtimeClosure("node_modules/@electric-sql/pglite/dist", [
    "index.js",
    "pglite.wasm",
    "pglite.data",
    "initdb.wasm",
  ]);
  assert.ok(files.includes("index.js"));
  assert.ok(files.includes("pglite.wasm"));
  assert.ok(files.includes("pglite.data"));
  assert.ok(
    files.every(
      (file) =>
        !file.endsWith(".tar.gz") &&
        !file.endsWith(".cts") &&
        !file.endsWith(".map"),
    ),
  );
});
