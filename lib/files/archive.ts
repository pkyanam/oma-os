import { zip, Unzip, UnzipInflate, strFromU8 } from "fflate";
export const MAX_ARCHIVE_BYTES = 128 * 1024 * 1024;
export const MAX_ARCHIVE_FILES = 5000;
export function safeArchivePath(path: string) {
  if (
    !path ||
    path.startsWith("/") ||
    path.includes("\\") ||
    /[\x00-\x1f]/.test(path) ||
    /^[A-Za-z]:/.test(path)
  )
    throw new Error("Archive contains an unsafe path.");
  const parts = path.endsWith("/")
    ? path.slice(0, -1).split("/")
    : path.split("/");
  if (parts.some((part) => !part || part === ".." || part === "."))
    throw new Error("Archive contains a path traversal or ambiguous path.");
  if (parts.length > 64 || path.length > 4096)
    throw new Error("Archive path is too deeply nested or too long.");
  return path;
}
export async function archiveEntries(
  entries: Record<string, Uint8Array>,
): Promise<Uint8Array> {
  let total = 0;
  if (Object.keys(entries).length > MAX_ARCHIVE_FILES)
    throw new Error("Archive exceeds 5,000 files.");
  for (const [path, data] of Object.entries(entries)) {
    safeArchivePath(path);
    if (path === "__proto__")
      throw new Error(
        "Rename the file __proto__ before including it at the root of a ZIP archive.",
      );
    total += data.byteLength;
  }
  if (total > MAX_ARCHIVE_BYTES)
    throw new Error("Archive exceeds 128 MB. Export smaller folders.");
  return new Promise((resolve, reject) =>
    zip(entries, { level: 3 }, (error, data) =>
      error ? reject(error) : resolve(data),
    ),
  );
}
const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++)
    value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  return value >>> 0;
});
function updateCRC(crc: number, data: Uint8Array) {
  for (const byte of data) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255];
  return crc >>> 0;
}
type ArchiveEntry = {
  size: number;
  compressed: number;
  crc: number;
  method: number;
  offset: number;
};
/** Validate metadata without allocating a buffer based on an archive-provided size. */
function directory(data: Uint8Array, byteLimit: number, fileLimit: number) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const u16 = (offset: number) => view.getUint16(offset, true),
    u32 = (offset: number) => view.getUint32(offset, true);
  let end = -1;
  for (
    let offset = data.length - 22;
    offset >= Math.max(0, data.length - 65557);
    offset--
  )
    if (
      u32(offset) === 0x06054b50 &&
      offset + 22 + u16(offset + 20) === data.length
    ) {
      end = offset;
      break;
    }
  if (end < 0) throw new Error("Invalid or truncated ZIP archive.");
  if (u16(end + 4) || u16(end + 6) || u16(end + 8) !== u16(end + 10))
    throw new Error("Split ZIP archives are not supported.");
  const count = u16(end + 10),
    size = u32(end + 12),
    start = u32(end + 16);
  if (count === 65535 || size === 0xffffffff || start === 0xffffffff)
    throw new Error("ZIP64 archives are not supported.");
  if (count > fileLimit || start + size !== end)
    throw new Error("ZIP directory is invalid or exceeds the file limit.");
  const entries = new Map<string, ArchiveEntry>();
  let offset = start,
    total = 0;
  for (let index = 0; index < count; index++) {
    if (offset + 46 > end || u32(offset) !== 0x02014b50)
      throw new Error("Invalid ZIP directory entry.");
    const flags = u16(offset + 8),
      method = u16(offset + 10),
      compressed = u32(offset + 20),
      original = u32(offset + 24),
      nameLength = u16(offset + 28),
      extra = u16(offset + 30),
      comment = u16(offset + 32),
      local = u32(offset + 42);
    if (flags & 1) throw new Error("Encrypted ZIP files are not supported.");
    if (![0, 8].includes(method))
      throw new Error("This ZIP compression method is not supported.");
    if (offset + 46 + nameLength + extra + comment > end || local + 30 > start)
      throw new Error("Invalid ZIP entry bounds.");
    const name = safeArchivePath(
      strFromU8(
        data.subarray(offset + 46, offset + 46 + nameLength),
        !(flags & 2048),
      ),
    );
    if (
      entries.has(name) ||
      entries.has(name.replace(/\/$/, "")) ||
      entries.has(name + "/")
    )
      throw new Error("ZIP contains duplicate file paths.");
    if ((total += original) > byteLimit)
      throw new Error("Expanded archive exceeds the byte limit.");
    if (u32(local) !== 0x04034b50) throw new Error("Invalid ZIP local header.");
    const localFlags = u16(local + 6),
      localMethod = u16(local + 8),
      localNameLength = u16(local + 26),
      localExtra = u16(local + 28),
      body = local + 30 + localNameLength + localExtra;
    if (
      body + compressed > start ||
      localFlags !== flags ||
      localMethod !== method
    )
      throw new Error("ZIP headers disagree.");
    const localName = strFromU8(
      data.subarray(local + 30, local + 30 + localNameLength),
      !(flags & 2048),
    );
    if (localName !== name) throw new Error("ZIP file names disagree.");
    if (
      !(flags & 8) &&
      (u32(local + 18) !== compressed ||
        u32(local + 22) !== original ||
        u32(local + 14) !== u32(offset + 16))
    )
      throw new Error("ZIP file sizes or checksums disagree.");
    entries.set(name, {
      size: original,
      compressed,
      crc: u32(offset + 16),
      method,
      offset: local,
    });
    offset += 46 + nameLength + extra + comment;
  }
  if (offset !== end)
    throw new Error("ZIP directory size does not match its contents.");
  for (const name of entries.keys()) {
    const parts = name.replace(/\/$/, "").split("/");
    for (let n = 1; n < parts.length; n++)
      if (entries.has(parts.slice(0, n).join("/")))
        throw new Error("ZIP uses a file as a parent folder.");
  }
  return entries;
}
export async function extractArchive(
  data: Uint8Array,
  options: { maxBytes?: number; maxFiles?: number } = {},
): Promise<Record<string, Uint8Array>> {
  if (
    [options.maxBytes, options.maxFiles].some(
      (value) => value !== undefined && (!Number.isFinite(value) || value < 0),
    )
  )
    throw new Error("Archive limits must be finite, non-negative numbers.");
  const byteLimit = Math.min(
      MAX_ARCHIVE_BYTES,
      Math.max(0, options.maxBytes ?? MAX_ARCHIVE_BYTES),
    ),
    fileLimit = Math.min(
      MAX_ARCHIVE_FILES,
      Math.max(0, options.maxFiles ?? MAX_ARCHIVE_FILES),
    );
  if (data.byteLength > MAX_ARCHIVE_BYTES)
    throw new Error("Archive exceeds 128 MB.");
  const expected = directory(data, byteLimit, fileLimit),
    files: Record<string, Uint8Array> = Object.create(null),
    seen = new Set<string>();
  let total = 0,
    completed = 0;
  const stream = new Unzip((file) => {
    const name = safeArchivePath(file.name),
      metadata = expected.get(name);
    if (!metadata || seen.has(name))
      throw new Error("ZIP contains unexpected or duplicate local entries.");
    seen.add(name);
    const chunks: Uint8Array[] = [];
    let size = 0,
      crc = 0xffffffff;
    file.ondata = (error, chunk, final) => {
      if (error) throw error;
      // UnzipInflate keeps a 32 KB history. Feeding 1 KB input chunks bounds
      // transient expansion independently of untrusted advertised file sizes.
      total += chunk.byteLength;
      size += chunk.byteLength;
      if (total > byteLimit || size > metadata.size)
        throw new Error(
          "Expanded archive exceeds its declared size or byte limit.",
        );
      crc = updateCRC(crc, chunk);
      if (chunk.length) chunks.push(chunk);
      if (final) {
        if (size !== metadata.size || (crc ^ 0xffffffff) >>> 0 !== metadata.crc)
          throw new Error("ZIP checksum or file size mismatch.");
        const result = new Uint8Array(size);
        let offset = 0;
        for (const item of chunks) {
          result.set(item, offset);
          offset += item.length;
        }
        files[name] = result;
        chunks.length = 0;
        completed++;
      }
    };
    file.start();
  });
  stream.register(UnzipInflate);
  for (let offset = 0; offset < data.length; offset += 1024) {
    stream.push(
      data.subarray(offset, offset + 1024),
      offset + 1024 >= data.length,
    );
    if (offset && offset % (256 * 1024) === 0)
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  if (completed !== expected.size) throw new Error("ZIP is missing file data.");
  return files;
}
