# Lazy Python asset delivery

Python Lab uses `/runtime/pyodide/v314.0.6/` on the application's own origin. Nothing downloads until Run. The application deploy contains no Python WASM binary, standard library ZIP, or NumPy wheel: only the small worker and a roughly 50 KB hash allowlist. Runtime requests are streamed from the pinned jsDelivr distribution, verified, and cached on demand.

## Why a gateway

Pyodide's official [deployment guide](https://pyodide.org/en/stable/usage/downloading-and-deploying.html) distinguishes the minimal core from the full distribution, which exceeds 200 MB. The five required files for the module-worker path total **13,526,497 uncompressed bytes** in this release:

| File | Bytes |
|---|---:|
| pyodide.mjs | 17,931 |
| pyodide.asm.mjs | 1,250,344 |
| pyodide.asm.wasm | 9,598,218 |
| python_stdlib.zip | 2,545,564 |
| pyodide-lock.json | 114,440 |

The package lockfile lists 356 packages. Their exact filenames and SHA-256 hashes are committed in `lib/runtime/pyodide-assets.json` along with independently downloaded core-file hashes. Package files are fetched only when imported. NumPy 2.4.6 needs `numpy-2.4.6-cp314-cp314-pyemscripten_2026_0_wasm32.whl`, hash `32959d4137cec8143d75016d029281df3d2e80a232896ed903c2b59e1c44ee9f`, with no additional lockfile dependencies.

This is a fixed allowlist, not a URL proxy. Unknown versions, paths, filenames, query strings, and write methods are rejected. Upstream requests use a fixed HTTPS origin, reject redirects, and forward no browser cookies, authorization headers, or other request headers. The gateway never adds a model key or session credential.

## Integrity, streaming and cache

`lib/runtime/python-assets.ts` hashes bytes incrementally while streaming them. A mismatch, unexpected core-file size, or body beyond **25 MiB** errors the response before successful completion. The gateway does not buffer the entire runtime in Worker memory. A package larger than the cap is unavailable through this service and must be intentionally addressed by a deployment owner. Auxiliary distribution files not listed in the package lock, such as optional fonts and package metadata, are not broadly proxied; the verified acceptance scope is Python core and NumPy imports.

Cloudflare's [Node crypto support](https://developers.cloudflare.com/workers/runtime-apis/nodejs/crypto/) supplies incremental SHA-256 under the project's existing compatibility configuration. [Cache API](https://developers.cloudflare.com/workers/runtime-apis/cache/) stores successful response streams at the serving data center via `ctx.waitUntil`. Failed integrity streams do not complete a cache write. [Streaming responses](https://developers.cloudflare.com/workers/runtime-apis/streams/) keep application memory independent of total body size. Cache outages fall back to the fixed upstream source.

Successful assets use a content-hash ETag and `Cache-Control: public, max-age=31536000, immutable`. Versioned paths keep upgrades separate. Browser caching works for both hosts; Cloudflare also uses its edge Cache API. The Next.js route streams the same gateway but does not maintain an in-process binary cache.

## Host wiring

- **Next.js:** `app/runtime/pyodide/[version]/[asset]/route.ts` exposes GET/HEAD.
- **Cloudflare:** `cloudflare/python-assets.ts` exposes `pythonAssetResponse(request, ctx)`. Route every `/runtime/pyodide/` request to it **before** static asset fallback, including unknown versions so they return 404 rather than the SPA document. Include `/runtime/pyodide/*` in `assets.run_worker_first`.
- **Client:** `public/runtime/python-worker.mjs` sets an absolute same-origin INDEX derived from `self.location.origin`.

A future static mirror can replace this route with the same verified files. The current implementation keeps deployment payloads small and requires network access for the first runtime/package load. Cached subsequent loads may work offline; a complete offline-install guarantee is not claimed.

## Updating

Run `node scripts/update-pyodide-manifest.mjs 314.0.6` to reproduce the allowlist. It downloads the lock and four other core files, records hashes, and copies package hashes from the lock; it never downloads all wheels. For a version upgrade, review those source changes and update the worker's INDEX version together. The original Pyodide distribution and licenses remain upstream; this project does not relabel third-party Python packages as its own MIT code.

## Verification

`lib/runtime/python-assets.test.ts` checks exact allowlisting, credential stripping, redirect policy, method/query handling, streamed hash/size caps, and immutable conditional metadata. `e2e/python-assets.spec.ts` runs in an isolated browser context with direct jsDelivr Python requests blocked. It verifies no Python request before Run, all five core files plus the NumPy wheel arriving through the same-origin gateway, and actual Python output `numpy-gateway: 45`.

### Workerd compatibility verification

The gateway uses the shared server-fetch subset supported by Next.js and Cloudflare: GET, fixed headers, an abort signal, and `redirect: "manual"`. Workerd rejects browser-only `credentials` and does not implement `redirect: "error"`. Server fetch has no browser cookie jar; keeping an explicit fresh header object prevents cookie/authorization forwarding. Every non-2xx upstream response, including a redirect, is rejected without following its Location. Localhost diagnostics expose the upstream exception during development; public failures remain generic.

The NumPy integration test also passed against the actual Vite Cloudflare/workerd server (`OMA_BASE_URL=http://127.0.0.1:3018`), with direct CDN requests blocked. This verifies the edge runtime behavior rather than inferring compatibility solely from Node tests. Production deployment must contain these same gateway fixes before testing its URL.
