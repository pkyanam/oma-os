import { fs, fingerprintBlob, type BlobFingerprint } from "./opfs";
import {
  archiveEntries,
  extractArchive,
  safeArchivePath,
  MAX_ARCHIVE_BYTES,
  MAX_ARCHIVE_FILES,
} from "@/lib/files/archive";
export type BackupManifest = {
  format: "oma.os.backup";
  version: 1;
  createdAt: string;
  files: number;
  bytes: number;
  directories: string[];
};
type BackupStorage = Pick<typeof fs, "ls" | "readBlob" | "mkdir" | "writeBlob">;
const MANIFEST = "oma-backup.json";
export function backupPath(path: string) {
  safeArchivePath(path);
  if (
    !(path.startsWith("home/guest/") || path.startsWith(".oma/")) ||
    path.includes("\\") ||
    path.split("/").some((part) => !part || part === "." || part === "..")
  )
    throw new Error(
      "Backup contains files outside the oma.os home and configuration directories.",
    );
  return "/" + path;
}
export async function createBackup(storage: BackupStorage = fs) {
  const entries: Record<string, Uint8Array> = Object.create(null),
    directories: string[] = [];
  let bytes = 0,
    count = 0;
  const walk = async (path: string) => {
    directories.push(path);
    if (directories.length > MAX_ARCHIVE_FILES)
      throw new Error("Too many directories for one backup.");
    for (const entry of await storage.ls(path)) {
      if (entry.kind === "directory") await walk(entry.path);
      else {
        const file = await storage.readBlob(entry.path);
        if (
          ++count >= MAX_ARCHIVE_FILES ||
          (bytes += file.size) > MAX_ARCHIVE_BYTES
        )
          throw new Error(
            "Backup exceeds 128 MB or 4,999 files. Export individual folders in Files.",
          );
        entries[entry.path.slice(1)] = new Uint8Array(await file.arrayBuffer());
      }
    }
  };
  await walk("/home/guest");
  await walk("/.oma");
  const manifest: BackupManifest = {
    format: "oma.os.backup",
    version: 1,
    createdAt: new Date().toISOString(),
    files: count,
    bytes,
    directories,
  };
  entries[MANIFEST] = new TextEncoder().encode(
    JSON.stringify(manifest, null, 2),
  );
  return { data: await archiveEntries(entries), manifest };
}
export function validateBackupManifest(
  value: unknown,
  entries: Record<string, Uint8Array>,
): BackupManifest {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid backup manifest.");
  const manifest = value as BackupManifest;
  if (
    manifest.format !== "oma.os.backup" ||
    manifest.version !== 1 ||
    !Array.isArray(manifest.directories) ||
    typeof manifest.createdAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T/.test(manifest.createdAt) ||
    !Number.isFinite(Date.parse(manifest.createdAt)) ||
    !Number.isSafeInteger(manifest.files) ||
    manifest.files < 0 ||
    !Number.isSafeInteger(manifest.bytes) ||
    manifest.bytes < 0
  )
    throw new Error("Unsupported backup format.");
  const paths = Object.keys(entries),
    bytes = Object.values(entries).reduce(
      (sum, data) => sum + data.byteLength,
      0,
    );
  if (manifest.files !== paths.length || manifest.bytes !== bytes)
    throw new Error(
      "Backup manifest file count or byte total does not match its contents.",
    );
  if (paths.length >= MAX_ARCHIVE_FILES || bytes > MAX_ARCHIVE_BYTES)
    throw new Error("Backup exceeds file or byte limits.");
  paths.forEach(backupPath);
  if (manifest.directories.length > MAX_ARCHIVE_FILES)
    throw new Error("Invalid backup directory list.");
  const directories = new Set<string>();
  for (const path of manifest.directories) {
    if (
      typeof path !== "string" ||
      directories.has(path) ||
      !(
        path === "/home/guest" ||
        path === "/.oma" ||
        (path.startsWith("/") && backupPath(path.slice(1)) === path)
      )
    )
      throw new Error("Invalid or duplicate backup directory.");
    directories.add(path);
    if (Object.hasOwn(entries, path.slice(1)))
      throw new Error("Backup has a file and directory at the same path.");
  }
  if (!directories.has("/home/guest") || !directories.has("/.oma"))
    throw new Error("Backup is missing its root directories.");
  for (const path of [...paths.map((p) => "/" + p), ...directories]) {
    let parent = path.slice(0, path.lastIndexOf("/"));
    while (parent.startsWith("/home/guest") || parent.startsWith("/.oma")) {
      if (!directories.has(parent))
        throw new Error(
          "Backup directory list does not describe every parent folder.",
        );
      if (Object.hasOwn(entries, parent.slice(1)))
        throw new Error("Backup uses a file as a parent directory.");
      parent = parent.slice(0, parent.lastIndexOf("/"));
    }
  }
  return { ...manifest, directories: [...directories] };
}
export async function inspectBackup(
  data: Uint8Array,
  storage: BackupStorage = fs,
) {
  const entries = await extractArchive(data);
  if (!entries[MANIFEST])
    throw new Error(
      "This ZIP is not an oma.os backup. Import ordinary ZIPs through Files.",
    );
  let parsed: unknown;
  try {
    parsed = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(entries[MANIFEST]),
    );
  } catch {
    throw new Error("Backup manifest is not valid UTF-8 JSON.");
  }
  delete entries[MANIFEST];
  const manifest = validateBackupManifest(parsed, entries),
    paths = Object.keys(entries),
    existing: string[] = [],
    baselines: Record<string, BlobFingerprint | null> = Object.create(null);
  for (const path of paths) {
    try {
      baselines[path] = await fingerprintBlob(
        await storage.readBlob("/" + path),
      );
      existing.push(path);
    } catch (error) {
      if (error instanceof DOMException && error.name === "NotFoundError")
        baselines[path] = null;
      else
        throw new Error(
          `Cannot inspect destination /${path}: ${error instanceof Error ? error.message : String(error)}`,
        );
    }
  }
  return {
    manifest,
    entries,
    paths,
    existing,
    baselines,
    bytes: manifest.bytes,
  };
}
export type BackupPreview = Awaited<ReturnType<typeof inspectBackup>>;
export async function restoreBackup(
  preview: BackupPreview,
  overwrite = false,
  options: { storage?: BackupStorage; beforeWrite?: () => void } = {},
) {
  const storage = options.storage ?? fs;
  validateBackupManifest(preview.manifest, preview.entries);
  const result = {
    restored: 0,
    skipped: 0,
    failures: [] as string[],
    stopped: "",
  };
  const guard = () => options.beforeWrite?.();
  const check = () => {
    try {
      guard();
      return true;
    } catch (error) {
      result.stopped = error instanceof Error ? error.message : String(error);
      return false;
    }
  };
  for (const path of [...preview.manifest.directories].sort(
    (a, b) => a.length - b.length,
  )) {
    if (!check()) return result;
    try {
      await storage.mkdir(path);
    } catch (error) {
      result.failures.push(
        `${path}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  for (const [relative, data] of Object.entries(preview.entries)) {
    if (!check()) break;
    const path = backupPath(relative),
      baseline = preview.baselines[relative];
    try {
      if (!Object.hasOwn(preview.baselines, relative))
        throw new Error(
          "Missing destination preview. Inspect the backup again.",
        );
      if (!overwrite && baseline) {
        result.skipped++;
        continue;
      }
      await storage.writeBlob(path, new Blob([new Uint8Array(data)]), {
        overwrite: !!baseline && overwrite,
        expected: baseline ?? undefined,
        guard,
      });
      result.restored++;
    } catch (error) {
      result.failures.push(
        `${path}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return result;
}
