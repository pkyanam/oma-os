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
/** Only keyboard/focus messages leave the isolated local app. No file access bridge. */
export const localKeyboardBridge = `<script>addEventListener('keydown',function(e){var letter=/^(Key[AHJKLEFQTW]|Digit[1-9]|Enter|Space|Equal|Minus|ArrowLeft|ArrowRight|ArrowUp|ArrowDown)$/.test(e.code);if((e.metaKey&&e.code==='KeyK')||(e.ctrlKey&&e.code==='Period')||((e.altKey||(e.ctrlKey&&e.shiftKey))&&letter)||(e.ctrlKey&&e.code==='Space')){e.preventDefault();parent.postMessage({type:'oma:shortcut',code:e.code,key:e.key,altKey:e.altKey,ctrlKey:e.ctrlKey,shiftKey:e.shiftKey,metaKey:e.metaKey},'*');}},true);addEventListener('pointerdown',function(){parent.postMessage({type:'oma:focus'},'*');},true);<\/script>`;

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
