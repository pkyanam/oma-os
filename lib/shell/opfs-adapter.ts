import type { IFileSystem } from "just-bash/browser";
import { fs as browserFs } from "@/lib/fs/opfs";

type Backend = Pick<
  typeof browserFs,
  | "normalize"
  | "readBlob"
  | "writeBlob"
  | "write"
  | "ls"
  | "stat"
  | "exists"
  | "mkdir"
  | "rm"
>;
type ReadOptions = Parameters<IFileSystem["readFile"]>[1];
type WriteOptions = Parameters<IFileSystem["writeFile"]>[2];
const MAX_FILE = 16 * 1024 * 1024;
const encoding = (options: ReadOptions | WriteOptions) =>
  typeof options === "string" ? options : (options?.encoding ?? "utf8");
const bytesToLatin = (data: Uint8Array) => {
  let text = "";
  for (let i = 0; i < data.length; i += 8192)
    text += String.fromCharCode(...data.subarray(i, i + 8192));
  return text;
};
function encode(
  content: string | Uint8Array,
  options?: WriteOptions,
): Uint8Array {
  if (typeof content !== "string") return content;
  const kind = encoding(options);
  if (kind === "hex") {
    if (!/^(?:[a-f\d]{2})*$/i.test(content))
      throw new Error("EINVAL: invalid hex data");
    return Uint8Array.from(content.match(/../g) ?? [], (part) =>
      parseInt(part, 16),
    );
  }
  if (kind === "base64")
    return Uint8Array.from(atob(content), (char) => char.charCodeAt(0));
  if (["binary", "latin1", "ascii"].includes(kind))
    return Uint8Array.from(
      content,
      (char) => char.charCodeAt(0) & (kind === "ascii" ? 127 : 255),
    );
  return new TextEncoder().encode(content);
}

