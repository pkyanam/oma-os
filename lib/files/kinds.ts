export type FileKind =
  "image" | "audio" | "video" | "pdf" | "html" | "text" | "binary";
const images = /\.(png|jpe?g|gif|webp|avif|bmp|svg|ico)$/i;
const audio = /\.(mp3|wav|ogg|m4a|aac|flac|opus)$/i;
const video = /\.(mp4|webm|mov|m4v|ogv)$/i;
export function fileKind(path: string): FileKind {
  if (images.test(path)) return "image";
  if (audio.test(path)) return "audio";
  if (video.test(path)) return "video";
  if (/\.pdf$/i.test(path)) return "pdf";
  if (/\.html?$/i.test(path)) return "html";
  if (
    /\.(zip|gz|7z|wasm|exe|bin|woff2?|ttf|otf|docx?|xlsx?|pptx?|odt|ods|dmg|iso|sqlite|db)$/i.test(
      path,
    )
  )
    return "binary";
  return "text";
}
export function appForPath(
  path: string,
): "editor" | "browser" | "media" | "data" | "lab" | "notes" | "canvas" | "tasks" | "draw" | "database" {
  if (/\.excalidraw$/i.test(path)) return 'draw';
  if (/\.sql$/i.test(path)) return 'database';
  if (/\.oma-notes\.json$/i.test(path)) return 'notes';
  if (/\.oma-canvas\.json$/i.test(path)) return 'canvas';
  if (/\.oma-tasks\.json$/i.test(path)) return 'tasks';
  if (/\.csv$/i.test(path)) return "data";
  if (/\.py$/i.test(path)) return "lab";
  const kind = fileKind(path);
  return kind === "html"
    ? "browser"
    : ["image", "audio", "video", "pdf", "binary"].includes(kind)
      ? "media"
      : "editor";
}
export function mimeType(path: string) {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  return (
    (
      {
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        gif: "image/gif",
        webp: "image/webp",
        avif: "image/avif",
        bmp: "image/bmp",
        svg: "image/svg+xml",
        ico: "image/x-icon",
        mp3: "audio/mpeg",
        wav: "audio/wav",
        ogg: "audio/ogg",
        opus: "audio/ogg",
        m4a: "audio/mp4",
        aac: "audio/aac",
        flac: "audio/flac",
        mp4: "video/mp4",
        webm: "video/webm",
        mov: "video/quicktime",
        m4v: "video/mp4",
        ogv: "video/ogg",
        pdf: "application/pdf",
        html: "text/html",
        txt: "text/plain",
      } as Record<string, string>
    )[ext] || "application/octet-stream"
  );
}
export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}
export function validName(name: string) {
  const clean = name.trim();
  if (!clean || clean === "." || clean === ".." || /[\x00-\x1f/\\]/.test(clean))
    throw new Error("Use a name without slashes or control characters.");
  if (clean.length > 240) throw new Error("Keep names under 240 characters.");
  return clean;
}
export function joinPath(parent: string, name: string) {
  return `${parent === "/" ? "" : parent}/${validName(name)}`;
}
