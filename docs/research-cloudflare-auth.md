# Cloudflare-native ChatGPT auth

The Cloudflare build uses Workers and SQLite-backed Durable Objects for auth. It needs no Redis, Node server, second identity cookie or external session service. The existing Node/Vercel implementation remains available for those deployment targets.

## Identity and routing

The existing SDK `lwc_session` cookie is also the Durable Object routing identity. The edge verifies its HMAC before resolving an object. On the first valid POST `/api/chatgpt/login` without a cookie, the edge generates a random session ID, signs it using the SDK helper, injects it into the request and routes to that ID's object. A successful response sets the same cookie in the browser. The SDK reuses this valid injected SID even when its store is initially empty; both SQLite tests and workerd tests verify that behavior.

Unauthenticated status reads return directly without allocating a Durable Object. Tampered cookies are cleared without allocating an object, including on login; a subsequent clean login can start normally. Foreign-origin mutations are rejected before allocation. Secure, HttpOnly, SameSite=Lax cookies are used, with Secure disabled only for HTTP loopback development. The SDK repeats its own origin checks.

Inside the object, the cookie is verified again and must map to that object's actual ID. There is no client-controlled object-ID parameter, forwarding identity header, second routing cookie or shared signed-in account. All SDK session and rate records belong to that one object. Browser access calls `authenticatedIdentity`, which checks persisted authenticated status; possession of a valid pending-login cookie is insufficient.

## Persistence and concurrency

The adapter stores scoped JSON records with expiration timestamps in a small SQLite table. SDK tokens are encrypted with the deployment's `LWC_SECRET` before insertion. SQL identifiers are fixed and values use bindings. The schema and persistence use the Durable Object's synchronous SQL API. Cloudflare documents strong consistency, transactions and SQLite-backed storage as object-local storage capabilities. [SQLite storage API](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/).

A promise queue serializes SDK request initialization and alarm processing. This is necessary because external provider awaits can allow request interleaving even though SQL calls themselves are synchronous. It prevents duplicate refreshes, status/logout resurrection and lost rate updates. Different objects/users run concurrently. We avoid holding `blockConcurrencyWhile` around provider requests: it resets an object if a callback exceeds 30 seconds. [Durable Object concurrency](https://developers.cloudflare.com/durable-objects/api/state/).

The queue releases once the SDK returns response headers. The response body remains streamed through the outer Worker, without buffering the complete answer or holding the auth queue until generation finishes. Cloudflare supports streams between Workers and Durable Objects and propagates cancellation when the Worker cancels the object's stream. [ReadableStream example](https://developers.cloudflare.com/durable-objects/examples/readable-stream/).

Provider request initialization and non-streaming auth bodies have a 20-second deadline. Completed JSON responses clear their timers so they do not unnecessarily keep an object active. Streaming answers can continue after their headers arrive. Logout invalidates future requests; it cannot revoke a model response already authorized upstream.

An alarm removes expired records and clears empty object storage. Alarms are scheduled from the earliest remaining expiration and processed through the same queue as requests. Handlers tolerate repeated cleanup. [Durable Object alarms](https://developers.cloudflare.com/durable-objects/api/alarms/).

## Integration

The Worker entry imports these exports from `companions/cloudflare-app/src/auth.ts`:

- `AuthSession`: Durable Object class.
- `routeAuth(request, env)`: `/api/chatgpt/*` route.
- `authenticatedIdentity(request, env)`: signed-in opaque owner ID for the browser service; never return this internal value as a public profile.

Required bindings: `AUTH_SESSIONS` namespace and secret `LWC_SECRET` (at least 32 random characters). Configure a SQLite migration for `AuthSession`; preserve the secret across deployments. Use a distinct secret per deployment/environment. No auth keys or tokens belong in the static frontend bundle.

## Verification

`npx tsx --test companions/cloudflare-app/tests/auth-core.test.ts` runs actual SQLite with a fake provider. It checks allocation boundaries, exact first-login routing, independent users, encrypted token rows, authenticated browser ownership, logout isolation and alarm cleanup/reinitialization.

`node companions/cloudflare-app/tests/workerd-auth.mjs` bundles the production class and runs actual workerd/Miniflare SQLite Durable Objects. It verifies two independent logins, token progression, an authenticated SSE response and isolated logout. A fake provider is injected only into the test bundle; the runtime has no test-provider environment override. This test currently resolves Miniflare/esbuild from the installed Cloudflare browser companion dependencies. Both suites passed during implementation. This is runtime integration evidence, not a claim that a real ChatGPT account has completed login on the public deployment.

Cloudflare account limits, provider eligibility and upstream availability still apply. Desktop OPFS files remain browser-local and are not partitioned or synchronized by ChatGPT account. Distinct browser profiles have independent cookies; tabs in one profile normally share the same login.
