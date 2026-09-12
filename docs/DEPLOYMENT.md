# Deploying oma.os

oma.os is one Next.js application with browser-side apps and small bundled Node services. It does not require a separate authentication project or a VM for desktop apps. Interactive website rendering optionally launches Chromium on the server.

## Capability matrix

| Capability                                 | Persistent Node host                        | Included Docker configuration   | Vercel                                          |
| ------------------------------------------ | ------------------------------------------- | ------------------------------- | ----------------------------------------------- |
| Desktop, OPFS files, editor, local apps    | Yes                                         | Yes                             | Yes                                             |
| Direct CORS-enabled model provider         | Yes                                         | Yes                             | Yes                                             |
| ChatGPT device authorization               | Local encrypted store or Redis              | Persistent auth volume or Redis | Redis plus a stable secret required             |
| Document browser / permitted iframe embeds | Yes                                         | Yes                             | Yes                                             |
| Interactive Chromium                       | Opt-in in production                        | Enabled in Compose              | Disabled: sessions require a persistent process |
| External Chromium via CDP                  | Optional with a reachable public-only proxy | Operator configuration required | Not enabled                                     |
| Server filesystem persistence              | Operator-managed                            | Auth volume                     | Do not rely on ephemeral function files         |

Cloudflare Workers is **not supported by a provided deployment adapter**. The current Node HTTP, TCP, DNS, filesystem and Chromium services cannot simply be copied into a Worker. A future deployment can separate the browser-native desktop from durable Node services; that architecture is not implemented here.

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

PGlite, Excalidraw fonts and editor assets are self-hosted. Python Lab currently downloads its pinned Pyodide runtime on first use. Provider calls, remote websites and initial Python loading require outbound network access. A successful deployment does not imply fully offline startup.

### Standalone dependency tracing

The Chromium route explicitly includes Playwright's runtime package files in Next.js output tracing. Playwright dynamically reads `browsers.json`, which automatic tracing omitted in the first standalone smoke check. Keep this rule when changing server packaging, and test `/api/browser-runtime` on the built server. [Next.js output tracing documentation](https://nextjs.org/docs/app/api-reference/config/next-config-js/output).
