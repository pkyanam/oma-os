import { cp, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { patchMonacoSecurity } from "./patch-monaco-security.mjs";
import { copyRuntimeClosure } from "./static-assets.mjs";
import { patchPromisePool } from './patch-promise-pool.mjs';
await patchPromisePool();
// These directories contain generated upstream assets only. Replace them so
// dependency upgrades cannot leave old, unused, or vulnerable bundles served.
for (const path of [
  "../public/monaco/vs",
  "../public/excalidraw/fonts",
  "../public/pglite",
]) {
  await rm(new URL(path, import.meta.url), { recursive: true, force: true });
  await mkdir(new URL(path, import.meta.url), { recursive: true });
}
await cp(
  new URL("../node_modules/monaco-editor/min/vs", import.meta.url),
  new URL("../public/monaco/vs", import.meta.url),
  { recursive: true },
);
await patchMonacoSecurity();
await cp(
  new URL(
    "../node_modules/@excalidraw/excalidraw/dist/prod/fonts",
    import.meta.url,
  ),
  new URL("../public/excalidraw/fonts", import.meta.url),
  { recursive: true },
);
// SQL Workbench uses the in-memory core, not the optional extension archives,
// declaration files or alternative storage adapters. Literal imports are traced
// recursively and the WASM/data entrypoints are explicit and version-agnostic.
await copyRuntimeClosure(
  fileURLToPath(
    new URL("../node_modules/@electric-sql/pglite/dist", import.meta.url),
  ),
  fileURLToPath(new URL("../public/pglite", import.meta.url)),
  ["index.js", "pglite.wasm", "pglite.data", "initdb.wasm"],
);

// Optional transport compression; retain raw .data as a browser compatibility fallback.
const { compressPGlite } = await import("./compress-pglite.mjs");
await compressPGlite();
