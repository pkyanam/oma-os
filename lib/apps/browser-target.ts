import { normalize } from "@/lib/fs/opfs";
export function browserTarget(input: string) {
  const value = input.trim();
  if (value.length > 4096) throw new Error("The address is too long.");
  if (!value || value === "oma:start") return "oma:start";
  if (value.startsWith("/")) return normalize(value);
  if (/^(javascript|data|file|vbscript):/i.test(value))
    throw new Error("Use an http(s) URL or a local HTML file path.");
  if (
    !value.includes("://") &&
    (/\s/.test(value) ||
      (!value.includes(".") && !/^localhost(:\d+)?(\/|$)/.test(value)))
  )
    return "https://www.google.com/search?q=" + encodeURIComponent(value);
  const url = new URL(value.includes("://") ? value : "https://" + value);
  if (
    url.username ||
    url.password ||
    !["http:", "https:"].includes(url.protocol) ||
    /^(javascript|data|file|vbscript):/i.test(value)
  )
    throw new Error("Use an http(s) URL or a local HTML file path.");
  return url.href;
}
export { localKeyboardBridge } from "../browser/keyboard-bridge";

export function externalOnly(url: string): string | null {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (
      /(^|\.)google\.[a-z.]+$/.test(host) ||
      ["github.com", "chatgpt.com", "www.youtube.com", "youtube.com"].includes(
        host,
      )
    )
      return host;
    return null;
  } catch {
    return null;
  }
}
export function embedURL(input: string) {
  const url = new URL(input);
  if (/(^|\.)google\.[a-z.]+$/.test(url.hostname)) {
    if (url.pathname === "/") url.pathname = "/webhp";
    url.searchParams.set("igu", "1");
  }
  return url.href;
}
