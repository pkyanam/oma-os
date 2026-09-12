import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
// Explicit releases only. This downloads ~13.5 MB core for v314.0.6, never the full package collection.
const version = process.argv[2] || "314.0.6";
if (!/^\d+\.\d+\.\d+$/.test(version))
  throw new Error("Pass an explicit release, e.g. 314.0.6.");
const source = `https://cdn.jsdelivr.net/pyodide/v${version}/full/`;
async function download(name, keep = false) {
  const response = await fetch(source + name, {
    credentials: "omit",
    redirect: "error",
    signal: AbortSignal.timeout(45000),
  });
  if (!response.ok || !response.body)
    throw new Error(`${name}: HTTP ${response.status}`);
  const hash = createHash("sha256"),
    chunks = [];
  let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.byteLength;
    if (bytes > 25 * 1024 * 1024) throw new Error(`${name} exceeds 25 MiB`);
    hash.update(chunk);
    if (keep) chunks.push(chunk);
  }
  return {
    asset: { sha256: hash.digest("hex"), bytes },
    text: keep ? Buffer.concat(chunks).toString("utf8") : "",
  };
}
const lock = await download("pyodide-lock.json", true);
const packages = JSON.parse(lock.text).packages;
if (!packages || typeof packages !== "object")
  throw new Error("Invalid lockfile.");
const assets = Object.create(null);
assets["pyodide-lock.json"] = lock.asset;
for (const name of [
  "pyodide.mjs",
  "pyodide.asm.mjs",
  "pyodide.asm.wasm",
  "python_stdlib.zip",
])
  assets[name] = (await download(name)).asset;
for (const item of Object.values(packages)) {
  if (
    !/^[A-Za-z0-9_.+-]+$/.test(item.file_name) ||
    !/^[a-f0-9]{64}$/.test(item.sha256)
  )
    throw new Error("Invalid package filename or hash.");
  if (Object.hasOwn(assets, item.file_name))
    throw new Error("Duplicate package asset.");
  assets[item.file_name] = { sha256: item.sha256 };
}
await writeFile(
  new URL("../lib/runtime/pyodide-assets.json", import.meta.url),
  JSON.stringify({ version, source, assets }, null, 2) + "\n",
);
console.log(
  `Pinned ${Object.keys(assets).length} assets for Pyodide ${version}. No runtime binaries were saved. Review the diff and update python-worker.mjs INDEX before changing releases.`,
);
