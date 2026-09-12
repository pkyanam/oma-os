import { cp, mkdir } from 'node:fs/promises';
await mkdir(new URL('../public/monaco/',import.meta.url),{recursive:true});
await cp(new URL('../node_modules/monaco-editor/min/vs',import.meta.url),new URL('../public/monaco/vs',import.meta.url),{recursive:true});
