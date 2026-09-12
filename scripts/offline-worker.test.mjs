import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { webcrypto, createHash } from "node:crypto";
const source = await readFile(
  new URL("./offline-worker.js", import.meta.url),
  "utf8",
);
function fixture(config, fetcher = async () => new Response("asset")) {
  const listeners = {},
    stores = new Map();
  const key = (value) =>
    new URL(typeof value === "string" ? value : value.url, "https://oma.test")
      .href;
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {
        async match(value) {
          return store.get(key(value))?.clone();
        },
        async put(value, response) {
          store.set(key(value), response.clone());
        },
        async delete(value) {
          return store.delete(key(value));
        },
        async keys() {
          return [...store.keys()].map((url) => new Request(url));
        },
      };
    },
    async keys() {
      return [...stores.keys()];
    },
    async delete(name) {
      return stores.delete(name);
    },
  };
  class LocalRequest extends Request {
    constructor(value, options) {
      super(
        typeof value === "string" ? new URL(value, "https://oma.test") : value,
        options,
      );
    }
  }
  vm.runInNewContext(source, {
    CONFIG: config,
    crypto: webcrypto,
    caches,
    fetch: fetcher,
    Request: LocalRequest,
    Response,
    Headers,
    URL,
    Uint8Array,
    self: {
      location: { origin: "https://oma.test" },
      clients: { matchAll: async () => [] },
      addEventListener: (name, handler) => (listeners[name] = handler),
    },
  });
  const dispatch = async (name, data = {}) => {
    let work;
    let intercepted = false;
    listeners[name]({
      ...data,
      waitUntil: (promise) => (work = promise),
      respondWith: (promise) => {
        intercepted = true;
        work = promise;
      },
    });
    return { intercepted, result: await work };
  };
  return { caches, dispatch, stores };
}
test("offline worker ignores API, external, document and mutation requests", async () => {
  const f = fixture({
    version: "test",
    allowed: ["/index.html", "/assets/app.js"],
    core: [],
  });
  for (const [url, method] of [
    ["https://oma.test/api/chatgpt/session", "GET"],
    ["https://oma.test/api/browser", "GET"],
    ["https://elsewhere.test/assets/app.js", "GET"],
    ["https://oma.test/assets/app.js?token=private", "GET"],
    ["https://oma.test/assets/app.js", "POST"],
    ["https://oma.test/Documents/private.html", "GET"],
  ])
    assert.equal(
      (await f.dispatch("fetch", { request: new Request(url, { method }) }))
        .intercepted,
      false,
    );
  assert.equal((await f.caches.keys()).length, 0);
});
test("failed core installation removes incomplete version and rejects readiness", async () => {
  const f = fixture(
    {
      version: "broken",
      allowed: ["/index.html", "/assets/core.js"],
      core: ["/index.html", "/assets/core.js"],
    },
    async (request) =>
      request.url.endsWith("core.js")
        ? new Response("failed", { status: 503 })
        : new Response("shell"),
  );
  await assert.rejects(f.dispatch("install"), /Asset unavailable/);
  assert.equal((await f.caches.keys()).includes("oma-offline-broken"), false);
});
test("actual-byte cache budget keeps core and evicts optional assets; disable blocks refill", async () => {
  const paths = Array.from({ length: 7 }, (_, i) => `/assets/chunk${i}.js`);
  const f = fixture(
    {
      version: "bounded",
      allowed: ["/index.html", ...paths],
      core: ["/index.html"],
    },
    async (request) =>
      new Response(
        request.url.endsWith("index.html")
          ? "shell"
          : new Uint8Array(6 * 1024 * 1024),
      ),
  );
  await f.dispatch("install");
  await f.dispatch("message", { data: { type: "oma-offline-seed", paths } });
  const cache = await f.caches.open("oma-offline-bounded"),
    keys = await cache.keys();
  let size = 0;
  for (const key of keys)
    size += Number((await cache.match(key)).headers.get("x-oma-offline-bytes"));
  assert.ok(size <= 32 * 1024 * 1024);
  assert.ok(await cache.match("/index.html"));
  assert.ok(keys.length < paths.length + 1);
  await (
    await f.caches.open("oma-offline-control")
  ).put("/__oma_offline_disabled", new Response("disabled"));
  await f.caches.delete("oma-offline-bounded");
  await f.dispatch("message", {
    data: { type: "oma-offline-seed", paths: ["/assets/chunk0.js"] },
  });
  const after = await f.caches.open("oma-offline-bounded");
  assert.equal((await after.keys()).length, 0);
});

test("SPA fallback HTML and changed core bytes fail installation instead of false readiness", async () => {
  const config = {
    version: "integrity",
    allowed: ["/assets/app.js"],
    core: ["/assets/app.js"],
    digests: {
      "/assets/app.js": createHash("sha256").update("correct").digest("hex"),
    },
  };
  const html = fixture(
    config,
    async () =>
      new Response("<html>fallback</html>", {
        headers: { "content-type": "text/html" },
      }),
  );
  await assert.rejects(html.dispatch("install"), /Unexpected HTML/);
  const changed = fixture(
    config,
    async () =>
      new Response("changed", {
        headers: { "content-type": "text/javascript" },
      }),
  );
  await assert.rejects(changed.dispatch("install"), /integrity mismatch/);
  const valid = fixture(
    config,
    async () =>
      new Response("correct", {
        headers: { "content-type": "text/javascript" },
      }),
  );
  await valid.dispatch("install");
  assert.ok(
    await (
      await valid.caches.open("oma-offline-integrity")
    ).match("/assets/app.js"),
  );
});

test("entry count is bounded independently of byte size", async () => {
  const paths = Array.from({ length: 200 }, (_, i) => `/assets/${i}.js`);
  const f = fixture({
    version: "count",
    allowed: ["/index.html", ...paths],
    core: ["/index.html"],
  });
  await f.dispatch("install");
  await f.dispatch("message", { data: { type: "oma-offline-seed", paths } });
  const cache = await f.caches.open("oma-offline-count");
  assert.equal((await cache.keys()).length, 180);
  assert.ok(await cache.match("/index.html"));
});
