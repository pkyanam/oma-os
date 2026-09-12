import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const templateURL = new URL("./offline-worker.js", import.meta.url);
/** Only production client assets emitted by this build may enter the offline cache. */
export function offlineDesktopPlugin() {
  let emitted;
  return {
    name: "oma-offline-desktop",
    apply: "build",
    enforce: "post",
    transformIndexHtml() {
      return [
        {
          tag: "meta",
          attrs: { name: "oma-offline", content: "available" },
          injectTo: "head",
        },
      ];
    },
    async generateBundle(_options, bundle) {
      if (!bundle["index.html"]) return;
      const allowed = Object.keys(bundle).filter(
        (name) =>
          name === "index.html" ||
          (name.startsWith("assets/") && !name.endsWith(".map")),
      );
      const core = new Set(["index.html"]);
      const visit = (name) => {
        if (core.has(name) || !bundle[name]) return;
        core.add(name);
        const chunk = bundle[name];
        if (chunk.type === "chunk") {
          for (const path of chunk.imports) visit(path);
          for (const path of chunk.viteMetadata?.importedCss ?? []) visit(path);
          for (const path of chunk.viteMetadata?.importedAssets ?? [])
            visit(path);
        }
      };
      for (const [name, chunk] of Object.entries(bundle))
        if (
          chunk.type === "chunk" &&
          (chunk.isEntry ||
            ["Applications", "Notes", "Settings"].includes(chunk.name))
        )
          visit(name);
      for (const path of [
        "icon.svg",
        "oma.webmanifest",
        "fonts/JetBrainsMono-Regular.woff2",
        "fonts/InterVariable.woff2",
      ]) {
        allowed.push(path);
        core.add(path);
      }
      const template = await readFile(templateURL, "utf8");
      const digests = {};
      for (const path of core) {
        const output = bundle[path];
        const bytes = output
          ? output.type === "chunk"
            ? output.code
            : output.source
          : await readFile(new URL("../public/" + path, import.meta.url));
        digests["/" + path] = createHash("sha256").update(bytes).digest("hex");
      }
      const digest = createHash("sha256").update(JSON.stringify(digests));
      const version = digest
        .update(template)
        .update(allowed.sort().join("\n"))
        .update(String(bundle["index.html"].source))
        .digest("hex")
        .slice(0, 16);
      const config = {
        version,
        digests,
        allowed: allowed.map((path) => "/" + path),
        core: [...core].map((path) => "/" + path),
      };
      emitted = { config, template };
      this.emitFile({
        type: "asset",
        fileName: "oma-sw.js",
        source: `/* oma offline desktop */\nconst CONFIG=${JSON.stringify(config)};\n${template}`,
      });
    },
    async writeBundle(options, bundle) {
      if (!bundle["index.html"] || !emitted) return;
      // Vite may rewrite its entry chunk after generateBundle (e.g. preload code).
      // Integrity must describe the bytes on disk that the browser receives.
      const { config, template } = emitted;
      for (const path of config.core)
        config.digests[path] = createHash("sha256")
          .update(await readFile(resolve(options.dir, "." + path)))
          .digest("hex");
      config.version = createHash("sha256")
        .update(template)
        .update(JSON.stringify(config.digests))
        .update(config.allowed.join("\n"))
        .digest("hex")
        .slice(0, 16);
      await writeFile(
        resolve(options.dir, "oma-sw.js"),
        `/* oma offline desktop */\nconst CONFIG=${JSON.stringify(config)};\n${template}`,
      );
    },
  };
}
