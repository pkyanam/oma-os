/* Optional compressed transport for the trusted, build-generated PGlite filesystem bundle. */
const LIMIT = 16 * 1024 * 1024;
export async function readBounded(body, limit) {
  if (!body) throw new Error("Empty PGlite bundle response.");
  const reader = body.getReader(),
    chunks = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > limit)
        throw new Error("PGlite bundle exceeds its declared size.");
      chunks.push(part.value);
    }
  } catch (error) {
    await reader.cancel(error).catch(() => {});
    throw error;
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}
async function digest(bytes) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}
export function validBundleManifest(value) {
  if (
    !value ||
    value.format !== "oma.pglite.bundle" ||
    value.version !== 1 ||
    ![value.rawBytes, value.compressedBytes].every(
      (n) => Number.isSafeInteger(n) && n > 0 && n <= LIMIT,
    ) ||
    ![value.sha256, value.compressedSha256].every(
      (s) => typeof s === "string" && /^[a-f0-9]{64}$/.test(s),
    )
  )
    throw new Error("Invalid PGlite bundle manifest.");
  return value;
}
/** Return undefined to let PGlite load its original raw asset on older browsers or any transport failure. */
export async function loadPGliteBundle(
  fetcher = fetch,
  Decompress = globalThis.DecompressionStream,
) {
  if (typeof Decompress !== "function") return undefined;
  try {
    const manifestResponse = await fetcher("/pglite/pglite.data.meta.json", {
      signal: AbortSignal.timeout(30000),
    });
    if (!manifestResponse.ok) return undefined;
    const metadata = await readBounded(manifestResponse.body, 4096);
    const manifest = validBundleManifest(
      JSON.parse(new TextDecoder().decode(metadata)),
    );
    const response = await fetcher("/pglite/pglite.data.gz", {
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) return undefined;
    // Vite and some static hosts label .gz with Content-Encoding: gzip;
    // fetch has already decoded that response. Validate its raw hash directly.
    if (
      (response.headers.get("content-encoding") || "")
        .split(",")
        .some((value) => value.trim() === "gzip")
    ) {
      const decoded = await readBounded(response.body, manifest.rawBytes);
      if (
        decoded.byteLength !== manifest.rawBytes ||
        (await digest(decoded)) !== manifest.sha256
      )
        throw new Error("Decoded PGlite bundle integrity mismatch.");
      return new Blob([decoded], { type: "application/octet-stream" });
    }
    const packed = await readBounded(response.body, manifest.compressedBytes);
    if (
      packed.byteLength !== manifest.compressedBytes ||
      (await digest(packed)) !== manifest.compressedSha256
    )
      throw new Error("Compressed PGlite bundle integrity mismatch.");
    const raw = await readBounded(
      new Blob([packed]).stream().pipeThrough(new Decompress("gzip")),
      manifest.rawBytes,
    );
    if (
      raw.byteLength !== manifest.rawBytes ||
      (await digest(raw)) !== manifest.sha256
    )
      throw new Error("PGlite bundle integrity mismatch.");
    return new Blob([raw], { type: "application/octet-stream" });
  } catch {
    return undefined;
  }
}
