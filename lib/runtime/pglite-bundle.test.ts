import { test } from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import {
  loadPGliteBundle,
  readBounded,
  validBundleManifest,
} from "../../public/workers/pglite-bundle.js";
const digest = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const raw = new TextEncoder().encode(
  "a trusted filesystem bundle\n".repeat(100),
);
const compressed = gzipSync(raw, { level: 6 });
const manifest = {
  format: "oma.pglite.bundle",
  version: 1,
  rawBytes: raw.length,
  compressedBytes: compressed.length,
  sha256: digest(raw),
  compressedSha256: digest(compressed),
};
function fetcher(metadata: unknown = manifest, body: Uint8Array = compressed) {
  return async (input: RequestInfo | URL) =>
    String(input).endsWith(".json")
      ? Response.json(metadata)
      : new Response(new Uint8Array(body));
}
test("compressed PGlite bundle restores exact original bytes", async () => {
  const blob = await loadPGliteBundle(fetcher());
  assert.ok(blob);
  assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), raw);
});
test("corrupt compressed bundle and invalid manifests choose raw fallback", async () => {
  const altered = new Uint8Array(compressed);
  altered[12] ^= 1;
  assert.equal(await loadPGliteBundle(fetcher(manifest, altered)), undefined);
  assert.equal(
    await loadPGliteBundle(fetcher({ ...manifest, rawBytes: 2 })),
    undefined,
  );
  assert.throws(
    () => validBundleManifest({ ...manifest, rawBytes: 20 * 1024 * 1024 }),
    /Invalid/,
  );
});
test("missing compressed assets and unsupported decompression preserve raw fallback", async () => {
  assert.equal(
    await loadPGliteBundle(async () => new Response(null, { status: 404 })),
    undefined,
  );
  assert.equal(
    await loadPGliteBundle(
      async () => {
        throw Error("Must not fetch");
      },
      null as unknown as typeof DecompressionStream,
    ),
    undefined,
  );
});
test("bundle reader rejects oversized streams instead of unbounded allocation", async () => {
  await assert.rejects(
    readBounded(new Blob(["too large"]).stream(), 4),
    /exceeds/,
  );
});
test("HTTP Content-Encoding gzip responses are already decoded by browser fetch", async () => {
  const response = await loadPGliteBundle(async (input) =>
    String(input).endsWith(".json")
      ? Response.json(manifest)
      : new Response(raw, { headers: { "Content-Encoding": "gzip" } }),
  );
  assert.ok(response);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), raw);
});
