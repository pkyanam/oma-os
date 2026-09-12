import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
const require = createRequire(
  new URL("../../../package.json", import.meta.url),
);
const { Miniflare, convertV4MiniflareOptions } = require("miniflare"),
  { build } = require("esbuild");
const browserPath = fileURLToPath(
  new URL("../src/browser.ts", import.meta.url),
);
const output = await build({
  stdin: {
    contents: `import {BrowserSession,routeCloudBrowser,closeCloudBrowser} from ${JSON.stringify(browserPath)};export {BrowserSession};export default {async fetch(request,env){env=request.headers.has('x-fixture-unbound')?{}:{...env,BROWSER:{}};const id=request.headers.get('x-fixture-identity')||undefined;if(new URL(request.url).pathname==='/fixture-logout'){await closeCloudBrowser(env,id);return new Response('closed');}return routeCloudBrowser(request,env,id)}}`,
    resolveDir: fileURLToPath(new URL("../../../", import.meta.url)),
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  external: ["cloudflare:workers"],
  write: false,
  plugins: [
    {
      name: "no-managed-browser",
      setup(build) {
        build.onResolve({ filter: /^@cloudflare\/puppeteer$/ }, () => ({
          path: "fixture",
          namespace: "browser-fixture",
        }));
        build.onLoad({ filter: /.*/, namespace: "browser-fixture" }, () => ({
          contents:
            'export default {launch(){throw new Error("Unexpected paid browser launch")},connect(){throw new Error("Unexpected browser connection")}}',
          loader: "js",
        }));
      },
    },
  ],
});
const mf = new Miniflare(
  convertV4MiniflareOptions({
    modules: true,
    script: output.outputFiles[0].text,
    compatibilityDate: "2026-09-12",
    durableObjects: {
      BROWSER_SESSIONS: { className: "BrowserSession", useSQLite: true },
    },
  }),
);
try {
  const unavailable = await mf.dispatchFetch(
    "https://oma.test/api/browser-runtime?capabilities=1",
    { headers: { "x-fixture-unbound": "1" } },
  );
  const capability = await unavailable.json();
  assert.equal(capability.available, false);
  assert.equal(capability.requiresAuthentication, false);
  assert.equal(capability.transport, undefined);
  assert.equal(
    (
      await mf.dispatchFetch("https://oma.test/api/browser-runtime", {
        method: "POST",
        headers: { "x-fixture-unbound": "1" },
      })
    ).status,
    503,
  );
  assert.equal(
    (
      await mf.dispatchFetch("https://oma.test/fixture-logout", {
        headers: { "x-fixture-unbound": "1", "x-fixture-identity": "alice" },
      })
    ).status,
    200,
  );
  const post = (identity, body, extra = {}) =>
    mf.dispatchFetch("https://oma.test/api/browser-runtime", {
      method: "POST",
      headers: {
        origin: "https://oma.test",
        "content-type": "application/json",
        ...(identity ? { "x-fixture-identity": identity } : {}),
        ...extra,
      },
      body: JSON.stringify(body),
    });
  assert.equal((await post(undefined, { action: "start" })).status, 401);
  assert.equal(
    (await post("alice", { action: "start" }, { origin: "https://evil.test" }))
      .status,
    403,
  );
  // External cleanup headers are stripped; this cannot revoke the session.
  assert.equal(
    (
      await post(
        "alice",
        { action: "heartbeat" },
        { "x-oma-browser-cleanup": "logout" },
      )
    ).status,
    410,
  );
  assert.equal(
    (await post("alice", { action: "start", url: "not-a-url" })).status,
    400,
  );
  assert.equal(
    (
      await mf.dispatchFetch("https://oma.test/fixture-logout", {
        headers: { "x-fixture-identity": "alice" },
      })
    ).status,
    200,
  );
  // Late pre-authorized starts are rejected after revocation, before browser creation.
  assert.equal(
    (
      await post("alice", {
        action: "start",
        url: "https://example.com/",
        clientId: "one",
      })
    ).status,
    401,
  );
  assert.equal(
    (await post("bob", { action: "start", url: "not-a-url" })).status,
    400,
  );
  console.log(
    "PASS: workerd browser auth, cross-origin rejection, internal header isolation, logout revocation, owner isolation; no managed browser usage",
  );
} finally {
  await mf.dispose();
}
