import { cp, mkdir } from "node:fs/promises";
import { patchMonacoSecurity } from './patch-monaco-security.mjs';
await mkdir(new URL("../public/monaco/", import.meta.url), { recursive: true });
await cp(
  new URL("../node_modules/monaco-editor/min/vs", import.meta.url),
  new URL("../public/monaco/vs", import.meta.url),
  { recursive: true },
);
await patchMonacoSecurity();
await mkdir(new URL('../public/excalidraw/', import.meta.url), { recursive:true });
await cp(new URL('../node_modules/@excalidraw/excalidraw/dist/prod/fonts', import.meta.url), new URL('../public/excalidraw/fonts', import.meta.url), { recursive:true });
await mkdir(new URL('../public/pglite/', import.meta.url), { recursive:true });
await cp(new URL('../node_modules/@electric-sql/pglite/dist', import.meta.url), new URL('../public/pglite', import.meta.url), { recursive:true, filter:source => !/\.(map|cjs|ts)$/.test(source) });
