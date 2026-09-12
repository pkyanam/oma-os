import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryFs } from "just-bash";
import { gzipSync } from "fflate";
import { decompressBounded, COMPRESSION_LIMIT } from "./compression";
import { createShellEngine } from "./engine";
const desktop = async () => ({ stdout: "", stderr: "", exitCode: 0 });
test("browser gzip preserves all binary bytes through files and pipelines", async () => {
  const fs = new InMemoryFs();
  const bytes = Uint8Array.from({ length: 8192 }, (_, i) => i % 256);
  await fs.writeFile("/home/guest/source.bin", bytes);
  const shell = createShellEngine(fs, desktop);
  const result = await shell.execute(
    "gzip -c source.bin > source.gz; gunzip -c source.gz > restored.bin; cat source.bin | gzip | zcat > piped.bin",
  );
  assert.equal(result.exitCode, 0, result.stderr);
  assert.deepEqual(await fs.readFileBuffer("/home/guest/restored.bin"), bytes);
  assert.deepEqual(await fs.readFileBuffer("/home/guest/piped.bin"), bytes);
  assert.deepEqual(await fs.readFileBuffer("/home/guest/source.bin"), bytes);
});
test("inflate rejects oversized output and malformed data", () => {
  assert.throws(
    () => decompressBounded(gzipSync(new Uint8Array(COMPRESSION_LIMIT + 1))),
    /exceeds/,
  );
  assert.throws(() => decompressBounded(new Uint8Array([1, 2, 3])));
});
test("compression rejects unsupported options, destructive defaults and oversized files", async () => {
  const fs = new InMemoryFs({ "/home/guest/example": "hello" });
  const shell = createShellEngine(fs, desktop);
  assert.match(
    (await shell.execute("gzip -r example")).stderr,
    /unsupported option/,
  );
  assert.match((await shell.execute("gzip example")).stderr, /requires -c/);
  await fs.writeFile(
    "/home/guest/large",
    new Uint8Array(COMPRESSION_LIMIT + 1),
  );
  assert.match((await shell.execute("gzip -c large")).stderr, /input exceeds/);
});
