import { fs } from "../fs/opfs";
import { localKeyboardBridge } from "../apps/browser-target";
const MIME: Record<string, string> = {
  css: "text/css",
  js: "text/javascript",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  avif: "image/avif",
  ico: "image/x-icon",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  wav: "audio/wav",
  mp4: "video/mp4",
  webm: "video/webm",
};
/** Resolve only assets inside this app's directory. No arbitrary desktop reads. */
export function localAssetPath(
  reference: string,
  documentPath: string,
  root: string,
) {
  if (!reference || /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(reference))
    return null;
  const clean = decodeURIComponent(reference.split(/[?#]/)[0]);
  const path = fs.normalize(
    clean.startsWith("/")
      ? clean
      : documentPath.slice(0, documentPath.lastIndexOf("/") + 1) + clean,
  );
  if (!path.startsWith(root + "/"))
    throw new Error("App assets must stay inside " + root);
  const ext = path.split(".").pop()?.toLowerCase() || "";
  if (!MIME[ext]) throw new Error("Unsupported local app asset: " + path);
  return path;
}
/** Hydrate static HTML/CSS/classic-JS assets; dynamic imports need a bundled build. */
export async function loadLocalApp(
  path: string,
): Promise<{ html: string; dispose: () => void }> {
  const source = await fs.read(path),
    root = path.slice(0, path.lastIndexOf("/")),
    urls: string[] = [];
  let total = source.length,
    count = 0;
  const cache = new Map<string, Promise<string>>();
  const dispose = () => urls.forEach((url) => URL.revokeObjectURL(url));
  if (source.includes('name="oma-document"')) return { html: source, dispose };
  const asset = async (reference: string, from = path): Promise<string> => {
    const target = localAssetPath(reference, from, root);
    if (!target) return reference;
    if (cache.has(target)) return cache.get(target)!;
    const promise = (async () => {
      if (++count > 100)
        throw new Error("This app exceeds the 100 asset limit.");
      const file = await fs.readBlob(target);
      total += file.size;
      if (total > 25 * 1024 * 1024)
        throw new Error("This app exceeds the 25 MB asset limit.");
      const ext = target.split(".").pop()!.toLowerCase();
      let body: Blob = file;
      if (ext === "css") {
        const css = await file.text();
        body = new Blob([await cssAssets(css, target)], { type: "text/css" });
      } else body = new Blob([file], { type: MIME[ext] });
      const url = URL.createObjectURL(body);
      urls.push(url);
      return url;
    })();
    cache.set(target, promise);
    return promise;
  };
  const cssAssets = async (css: string, from: string) => {
    // Imports must be bundled to avoid recursive CSS cycles and hidden file access.
    if (/@import\s/i.test(css))
      throw new Error(
        "Bundle CSS @import rules into one stylesheet before running this app.",
      );
    const refs = [...css.matchAll(/url\(\s*(['"]?)([^)'"\s]+)\1\s*\)/g)];
    for (const match of refs) {
      const resolved = await asset(match[2], from);
      css = css.replace(match[0], `url("${resolved}")`);
    }
    return css;
  };
  try {
    const doc = new DOMParser().parseFromString(source, "text/html");
    // A hostile base element must not turn relative assets into same-origin requests.
    doc.querySelectorAll("base").forEach((base) => base.remove());
    for (const module of doc.querySelectorAll('script[type="module"]')) {
      if (
        /(?:\bfrom\s*|\bimport\s*\(?\s*)['"]\.{1,2}\//.test(
          module.textContent || "",
        )
      )
        throw new Error(
          "Bundle relative ES module imports before running this app.",
        );
    }
    for (const node of doc.querySelectorAll(
      '[src],link[rel="stylesheet"][href],video[poster]',
    )) {
      const attribute = node.hasAttribute("src")
        ? "src"
        : node.hasAttribute("poster")
          ? "poster"
          : "href";
      const value = node.getAttribute(attribute)!;
      if (
        node.tagName === "SCRIPT" &&
        node.getAttribute("type") === "module" &&
        localAssetPath(value, path, root)
      )
        throw new Error(
          "Bundle local ES modules into a classic script or a self-contained HTML file first.",
        );
      node.setAttribute(attribute, await asset(value));
    }
    for (const node of doc.querySelectorAll("[srcset]")) {
      const value = node.getAttribute("srcset") || "";
      if (value.trim().startsWith("data:")) continue;
      const entries = await Promise.all(
        value
          .split(",")
          .filter(Boolean)
          .map(async (entry) => {
            const [reference, ...descriptor] = entry.trim().split(/\s+/);
            return [await asset(reference), ...descriptor].join(" ");
          }),
      );
      node.setAttribute("srcset", entries.join(", "));
    }
    for (const style of doc.querySelectorAll("style"))
      style.textContent = await cssAssets(style.textContent || "", path);
    for (const element of doc.querySelectorAll("[style]"))
      element.setAttribute(
        "style",
        await cssAssets(element.getAttribute("style") || "", path),
      );
    const navigation = localNavigationBridge(path);
    const html = "<!doctype html>" + doc.documentElement.outerHTML;
    return {
      html: html + localKeyboardBridge + navigation,
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}

export function localNavigationBridge(path: string) {
  const base = JSON.stringify(path).replace(/</g, "\\u003c");
  return `<script>addEventListener('click',e=>{const a=e.target.closest?.('a[href]');if(!a)return;const raw=a.getAttribute('href');if(!raw||raw.startsWith('#')||a.hasAttribute('download'))return;e.preventDefault();try{const u=new URL(raw,'https://oma-local.invalid'+${base});if(!['http:','https:'].includes(u.protocol))return;parent.postMessage({type:'oma:web-navigate',url:u.hostname==='oma-local.invalid'?decodeURIComponent(u.pathname):u.href,newTab:e.ctrlKey||e.metaKey||a.target==='_blank'},'*');}catch{}},true);<\/script>`;
}
