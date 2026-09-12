import { fs, normalize, type Entry } from "../fs/opfs";
import { joinPath } from "./kinds";
export interface FilePort {
  ls(path: string): Promise<Entry[]>;
  readBlob(path: string): Promise<Blob>;
  writeBlob(
    path: string,
    data: Blob,
    options?: { overwrite?: boolean },
  ): Promise<void>;
  mkdir(path: string): Promise<void>;
  rm(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
}
export function assertMutable(path: string) {
  if (["/", "/home", "/home/guest", "/.oma"].includes(normalize(path)))
    throw new Error("This system directory is protected.");
}
export function assertDestination(source: string, target: string) {
  const from = normalize(source),
    to = normalize(target);
  if (from === to || to.startsWith(from + "/"))
    throw new Error("Choose a destination outside the source folder.");
}
export async function uniquePath(
  parent: string,
  filename: string,
  port: FilePort = fs,
) {
  let target = joinPath(parent, filename);
  const dot = filename.lastIndexOf("."),
    stem = dot > 0 ? filename.slice(0, dot) : filename,
    ext = dot > 0 ? filename.slice(dot) : "";
  for (let n = 2; await port.exists(target); n++) {
    if (n > 10000) throw new Error("Too many files with the same name.");
    target = joinPath(parent, `${stem} (${n})${ext}`);
  }
  return target;
}
export async function removeTree(entry: Entry, port: FilePort = fs) {
  assertMutable(entry.path);
  if (entry.kind === "directory")
    for (const child of await port.ls(entry.path))
      await removeTree(child, port);
  await port.rm(entry.path);
}
export async function copyEntry(
  entry: Entry,
  destination: string,
  port: FilePort = fs,
  depth = 0,
) {
  assertDestination(entry.path, destination);
  if (depth > 64) throw new Error("Folder nesting exceeds 64 levels.");
  if (await port.exists(destination))
    throw new Error("An item already exists at that destination.");
  if (entry.kind === "file")
    return port.writeBlob(destination, await port.readBlob(entry.path), {
      overwrite: false,
    });
  await port.mkdir(destination);
  for (const child of await port.ls(entry.path))
    await copyEntry(child, joinPath(destination, child.name), port, depth + 1);
}
export async function moveEntry(
  entry: Entry,
  destination: string,
  port: FilePort = fs,
) {
  assertMutable(entry.path);
  await copyEntry(entry, destination, port);
  await removeTree(entry, port);
}
export async function importFiles(
  parent: string,
  files: File[],
  port: FilePort = fs,
  onProgress?: (done: number, total: number) => void,
) {
  const imported: string[] = [];
  for (const file of files) {
    if (file.size > 512 * 1024 * 1024)
      throw new Error(`${file.name} exceeds the 512 MB import limit.`);
    const target = await uniquePath(parent, file.name, port);
    await port.writeBlob(target, file, { overwrite: false });
    imported.push(target);
    onProgress?.(imported.length, files.length);
  }
  return imported;
}
export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
