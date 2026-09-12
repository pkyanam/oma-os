# Deploying oma.os

**Primary deployment: [oma.os on Cloudflare](https://oma-os.preetham-981.workers.dev).** Vite builds the client desktop; Workers serves APIs and static assets. Node/Next and Vercel remain separate supported targets with different capabilities.

## Capability matrix

| Capability | Cloudflare (primary) | Persistent Node / Docker | Vercel (Next) |
| --- | --- | --- | --- |
| Desktop, OPFS, local app runtimes | Yes | Yes | Yes |
| Direct CORS model provider | Yes | Yes | Yes |
| ChatGPT authorization | SQLite auth Durable Objects + secret | Encrypted local store or Redis | Redis + stable secret |
| Interactive websites inside OS | Managed Browser Run + Live View | Local/remote Chromium | Unavailable |
| Document browser / permitted embeds | Yes | Yes | Yes |
| Python runtime gateway | Hash-verified lazy Cache API | Same-origin gateway | Same-origin gateway |
| Cloud file backup/sync | Not implemented | Not implemented | Not implemented |

Files remain in each browser's OPFS. Server auth storage and remote browser state are distinct from desktop files. Changing from localhost or Vercel to Cloudflare creates a separate filesystem; export and restore a ZIP to move work.

## Cloudflare setup

Requires Node.js 22+, Git, and a Cloudflare account with access to the configured services. The published deployment was verified on an **already existing Workers Paid plan**; no plan upgrade was performed. A free account has smaller Browser Run allowances. Check [current service pricing](CLOUDFLARE.md) before making your deployment public.

```sh
npm ci
npx wrangler login
npx wrangler secret put LWC_SECRET
npm run deploy:cloudflare
```

Enter a stable random encryption secret at the prompt; generate one with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Keep it in your secret manager. Do not place it in Vite variables, source, or static assets. `npm ci` prepares licensed runtime assets and applies the checked Monaco security patch.

`deploy:cloudflare` runs `vite build && wrangler deploy`. The Cloudflare Vite plugin produces the client and Worker outputs and deployment configuration. Use this explicit target: generic framework detection can select Next.js because that alternative remains in the repository.

```sh
npm run dev:cloudflare
npm run build:cloudflare
npm run preview:cloudflare
```

Development uses `http://localhost:3018` through the Vite Cloudflare plugin. Local emulation is not proof of access to the account's managed browser. Configure secrets for the relevant environment and test remote services on your deployed origin. Local Node/Next development separately uses `npm run dev` at port 3017.

### Request path and bindings

```text
Browser -> Workers Static Assets (Vite client)
        -> /api/* -> cloudflare/index.ts
                     AUTH_SESSIONS -> AuthSession (SQLite Durable Object)
                     BROWSER_SESSIONS -> BrowserSession (SQLite Durable Object)
                     BROWSER -> managed Chromium + embedded Live View
                     AI_QUOTA -> AIQuota (atomic usage reservations)
                     AI -> Workers AI (explicitly selected model)
                     API_LIMITER -> native rate limiting
        -> /runtime/pyodide/* -> pinned manifest -> verified stream -> Cache API
```

`wrangler.jsonc` contains `ASSETS`, auth/browser/quota Durable Object bindings and SQLite migrations (`v1`, `v2`, `v3`), the `BROWSER` and `AI` bindings, `API_LIMITER`, and observability. Keep migration history when updating existing deployments. Static assets bypass API execution; `/api/*` and `/runtime/pyodide/*` run the Worker first. No Redis or separately hosted Node sidecar is needed for the Cloudflare profile.

Authentication uses the community Login with ChatGPT SDK; it is not an official OpenAI SDK. A healthy configured route does not establish account eligibility or successful paid model inference. Provider-key mode remains available for compatible CORS endpoints.

Managed website sessions use owner-scoped coordination and temporary Live View access. Live View is a Cloudflare beta feature. Do not publish session URLs or log their tokens. Normal site authentication and bot challenges still apply. The Node proxy's TCP/DNS implementation is not deployed to Cloudflare; managed Browser Run replaces that runtime.

**Not provisioned:** R2 is disabled on the current account and requires dashboard enablement (API error 10042). No cloud file backup, AI Gateway, D1, or background Agents SDK execution is implied by this deployment. The [architecture catalog](CLOUDFLARE.md) describes these as optional future work.

### Workers AI mode

Workers AI offers DeepSeek V4 Flash (default), GLM 5.3 Flash, Qwen 3.8 27B, and Kimi K2.7 Code. Select this connection explicitly in Agent. It requires `AI`, `AI_QUOTA`, and a stable `LWC_SECRET` of at least 32 characters. No ChatGPT login or provider key is required. This mode sends inference to Cloudflare and charges the deployment account; it does not consume ChatGPT subscription access.

`cloudflare/ai.ts` defines these coordinated UTC-day reservation limits:

| Budget | Per network | Entire deployment |
| --- | ---: | ---: |
| Calls | 16 | 64 |
| Input bytes | 262,144 | 1,048,576 |
| Reserved output tokens | 32,768 | 131,072 |

Each request permits at most 262,144 body bytes and 2,048 output tokens. Concurrency is limited to one active request per network and four per deployment. Reservations are atomic in one quota Durable Object; failed/cancelled calls are intentionally not refunded. Stored quota state contains daily HMAC network identifiers (derived from Cloudflare’s trusted client IP), counters, and temporary leases, not prompts. The model service still processes submitted text; do not equate quota storage policy with provider retention policy. People sharing an IP share the network budget; changing cookies or signing in does not reset it. These application budgets constrain usage but are not a currency-denominated billing guarantee.

The implementation supports text/tool messages. It does not establish that a particular hosted inference request succeeded: verify each selected model after deployment, and preserve the direct-provider alternative.

### Verify the deployed origin

Check `/api/health`, `/api/agent-config`, and `/api/browser-runtime?capabilities=1`. Then test actual website navigation and controls, login/device authorization with your account, local file persistence, Python including NumPy, SQL queries, and drawing import/export. Capability responses alone do not prove model inference or browser rendering. Confirm session ownership with separate browser contexts.

Run the deployment smoke explicitly:

```sh
node scripts/smoke-cloudflare.mjs https://oma-os.preetham-981.workers.dev
```

It checks health, readable pages, private-address denial, browser capabilities, and independent anonymous sign-in initialization. It creates two pending login sessions and logs both out in cleanup; it does not authenticate an account or call a paid model.

Use Workers observability for errors and resource usage while excluding credentials and private content. Native rate limiting is not a strict globally coordinated budget cap. Browser time, concurrency, storage, and external model usage can incur charges. See [performance notes](PERFORMANCE.md) for static sizes, compression verification, and cache behavior.

## Persistent Node installation

Use Node.js 22 or later; this build uses Node 24. Run as a normal user with permission to write the auth directory.

```sh
npm ci
npm run setup:browser
npm run build
OMA_BROWSER_ENABLED=1 npm start
```

Open `http://localhost:3017`. `npm start` uses the standalone Next build, copies static/public assets into it, and starts port 3017 unless `PORT` is set. Browser filesystem APIs require localhost or HTTPS. For a desktop without server Chromium, omit `setup:browser` and set `OMA_BROWSER_ENABLED=0`.

On supported Linux distributions, install Chromium's system libraries if needed:

```sh
npx playwright install-deps chromium
```

`npm ci` also copies Monaco, PGlite and Excalidraw assets and applies the checked Monaco sanitizer patch. Do not bypass install scripts or replace the prepared Monaco directory with pristine upstream assets afterward. The patch intentionally fails if an unreviewed upstream bundle changes; see [dependency review](dependency-review.md).

### Authentication storage

A single persistent host works without Redis. The bundled helper creates `.oma-auth/secret` and encrypted SDK session storage under `.oma-auth`. The secret is generated once with restrictive filesystem permissions. Keep the directory across restarts and releases; losing the key makes saved sessions unusable.

Environment variables from [`.env.example`](../.env.example):

| Variable                   | Purpose                                                                                  |
| -------------------------- | ---------------------------------------------------------------------------------------- |
| `OMA_AUTH_DIR`             | Persistent server auth directory; defaults to `.oma-auth` in the project for `npm start` |
| `LWC_SECRET`               | Operator-managed stable encryption secret; required on Vercel                            |
| `UPSTASH_REDIS_REST_URL`   | Optional shared Redis REST endpoint                                                      |
| `UPSTASH_REDIS_REST_TOKEN` | Redis credential; use together with the endpoint                                         |
| `OMA_BROWSER_ENABLED`      | `1` opts into production Chromium; `0` disables it                                       |
| `OMA_BROWSER_CDP_URL`      | Optional operator-owned remote Chromium endpoint                                         |
| `OMA_BROWSER_PROXY_URL`    | Public-only egress proxy reachable by that remote Chromium                               |
| `PORT`                     | Port used by the startup script, default 3017                                            |

Generate a managed secret locally:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Store secrets in the deployment environment, never in Git or `public/`. Set the same `LWC_SECRET` across instances using a shared Redis store. Local file storage is intended for a single persistent host, not an ephemeral or horizontally scaled fleet.

### Network exposure

The interactive browser is a resource-bearing service. Use your usual authenticated reverse proxy or private network access when exposing a Chromium-enabled production host. The application has session ownership controls but does not implement a general operator-managed account system or billing/abuse controls for anonymous public browsing.

Terminate HTTPS at the proxy and preserve `Host` and `X-Forwarded-Proto`. Browser control checks same-origin requests. Chromium uses isolated ephemeral contexts, never your personal browser profile. Its bundled egress proxy validates DNS answers and connects to pinned public IP addresses; private, loopback and metadata destinations are blocked. Do not replace the proxy with an unrestricted relay. CDP deployments must provide equivalent public-only egress protection at the remote browser host.

Interactive website sessions expire after fifteen minutes idle and are limited to three per owner and twelve per process. Restarts end these sessions. The image stream does not transport website audio, clipboard data, or file-upload dialogs. Websites can display their own bot challenges. See [runtime design](research-remote-browser.md).

## Docker

The included [Dockerfile](../Dockerfile) builds on `node:24-bookworm-slim` and packages Next's standalone output, static assets and Chromium. [compose.yaml](../compose.yaml) binds only `127.0.0.1:3017`, runs as the non-root `node` user, uses an init process and 1 GB shared memory, and persists `/data/auth` in the `oma-auth` volume.

```sh
docker compose up --build -d
docker compose logs -f oma-os
```

The Chromium sandbox remains enabled. Compose includes [Playwright's seccomp profile](../docker/seccomp_profile.json), which permits the user-namespace operations Chromium needs. Attribution and Apache-2.0 license are preserved in [PLAYWRIGHT-NOTICE](../docker/PLAYWRIGHT-NOTICE) and [PLAYWRIGHT-LICENSE](../docker/PLAYWRIGHT-LICENSE). The upstream recommendations explain the non-root user, namespace profile and shared-memory requirements. [Playwright Docker documentation](https://playwright.dev/docs/docker).

The Dockerfile currently installs Playwright Chromium at version 1.63.0, matching the lockfile reviewed for this build. Keep those versions aligned when updating dependencies. Do not solve sandbox startup failures by silently disabling the sandbox or running the browser as root.

**Validation status:** the Docker configuration was reviewed, but a Docker daemon was unavailable in the build environment. Image build, container startup, volume ownership and sandbox launch have not been verified there. Validate on your deployment host before relying on this route.

Client files are not in the Docker volume. They stay in each user's browser storage. The auth volume contains server-side credentials and should be backed up and protected separately; deleting it is not a desktop file reset.

## Vercel

Import the Git repository as a Next.js project, or use the Vercel CLI. Use the checked-in lockfile and default `npm ci` / `npm run build` lifecycle. The client desktop and local app runtimes do not need an AI credential to build.

To enable ChatGPT login, set all three environment variables for the deployment:

```text
LWC_SECRET
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
```

The helper checks for these values when `VERCEL` is set. Without them, it reports ChatGPT login unavailable and the UI supports direct provider-key mode. Never substitute a generated per-invocation secret or temporary filesystem store: subsequent requests could reach another instance.

Interactive Chromium deliberately reports unavailable on Vercel. Setting `OMA_BROWSER_ENABLED=1` does not override this restriction. The Document and Embed browser modes remain available, subject to page content and site embedding policies.

Changing the deployed origin creates a separate OPFS filesystem. Preview deployments, production deployments and custom domains do not share browser files. Export a desktop ZIP backup before moving work to a different origin.

## Verification and updates

After deployment, check `/api/health`, open the desktop, create and reload a local file, and exercise the applications you need. `/api/agent-config` reports authentication availability; `/api/browser-runtime?capabilities=1` reports Chromium availability. Verify the advertised capabilities rather than assuming every hosting target provides the same services.

Before upgrading:

1. Export browser files through Settings → Storage & backup and retain server auth storage separately.
2. Update dependencies deliberately; run `npm test`, `npm run typecheck`, `npm run build` and relevant end-to-end tests.
3. Reinstall Chromium if the Playwright version changed, and update the Docker runtime version together.
4. Retest sign-in, local file persistence and website rendering on the actual deployment host.

PGlite, Excalidraw fonts and editor assets are self-hosted. Python Lab fetches pinned Pyodide 314.0.6 and approved packages through the same-origin verified runtime gateway on first use. Provider calls, remote websites and initial Python loading require outbound network access. A successful deployment does not imply fully offline startup.

### Standalone dependency tracing

The Chromium route explicitly includes Playwright's runtime package files in Next.js output tracing. Playwright dynamically reads `browsers.json`, which automatic tracing omitted in the first standalone smoke check. Keep this rule when changing server packaging, and test `/api/browser-runtime` on the built server. [Next.js output tracing documentation](https://nextjs.org/docs/app/api-reference/config/next-config-js/output).
