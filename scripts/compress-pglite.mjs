import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gzip } from "node:zlib";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
const compress = promisify(gzip);
/** Build an optional gzip transport bundle. Keep the raw asset for compatibility. */
export async function compressPGlite(
  directory = new URL("../public/pglite/", import.meta.url),
) {
  const base =
    typeof directory === "string"
      ? pathToFileURL(resolve(directory) + "/")
      : directory;
  const raw = await readFile(new URL("pglite.data", base));
  if (raw.byteLength > 16 * 1024 * 1024)
    throw new Error(
      "PGlite data exceeds the supported 16 MiB bundle limit. Review the runtime upgrade.",
    );
  const packed = await compress(raw, { level: 6 });
  const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
  const manifest = {
    format: "oma.pglite.bundle",
    version: 1,
    rawBytes: raw.byteLength,
    compressedBytes: packed.byteLength,
    sha256: digest(raw),
    compressedSha256: digest(packed),
  };
  await writeFile(new URL("pglite.data.gz", base), packed);
  await writeFile(
    new URL("pglite.data.meta.json", base),
    JSON.stringify(manifest) + "\n",
  );
  return manifest;
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  console.log(await compressPGlite());