/** OPFS stores bytes and directories, not POSIX links or executable permissions. */
export class OpfsShellFs implements IFileSystem {
  private metadata = new Map<string, { mode?: number; mtime?: Date }>();
  constructor(
    private backend: Backend = browserFs,
    private changed: () => void = () => {},
  ) {}
  resolvePath(base: string, path: string) {
    return this.backend.normalize(
      path.startsWith("/") ? path : `${base}/${path}`,
    );
  }
  getAllPaths() {
    return [];
  }
  async readFileBuffer(path: string) {
    const file = await this.backend.readBlob(path);
    if (file.size > MAX_FILE)
      throw new Error("EFBIG: shell file limit is 16 MiB");
    return new Uint8Array(await file.arrayBuffer());
  }
  async readFile(path: string, options?: ReadOptions) {
    const bytes = await this.readFileBuffer(path),
      kind = encoding(options);
    if (kind === "base64") return btoa(bytesToLatin(bytes));
    if (kind === "hex")
      return Array.from(bytes, (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
    if (["binary", "latin1"].includes(kind)) return bytesToLatin(bytes);
    if (kind === "ascii") return bytesToLatin(bytes.map((byte) => byte & 127));
    return new TextDecoder().decode(bytes);
  }
  async writeFile(
    path: string,
    content: string | Uint8Array,
    options?: WriteOptions,
  ) {
    const bytes = encode(content, options);
    if (bytes.byteLength > MAX_FILE)
      throw new Error("EFBIG: shell file limit is 16 MiB");
    await this.backend.writeBlob(
      path,
      new Blob([bytes.slice().buffer as ArrayBuffer]),
    );
    this.changed();
  }
  async appendFile(
    path: string,
    content: string | Uint8Array,
    options?: WriteOptions,
  ) {
    if (!(await this.exists(path)))
      return this.writeFile(path, content, options);
    const before = await this.readFileBuffer(path),
      extra = encode(content, options);
    if (before.length + extra.length > MAX_FILE)
      throw new Error("EFBIG: shell file limit is 16 MiB");
    const combined = new Uint8Array(before.length + extra.length);
    combined.set(before);
    combined.set(extra, before.length);
    await this.writeFile(path, combined);
  }
  exists(path: string) {
    return this.backend.exists(path);
  }
  async stat(path: string) {
    const item = await this.backend.stat(path),
      meta = this.metadata.get(this.backend.normalize(path));
    return {
      isFile: item.kind === "file",
      isDirectory: item.kind === "directory",
      isSymbolicLink: false,
      size: item.size ?? 0,
      mode: meta?.mode ?? (item.kind === "directory" ? 0o755 : 0o644),
      mtime:
        meta?.mtime ??
        new Date(
          item.kind === "file"
            ? (await this.backend.readBlob(path)).lastModified
            : 0,
        ),
    };
  }
  lstat(path: string) {
    return this.stat(path);
  }
  async mkdir(path: string, options?: { recursive?: boolean }) {
    if (await this.exists(path)) {
      if (options?.recursive && (await this.stat(path)).isDirectory) return;
      throw new Error("EEXIST: path exists");
    }
    if (
      !options?.recursive &&
      !(await this.exists(this.resolvePath(path, "..")))
    )
      throw new Error("ENOENT: parent directory does not exist");
    await this.backend.mkdir(path);
    this.changed();
  }
  async readdir(path: string) {
    return (await this.backend.ls(path)).map((item) => item.name);
  }
  async readdirWithFileTypes(path: string) {
    return (await this.backend.ls(path)).map((item) => ({
      name: item.name,
      isFile: item.kind === "file",
      isDirectory: item.kind === "directory",
      isSymbolicLink: false,
    }));
  }
  async rm(path: string, options?: { recursive?: boolean; force?: boolean }) {
    const full = this.backend.normalize(path);
    if (["/", "/home", "/home/guest", "/.oma"].includes(full))
      throw new Error(
        "EPERM: protected desktop directory; use oma reset --yes",
      );
    if (!(await this.exists(full))) {
      if (options?.force) return;
      throw new Error("ENOENT: no such file");
    }
    if ((await this.stat(full)).isDirectory && options?.recursive)
      for (const child of await this.readdir(full))
        await this.rm(`${full}/${child}`, options);
    await this.backend.rm(full);
    this.changed();
  }
  async cp(src: string, dest: string, options?: { recursive?: boolean }) {
    const from = this.backend.normalize(src),
      to = this.backend.normalize(dest);
    if (from === to || to.startsWith(from + "/"))
      throw new Error("EINVAL: cannot copy a path into itself");
    if ((await this.stat(from)).isDirectory) {
      if (!options?.recursive)
        throw new Error("EISDIR: directory copy requires -r");
      await this.mkdir(to, { recursive: true });
      for (const child of await this.readdir(from))
        await this.cp(`${from}/${child}`, `${to}/${child}`, options);
    } else await this.writeFile(to, await this.readFileBuffer(from));
  }
  async mv(src: string, dest: string) {
    if (
      ["/", "/home", "/home/guest", "/.oma"].includes(
        this.backend.normalize(src),
      )
    )
      throw new Error("EPERM: protected desktop directory");
    await this.cp(src, dest, { recursive: true });
    await this.rm(src, { recursive: true });
  }
  async chmod(path: string, mode: number) {
    await this.stat(path);
    this.metadata.set(this.backend.normalize(path), {
      ...this.metadata.get(this.backend.normalize(path)),
      mode,
    });
  }
  async utimes(path: string, _atime: Date, mtime: Date) {
    await this.stat(path);
    this.metadata.set(this.backend.normalize(path), {
      ...this.metadata.get(this.backend.normalize(path)),
      mtime,
    });
  }
  async realpath(path: string) {
    await this.stat(path);
    return this.backend.normalize(path);
  }
  async symlink(): Promise<void> {
    throw new Error("ENOTSUP: OPFS does not support symbolic links");
  }
  async link(): Promise<void> {
    throw new Error("ENOTSUP: OPFS does not support hard links");
  }
  async readlink(): Promise<string> {
    throw new Error("EINVAL: OPFS paths are not symbolic links");
  }
}
