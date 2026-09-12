import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const VERSION = "2.5.0";
const SHA256 =
  "133cdef8fcb19bac9bb8fb7bf461ecac1ab5825e0c866d7bbbe201083f42c2f5";
const AMD_BRANCH = "if (typeof define === 'function' && define.amd)";

/** Keep the upstream implementation; only choose CommonJS inside Vite bundles. */
export function commonJSPromisePool(source, version, license) {
  if (
    version !== VERSION ||
    createHash("sha256").update(source).digest("hex") !== SHA256
  ) {
    throw new Error(
      "es6-promise-pool source changed. Review its UMD interoperability before updating the checked compatibility patch.",
    );
  }
  if (source.split(AMD_BRANCH).length !== 2)
    throw new Error("Unexpected es6-promise-pool UMD wrapper.");
  return (
    `/*\nGenerated from es6-promise-pool ${VERSION}, SHA-256 ${SHA256}.\nModified by oma.os: prefer CommonJS over the unrelated Monaco AMD loader.\nUpstream implementation otherwise unchanged.\n\n${license.replaceAll("*/", "* /").trim()}\n*/\n` +
    source.replace(
      AMD_BRANCH,
      "if (false /* Bundled CommonJS module; Monaco owns window.define. */)",
    )
  );
}
export async function patchPromisePool() {
  const base = new URL("../", import.meta.url);
  const [source, metadata, license] = await Promise.all([
    readFile(
      new URL("node_modules/es6-promise-pool/es6-promise-pool.js", base),
      "utf8",
    ),
    readFile(
      new URL("node_modules/es6-promise-pool/package.json", base),
      "utf8",
    ),
    readFile(new URL("public/licenses/es6-promise-pool.txt", base), "utf8"),
  ]);
  const target = new URL("node_modules/.cache/oma/", base);
  await mkdir(target, { recursive: true });
  await writeFile(
    new URL("es6-promise-pool.cjs", target),
    commonJSPromisePool(source, JSON.parse(metadata).version, license),
  );
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  void patchPromisePool().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
