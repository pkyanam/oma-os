import type { IFileSystem } from "just-bash/browser";
import { normalize } from "../fs/opfs";
import { scopedPath, privateAgentPath } from "./scope";
const denied = (): never => {
  throw new Error(
    "EROFS: agent shell is read-only. Use the filesystem tool to request a reviewed change.",
  );
};
const virtualParents = ["/", "/home"];
/** A capability boundary over the filesystem, independent of shell syntax or command names. */
export class ReadOnlyAgentFs implements IFileSystem {
  constructor(private readonly source: IFileSystem) {}
  private path(path: string) {
    return scopedPath({ normalize }, path);
  }
  private async checked(path: string) {
    const full = this.path(path);
    const parts = full.split("/").filter(Boolean);
    for (let index = 1; index <= parts.length; index++) {
      const prefix = "/" + parts.slice(0, index).join("/");
      if (virtualParents.includes(prefix)) continue;
      if ((await this.source.lstat(prefix)).isSymbolicLink)
        throw new Error(
          "EACCES: symbolic links are not available to the agent.",
        );
    }
    return full;
  }
  resolvePath(base: string, path: string) {
    return normalize(path.startsWith("/") ? path : `${base}/${path}`);
  }
  getAllPaths() {
    return this.source.getAllPaths().filter((path) => {
      try {
        this.path(path);
        return true;
      } catch {
        return false;
      }
    });
  }
  async readFile(
    path: string,
    options?: Parameters<IFileSystem["readFile"]>[1],
  ) {
    return this.source.readFile(await this.checked(path), options);
  }
  async readFileBuffer(path: string) {
    return this.source.readFileBuffer(await this.checked(path));
  }
  async exists(path: string) {
    const full = normalize(path);
    if (virtualParents.includes(full)) return true;
    try {
      return await this.source.exists(await this.checked(full));
    } catch {
      return false;
    }
  }
  async stat(path: string) {
    const full = normalize(path);
    if (virtualParents.includes(full))
      return {
        isFile: false,
        isDirectory: true,
        isSymbolicLink: false,
        size: 0,
        mode: 0o555,
        mtime: new Date(0),
      };
    const stat = await this.source.stat(await this.checked(full));
    if (stat.isSymbolicLink)
      throw new Error("EACCES: symbolic links are not available to the agent.");
    return stat;
  }
  lstat(path: string) {
    return this.stat(path);
  }
  async readdir(path: string) {
    const full = normalize(path);
    if (full === "/") return ["home", ".oma"];
    if (full === "/home") return ["guest"];
    return (await this.source.readdir(await this.checked(full))).filter(
      (name) => !privateAgentPath(`${full}/${name}`),
    );
  }
  async readdirWithFileTypes(path: string) {
    const full = normalize(path);
    if (virtualParents.includes(full))
      return (await this.readdir(full)).map((name) => ({
        name,
        isFile: false,
        isDirectory: true,
        isSymbolicLink: false,
      }));
    const checked = await this.checked(full);
    const entries = this.source.readdirWithFileTypes
      ? await this.source.readdirWithFileTypes(checked)
      : await Promise.all(
          (await this.readdir(checked)).map(async (name) => ({
            name,
            ...(await this.source.lstat(`${checked}/${name}`)),
          })),
        );
    return entries.filter(
      (entry) =>
        !entry.isSymbolicLink && !privateAgentPath(`${full}/${entry.name}`),
    );
  }
  async realpath(path: string) {
    const full = normalize(path);
    await this.stat(full);
    return full;
  }
  async readlink(): Promise<string> {
    throw new Error("EACCES: symbolic links are not available to the agent.");
  }
  async writeFile(): Promise<void> {
    denied();
  }
  async appendFile(): Promise<void> {
    denied();
  }
  async mkdir(): Promise<void> {
    denied();
  }
  async rm(): Promise<void> {
    denied();
  }
  async cp(): Promise<void> {
    denied();
  }
  async mv(): Promise<void> {
    denied();
  }
  async chmod(): Promise<void> {
    denied();
  }
  async utimes(): Promise<void> {
    denied();
  }
  async symlink(): Promise<void> {
    denied();
  }
  async link(): Promise<void> {
    denied();
  }
}
