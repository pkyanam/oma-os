// Isolated production-fixture server. Never shipped in the application.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
const root = resolve("dist/client");
let state = { suffix: "", failCore: false };
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json",
  ".wasm": "application/wasm",
};
http
  .createServer(async (req, res) => {
    const pathname = new URL(req.url, "http://localhost").pathname;
    if (pathname === "/__offline_fixture/state" && req.method === "POST") {
      let body = "";
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 1024) {
          res.writeHead(413).end();
          return;
        }
      }
      state = JSON.parse(body);
      res.writeHead(200).end("ok");
      return;
    }
    if (pathname === "/index.html") {
      res.writeHead(307, { location: "/" }).end();
      return;
    }
    const path = resolve(
      root,
      "." + (pathname === "/" ? "/index.html" : pathname),
    );
    if (!path.startsWith(root + sep)) {
      res.writeHead(403).end();
      return;
    }
    if (state.failCore && pathname === "/fonts/InterVariable.woff2") {
      res.writeHead(503).end("fixture unavailable");
      return;
    }
    try {
      let body = await readFile(path);
      if (pathname === "/oma-sw.js" && state.suffix)
        body = Buffer.from(
          body
            .toString()
            .replace(/"version":"([^"]+)"/, `"version":"$1-${state.suffix}"`),
        );
      res
        .writeHead(200, {
          "content-type": types[extname(path)] || "application/octet-stream",
          "cache-control": "no-store",
        })
        .end(body);
    } catch {
      res.writeHead(404).end("not found");
    }
  })
  .listen(Number(process.env.OMA_OFFLINE_PORT || 34969), "127.0.0.1");
