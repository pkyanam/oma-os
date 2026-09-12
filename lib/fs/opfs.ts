export type BlobFingerprint = { size: number; sha256: string };
export async function fingerprintBlob(blob: Blob): Promise<BlobFingerprint> {
  const hash = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return {
    size: blob.size,
    sha256: Array.from(new Uint8Array(hash), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join(""),
  };
}
export type Entry = {
  name: string;
  path: string;
  kind: "file" | "directory";
  size?: number;
};
export function normalize(path: string): string {
  const parts: string[] = [];
  for (const part of (path.startsWith("/")
    ? path
    : "/home/guest/" + path
  ).split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      parts.pop();
      continue;
    }
    if (part.includes("\0")) throw new Error("Invalid path");
    parts.push(part);
  }
  return "/" + parts.join("/");
}
async function root() {
  if (!navigator.storage?.getDirectory)
    throw new Error(
      "OPFS is unavailable. Use a current browser on localhost or HTTPS.",
    );
  return navigator.storage.getDirectory();
}
async function directory(path: string, create = false) {
  let dir = await root();
  for (const name of normalize(path).split("/").filter(Boolean))
    dir = await dir.getDirectoryHandle(name, { create });
  return dir;
}
async function parent(path: string, create = false) {
  const full = normalize(path),
    parts = full.split("/").filter(Boolean),
    name = parts.pop();
  if (!name) throw new Error("A file path is required");
  return { dir: await directory("/" + parts.join("/"), create), name };
}
const pendingWrites = new Map<string, Promise<unknown>>();
async function fileLock<T>(path: string, work: () => Promise<T>): Promise<T> {
  const key = "oma-file:" + normalize(path);
  if (navigator.locks) return navigator.locks.request(key, work);
  // Web Locks coordinate tabs. This fallback still serializes writers in this tab.
  const previous = pendingWrites.get(key) || Promise.resolve();
  const next = previous.catch(() => {}).then(work);
  pendingWrites.set(key, next);
  try {
    return await next;
  } finally {
    if (pendingWrites.get(key) === next) pendingWrites.delete(key);
  }
}
async function save(
  path: string,
  body: string | Blob,
  expected?: string,
  overwrite = true,
  fingerprint?: BlobFingerprint,
  guard?: () => void,
) {
  return fileLock(path, async () => {
    const { dir, name } = await parent(path);
    let file: FileSystemFileHandle,
      existed = true;
    try {
      file = await dir.getFileHandle(name);
    } catch (error) {
      if (!(error instanceof DOMException) || error.name !== "NotFoundError")
        throw error;
      if (expected !== undefined || fingerprint !== undefined)
        throw new Error(
          "File was deleted on disk. Your buffer is preserved; explicitly save a new copy to recreate it.",
        );
      existed = false;
      file = await dir.getFileHandle(name, { create: true });
    }
    if (existed && !overwrite)
      throw new Error("A file or folder already exists at this path.");
    if (
      expected !== undefined &&
      (await (await file.getFile()).text()) !== expected
    )
      throw new Error(
        "File changed on disk. Your buffer is preserved. Reload the disk version or explicitly overwrite it.",
      );
    if (fingerprint) {
      const actual = await fingerprintBlob(await file.getFile());
      if (
        actual.size !== fingerprint.size ||
        actual.sha256 !== fingerprint.sha256
      )
        throw new Error(
          "File changed since the backup preview. Inspect the backup again before replacing it.",
        );
    }
    let stream: FileSystemWritableFileStream | undefined;
    try {
      guard?.();
      stream = await file.createWritable();
      guard?.();
      await stream.write(body);
      guard?.();
      await stream.close();
    } catch (error) {
      await stream?.abort().catch(() => {});
      // Failed creation must not leave an empty file that looks successfully saved.
      if (!existed) await dir.removeEntry(name).catch(() => {});
      throw error;
    }
  });
}
export const fs = {
  normalize,
  async ls(path = "/home/guest"): Promise<Entry[]> {
    const full = normalize(path),
      dir = await directory(full),
      items: Entry[] = [];
    for await (const [name, handle] of (
      dir as FileSystemDirectoryHandle & {
        entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
      }
    ).entries()) {
      items.push({
        name,
        path: full === "/" ? "/" + name : full + "/" + name,
        kind: handle.kind,
        ...(handle.kind === "file"
          ? { size: (await (handle as FileSystemFileHandle).getFile()).size }
          : {}),
      });
    }
    return items.sort((a, b) =>
      a.kind === b.kind
        ? a.name.localeCompare(b.name)
        : a.kind === "directory"
          ? -1
          : 1,
    );
  },
  async read(path: string) {
    return (await fs.readBlob(path)).text();
  },
  async readBlob(path: string): Promise<File> {
    const { dir, name } = await parent(path);
    return (await dir.getFileHandle(name)).getFile();
  },
  async stat(path: string): Promise<Entry> {
    const full = normalize(path);
    if (full === "/") return { name: "/", path: "/", kind: "directory" };
    const { dir, name } = await parent(full);
    try {
      const file = await (await dir.getFileHandle(name)).getFile();
      return { name, path: full, kind: "file", size: file.size };
    } catch (error) {
      if (
        !(error instanceof DOMException) ||
        error.name !== "TypeMismatchError"
      )
        throw error;
      await dir.getDirectoryHandle(name);
      return { name, path: full, kind: "directory" };
    }
  },
  async writeBlob(
    path: string,
    body: Blob,
    options: {
      overwrite?: boolean;
      expected?: BlobFingerprint;
      guard?: () => void;
    } = {},
  ) {
    await save(
      path,
      body,
      undefined,
      options.overwrite !== false,
      options.expected,
      options.guard,
    );
  },
  async write(path: string, body: string, expected?: string) {
    await save(path, body, expected);
  },
  async touch(path: string) {
    await fileLock(path, async () => {
      const { dir, name } = await parent(path);
      await dir.getFileHandle(name, { create: true });
    });
  },
  async mkdir(path: string) {
    await directory(path, true);
  },
  async rm(path: string) {
    const full = normalize(path);
    if (
      full === "/" ||
      full === "/home" ||
      full === "/home/guest" ||
      full === "/.oma"
    )
      throw new Error(
        "Protected directory. Use oma reset --yes to reset the machine.",
      );
    await fileLock(full, async () => {
      const { dir, name } = await parent(full);
      await dir.removeEntry(name);
    });
  },
  async exists(path: string) {
    try {
      await fs.stat(path);
      return true;
    } catch (error) {
      if (error instanceof DOMException && error.name === "NotFoundError")
        return false;
      throw error;
    }
  },
  async reset() {
    const dir = await root();
    for await (const [name] of (
      dir as FileSystemDirectoryHandle & {
        entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
      }
    ).entries())
      await dir.removeEntry(name, { recursive: true });
  },
  async search(path = "/home/guest", limit = 20): Promise<Entry[]> {
    const result: Entry[] = [];
    const walk = async (p: string, depth: number) => {
      if (depth > 8 || result.length >= limit) return;
      for (const entry of await fs.ls(p)) {
        if (result.length >= limit) return;
        if (entry.kind === "directory") await walk(entry.path, depth + 1);
        else result.push(entry);
      }
    };
    await walk(path, 0);
    return result;
  },
};
export function errorMessage(error: unknown) {
  if (error instanceof DOMException && error.name === "NotFoundError")
    return "No such file or directory";
  return error instanceof Error ? error.message : String(error);
}
