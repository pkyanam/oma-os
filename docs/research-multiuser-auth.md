# Concurrent users and ChatGPT sessions

Reviewed 2026-09-12 against the installed `@opencoredev/loginwithchatgpt-server` source in `src/handler.ts`, `src/session.ts`, `src/crypto.ts`, and the core token/device implementation. Upstream: [login-with-chatgpt](https://github.com/opencoredev/login-with-chatgpt).

Each browser receives an independent random, HMAC-signed `lwc_session` cookie. HTTPS cookies are Secure, HttpOnly and SameSite=Lax. The server uses that session's encrypted tokens and account ID for model requests. Tokens remain server-side; public status responses contain status/profile information. Multiple people can authenticate with independent ChatGPT accounts concurrently. They do not share a global account or API key.

The same browser profile and origin normally shares one cookie jar across tabs; those tabs intentionally share its login. Use distinct browser profiles for distinct simultaneous identities in one browser. The desktop's OPFS files also belong to the browser origin, not a server user account; this auth change does not create cloud file synchronization or per-login OPFS partitions. Logging out and switching accounts in the same browser does not remove that browser's desktop files.

## Deployment configuration

Use one strong `LWC_SECRET` across replicas and a shared Redis REST store. Either `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` or Vercel integration aliases `KV_REST_API_URL`/`KV_REST_API_TOKEN` are accepted. `OMA_AUTH_NAMESPACE` defaults to `oma-os:`; set a unique namespace for each deployed application/environment when sharing a Redis database. Session, rate and lock keys all use that namespace. Never flush the shared database.

Vercel login stays unavailable until a shared store and secret are configured. Self-hosted local mode persists encrypted tokens with a locally generated secret, private directory/file modes, hashed filenames and atomic replacement. **Local FileStore concurrency assumes one Node process.** Replicas/process clusters require Redis; sharing the local directory does not provide distributed transaction locking. Expired file records are ignored without deleting on read, preventing a stale reader from deleting a renewed record. They are not automatically physically pruned.

## Why the wrapper is necessary

The SDK's `getFreshTokens` guards concurrent refreshes only inside one SessionManager instance. `advance`, used by status polling, separately refreshes and saves. Its rate counter uses read/modify/write operations. A shared store alone therefore does not prevent duplicate refresh-token rotation, status/logout races or lost rate increments.

`serializeSessionRequests` verifies the SDK-signed cookie before deriving a lock. For a valid session, all HTTP auth operations serialize through one session lock. Different sessions remain concurrent. Local mode uses a per-session promise queue. Redis mode uses an expiring owner-token lease, periodic owner-checked renewal, bounded acquisition wait and owner-checked release.

Every Redis session/rate write or deletion inside the request carries the lock context. Lua checks ownership and applies the mutation atomically. A worker that loses its lease cannot overwrite a newer worker's session or delete its lock. Renewal failure aborts the request's upstream fetch; Redis errors fail closed rather than falling back to an isolated in-memory session store.

The lock covers response initialization and token/rate operations, then releases when response headers are available. It does **not** serialize the entire streaming answer. Logging out invalidates subsequent authenticated requests; it does not revoke an already authorized upstream response stream or retroactively stop an operation already in flight.

Only the guarded `handler`/`fetch` surface is exported by the application auth factory. Raw SDK token or proxy helpers are not exposed through this factory, preventing accidental bypass of the wrapper. Transient handler initialization failures can be retried rather than permanently caching a rejected initialization promise.

## Evidence and limits

Tests use a fake provider fetch and fixture credentials only; they do not call OpenAI or use real users' tokens:

- Two complete device login flows receive distinct cookies and encrypted stored tokens. Model discovery uses each account's own bearer/account headers.
- Logging out one user leaves the other authenticated; altered cookies and foreign-origin logout attempts fail.
- Two separate SDK handlers under one lock refresh once; a queued logout leaves no resurrected session.
- Concurrent requests consume individual session rate slots; another session has an independent bucket.
- Store tests exercise key separation, atomic file replacement, bounded lock waiting, renewal ownership/fenced writes and safe release after owner replacement.

`lib/auth/redis-live.test.ts` is an explicit opt-in integration test for the actual Redis REST Lua operations. With the deployment environment loaded, run `OMA_AUTH_TEST_REDIS=1 npx tsx --test lib/auth/redis-live.test.ts`. It creates only random temporary keys beneath the configured namespace, uses short TTLs, and deletes only those exact keys. It never scans, flushes or reads real session keys. The default unit test suite skips this integration test.

This design does not guarantee operation through Redis outages, provider outages or an unbounded browser/server stall. Lease loss produces an error and requires a fresh request. Upstream device-login support, model eligibility and normal ChatGPT account limits still apply independently for every user.
