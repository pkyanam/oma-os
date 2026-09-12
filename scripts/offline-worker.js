/* CONFIG is injected from the build's finite static asset manifest. */
const PREFIX = "oma-offline-",
  CACHE = PREFIX + CONFIG.version;
const allowed = new Set(CONFIG.allowed),
  core = new Set(CONFIG.core);
const MAX_FILE = 8 * 1024 * 1024,
  MAX_TOTAL = 32 * 1024 * 1024,
  MAX_COUNT = 180;
let queue = Promise.resolve();
const CONTROL = "oma-offline-control",
  DISABLED = "/__oma_offline_disabled";
async function disabled() {
  return !!(await (await caches.open(CONTROL)).match(DISABLED));
}
async function notify(data) {
  for (const client of await self.clients.matchAll({
    includeUncontrolled: true,
  }))
    client.postMessage({ type: "oma-offline", ...data });
}
async function boundedResponse(path, response) {
  if (!response.ok || response.type === "opaque" || response.redirected)
    throw new Error("Asset unavailable");
  if (
    !path.endsWith(".html") &&
    /text\/html|application\/xhtml/i.test(
      response.headers.get("content-type") || "",
    )
  )
    throw new Error("Unexpected HTML for static asset");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Empty asset");
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_FILE) throw new Error("Asset exceeds offline limit");
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  if (CONFIG.digests?.[path]) {
    const hash = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      (byte) => byte.toString(16).padStart(2, "0"),
    ).join("");
    if (hash !== CONFIG.digests[path])
      throw new Error("Offline asset integrity mismatch");
  }
  const headers = new Headers(response.headers);
  headers.set("x-oma-offline-bytes", String(size));
  headers.delete("content-encoding");
  headers.delete("content-length");
  return new Response(bytes, { status: 200, headers });
}
async function put(path, response) {
  const bounded = await boundedResponse(path, response);
  // Serialize accounting so simultaneous app imports cannot exceed the budget.
  const operation = queue.then(async () => {
    if (await disabled()) return;
    const cache = await caches.open(CACHE),
      keys = await cache.keys();
    let total = 0;
    for (const key of keys) {
      const previous = await cache.match(key);
      total += Number(previous.headers.get("x-oma-offline-bytes") || 0);
    }
    const old = await cache.match(path);
    total -= Number(old?.headers.get("x-oma-offline-bytes") || 0);
    const size = Number(bounded.headers.get("x-oma-offline-bytes"));
    let count = keys.length + (old ? 0 : 1);
    for (const key of keys) {
      if (total + size <= MAX_TOTAL && count <= MAX_COUNT) break;
      if (core.has(new URL(key.url).pathname)) continue;
      const item = await cache.match(key);
      total -= Number(item.headers.get("x-oma-offline-bytes") || 0);
      await cache.delete(key);
      count--;
    }
    if (total + size > MAX_TOTAL || count > MAX_COUNT)
      throw new Error("Offline cache budget exceeded");
    await cache.put(path, bounded);
  });
  queue = operation.catch(() => {});
  return operation;
}
self.addEventListener("install", (event) =>
  event.waitUntil(
    (async () => {
      let completed = 0;
      await notify({
        phase: "downloading",
        progress: { completed, total: CONFIG.core.length },
      });
      try {
        for (const path of CONFIG.core) {
          await put(
            path,
            await fetch(
              new Request(path === "/index.html" ? "/" : path, {
                cache: "reload",
                credentials: "omit",
              }),
            ),
          );
          completed++;
          await notify({
            phase: "downloading",
            progress: { completed, total: CONFIG.core.length },
          });
        }
        await notify({
          phase: "ready",
          progress: { completed, total: CONFIG.core.length },
        });
      } catch (error) {
        await caches.delete(CACHE);
        await notify({
          phase: "error",
          error: "Offline download failed. Stay online and retry.",
        });
        throw error;
      }
    })(),
  ),
);
// Never skipWaiting or reload/claim existing documents. Existing sessions keep their version.
self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys())
        if (name.startsWith(PREFIX) && name !== CACHE && name !== CONTROL)
          await caches.delete(name);
    })(),
  ),
);
self.addEventListener("fetch", (event) => {
  const request = event.request,
    url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  // Root-only navigation fallback cannot capture browser documents, API routes or private URLs.
  if (request.mode === "navigate" && url.pathname === "/") {
    event.respondWith(
      disabled().then((off) =>
        off
          ? fetch(request)
          : caches
              .open(CACHE)
              .then((cache) => cache.match("/index.html"))
              .then((value) => value || fetch(request)),
      ),
    );
    return;
  }
  if (url.search || !allowed.has(url.pathname)) return;
  event.respondWith(
    (async () => {
      if (await disabled()) return fetch(request);
      const cache = await caches.open(CACHE),
        saved = await cache.match(url.pathname);
      if (saved) return saved;
      const response = await fetch(request);
      event.waitUntil(put(url.pathname, response.clone()).catch(() => {}));
      return response;
    })(),
  );
});
self.addEventListener("message", (event) => {
  if (event.data?.type === "oma-offline-status") {
    event.waitUntil(
      (async () => {
        const cache = await caches.open(CACHE);
        const ready =
          !(await disabled()) &&
          (
            await Promise.all(CONFIG.core.map((path) => cache.match(path)))
          ).every(Boolean);
        event.ports[0]?.postMessage({ ready });
      })(),
    );
    return;
  }
  if (event.data?.type === "oma-offline-disable") {
    event.waitUntil(
      queue.then(() => event.ports[0]?.postMessage({ done: true })),
    );
    return;
  }
  if (
    event.data?.type !== "oma-offline-seed" ||
    !Array.isArray(event.data.paths)
  )
    return;
  const paths = event.data.paths
    .filter((path) => typeof path === "string" && allowed.has(path))
    .slice(0, MAX_COUNT);
  event.waitUntil(
    (async () => {
      for (const path of paths) {
        if (await disabled()) return;
        const cache = await caches.open(CACHE);
        if (await cache.match(path)) continue;
        try {
          await put(
            path,
            await fetch(new Request(path, { credentials: "omit" })),
          );
        } catch {}
      }
    })(),
  );
});
