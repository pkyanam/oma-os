import { test } from "node:test";
import assert from "node:assert/strict";
import { zipSync, Zip, ZipDeflate } from "fflate";
import { extractArchive } from "./archive";
function central(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i < bytes.length - 4; i++)
    if (view.getUint32(i, true) === 0x02014b50) return i;
  throw new Error("central missing");
}
test("streaming ZIP extraction counts real bytes despite falsified advertised sizes", async () => {
  const data = zipSync(
    { "bomb.txt": new Uint8Array(2 * 1024 * 1024).fill(65) },
    { level: 9 },
  );
  const view = new DataView(data.buffer);
  view.setUint32(22, 1, true);
  view.setUint32(central(data) + 24, 1, true);
  await assert.rejects(
    () => extractArchive(data, { maxBytes: 1024 }),
    /Expanded archive exceeds/,
  );
});
test("ZIP rejects corrupt stored bytes instead of restoring silent corruption", async () => {
  const data = zipSync(
    { "a.txt": new TextEncoder().encode("original") },
    { level: 0 },
  );
  const view = new DataView(data.buffer),
    body = 30 + view.getUint16(26, true) + view.getUint16(28, true);
  data[body] ^= 1;
  await assert.rejects(() => extractArchive(data), /checksum/);
});
test("ZIP rejects truncation, ambiguous paths and files used as directories", async () => {
  const data = zipSync({ "x.txt": new Uint8Array([1]) });
  await assert.rejects(
    () => extractArchive(data.subarray(0, data.length - 1)),
    /truncated/,
  );
  await assert.rejects(
    () => extractArchive(zipSync({ "folder//x": new Uint8Array() })),
    /ambiguous/,
  );
  await assert.rejects(
    () =>
      extractArchive(
        zipSync({ folder: new Uint8Array(), "folder/x": new Uint8Array() }),
      ),
    /parent folder/,
  );
});
test("ZIP safely returns special object keys without prototype mutation", async () => {
  const archive = zipSync({ "safe-name": new Uint8Array([42]) });
  const name = new TextEncoder().encode("__proto__");
  archive.set(name, 30);
  archive.set(name, central(archive) + 46);
  const result = await extractArchive(archive);
  assert.equal(Object.getPrototypeOf(result), null);
  assert.deepEqual(result.__proto__, new Uint8Array([42]));
});
test("ZIP rejects altered local versus central names", async () => {
  const data = zipSync({ "a.txt": new Uint8Array([1]) });
  data[30] = 98;
  await assert.rejects(() => extractArchive(data), /names disagree/);
});
test("ZIP handles empty archive and enforces file-count budget", async () => {
  assert.deepEqual(Object.keys(await extractArchive(zipSync({}))), []);
  await assert.rejects(
    () =>
      extractArchive(zipSync({ a: new Uint8Array(), b: new Uint8Array() }), {
        maxFiles: 1,
      }),
    /file limit/,
  );
});

test("ZIP streaming data descriptors and Unicode filenames roundtrip", async () => {
  const chunks: Uint8Array[] = [];
  const stream = new Zip((error, data) => {
    if (error) throw error;
    chunks.push(data);
  });
  const entry = new ZipDeflate("notes/café.txt");
  stream.add(entry);
  entry.push(new TextEncoder().encode("hello "), false);
  entry.push(new TextEncoder().encode("world"), true);
  stream.end();
  const archive = new Uint8Array(
    chunks.reduce((total, chunk) => total + chunk.length, 0),
  );
  let offset = 0;
  for (const chunk of chunks) {
    archive.set(chunk, offset);
    offset += chunk.length;
  }
  const result = await extractArchive(archive);
  assert.equal(
    new TextDecoder().decode(result["notes/café.txt"]),
    "hello world",
  );
});
