# oma.os

[Live desktop](https://oma-os.preetham-981.workers.dev) · [Agent contract](docs/AGENT_CONTRACT.md) · [Deployment guide](docs/DEPLOYMENT.md)
A local-first browser desktop for thinking, making, and working with an agent. Tokyo Night, tiled windows, nine workspaces, real applications, and one shared filesystem.

**[Quick start](#quick-start) · [Applications](#applications) · [Self-hosting](#self-hosting) · [For agents](#for-agents) · [Research](docs/RESEARCH.md)**

MIT licensed. Inspired by Omarchy; not affiliated with Omarchy, Omacom, OpenAI, or Vercel.

## Quick start

**[Open the hosted desktop](https://oma-os.preetham-981.workers.dev)**. No installation is needed for local apps. Files stay in this browser; use Settings to export a backup before changing devices or origins.

For development, use **Node.js 22.12+ and Git**:

```sh
git clone https://github.com/pkyanam/oma-os.git
cd oma-os
npm ci
npm run dev:cloudflare
```

Open **[localhost:3018](http://localhost:3018)**. Vite and the Cloudflare plugin run the desktop and Worker together. Managed browser access needs Cloudflare configuration; local development alone does not grant cloud credentials.

The one-line installer starts the Cloudflare local profile at **localhost:3018**:

```sh
curl -fsSL https://raw.githubusercontent.com/pkyanam/oma-os/main/scripts/install.sh | sh
```

The [script](scripts/install.sh) refuses to overwrite an existing directory. `OMA_INSTALL_DIR` selects a destination. `npm run dev:cloudflare` creates a private random `LWC_SECRET` in gitignored `.dev.vars` on first run and preserves any existing value. It needs no Cloudflare login for local apps or auth; managed cloud browsing still needs Cloudflare configuration. The default profile does not download Chromium.

For the alternative Node/Next profile with local Chromium and no Cloudflare account, use:

```sh
curl -fsSL https://raw.githubusercontent.com/pkyanam/oma-os/main/scripts/install.sh | OMA_RUNTIME=node sh
```

This starts **localhost:3017**. Set `OMA_SKIP_BROWSER=1` to skip its Chromium download. Review the installer before running; Linux may need `npx playwright install-deps chromium`.

## Applications

Open **Applications** from the launcher to find tools, install editable HTML apps, and start useful working sessions.

| App | What it does |
| --- | --- |
| Terminal | Just Bash worker: pipelines, scripts, grep/sed/awk/jq, file operations, and desktop commands over real OPFS files |
| Editor | Self-hosted Monaco, guarded autosave, syntax highlighting, HTML preview |
| Files | Import/drop, search, copy/move/rename, ZIP import/export, app-aware opening |
| Browser | Internal tabs, bookmarks/history, local apps, readable documents, optional interactive Chromium |
| Agent | AI SDK tool loop, model connections, file context, approvals, read-only shell, durable conversations |
| Notes | Markdown notebook, daily pages, project briefs, search, archive, checklists, import/export |
| Canvas | Drawing, shapes, text, layers, touch pan/zoom, JSON/SVG/PNG export |
| Excalidraw | The real open-source infinite canvas, integrated with local drawing files |
| Python Lab | Actual Pyodide execution, SQLite/data/art examples, file exchange, stoppable worker |
| SQL Workbench | Actual PostgreSQL through PGlite, CSV imports, query results, durable database snapshots |
| Data | CSV editing, sorting/filtering, summaries, charts, undo, import/export |
| Tasks | Task board, priorities/tags/dates, Markdown export, focus timer |
| Media | Local images, audio, video, and PDF viewing |
| Settings | Keyboard preferences, storage usage/persistence, reviewed ZIP backup and restore |

Editable apps include **Pulse** (music sequencer), **Image Studio** (crop/resize/color/export), and **Regex Lab** (worker-based matching/replacement). Installing one copies its source into `/home/guest/Applications`; reopening preserves edits.

### Useful workflows

- **Research a project:** read a source, save a readable page or screenshot, collect conclusions in Notes, and turn next steps into Tasks.
- **Tell a data story:** import CSV in Files, explore it in Data or SQL Workbench, run Python analysis, and export a report or SVG back to the desktop.
- **Build an app:** ask Agent to write a local HTML tool, inspect it in Editor, then `run` it inside Browser. Relative CSS, classic scripts, and assets can live beside the HTML file.
- **Make something visual:** sketch with Excalidraw, edit an image in Image Studio, or generate an SVG in Python. Keep the source and result together.
- **Work without a model:** the shell, editor, notebooks, database, and local apps need no AI account. Agent's `/help` and `/sh` commands work locally too.

## Controls

| Action | Control |
| --- | --- |
| Launcher | **⌘K** on Mac; Ctrl+Space; Option/Alt+Space where available |
| System menu | Ctrl+. |
| New terminal | Alt+Enter |
| Close window | Alt+Q; window controls; terminal `exit`, `quit`, or `close` |
| Workspace | Alt+1…9; numbered buttons |
| Focus / resize | Alt+arrows; draggable dividers; window menu |
| Fullscreen tile | Alt+F |
| Window overview | Ctrl+backtick; window controls |
| Save | Cmd/Ctrl+S |

Option is Alt on Mac. Native shortcuts such as Cmd+Q may be reserved by the operating system. Settings offers **Control+Shift** as the desktop modifier. Small screens use one focused app and a touch window switcher.

```sh
help
printf 'Beta\nAlpha\n' | sort
mkdir -p Projects/demo
printf '<h1>Hello from oma.os</h1>' > Projects/demo/index.html
run Projects/demo/index.html
oma apps
oma launch notes
oma open Documents/report.csv
oma window list
```

Just Bash interprets shell language in a browser worker. Native processes, host filesystem access, network commands, npm, and Linux process management are not enabled. See [shell design and limits](docs/research-just-bash.md).

## Model connections

Open **Agent → Model & connection**.

**ChatGPT account:** the bundled [Login with ChatGPT](https://github.com/opencoredev/login-with-chatgpt) community SDK handles device authorization and server-side proxying. Read the in-app consent text. This is not an official OpenAI sign-in SDK. Models are discovered from the account. Cloudflare keeps encrypted sessions in per-session SQLite Durable Objects. The Node profile uses `.oma-auth` or Redis; disconnect removes the session. A configured login route does not guarantee that a particular account or model is eligible.

**Cloudflare model (optional):** explicitly select `@cf/zai-org/glm-4.7-flash`. ChatGPT sign-in supplies account identity for this mode; inference runs on Workers AI and is billed to the deployment, not your ChatGPT subscription. A coordinated Durable Object caps daily calls and input/output budgets. This mode is implemented; actual inference availability depends on the deployed account and model service. See [budgets and verification](docs/DEPLOYMENT.md#workers-ai-mode).

**Provider key:** enter an OpenAI-compatible endpoint, key, and model ID. Requests go directly from the browser to a CORS-enabled provider. Keys stay in tab memory; endpoint/model preferences can persist. Reloading requires reentering the key.

Selected file context and tool-read content are sent to your model. Replacing an existing file requires approval. The shell tool is enforced read-only. Stop ends a run; completed file writes remain. Provider access, quotas, and usage charges belong to your account.

## Website rendering

| Mode | Capabilities |
| --- | --- |
| Cloudflare Live View | Managed Chromium rendered inside the OS, with JavaScript, navigation and interactive controls |
| Node Chromium | Isolated server browser using screenshot/input transport |
| Document | Readable HTML with scripts removed; links and GET forms stay inside the OS |
| Embed | Direct iframe when the website permits embedding |
| Local app | Opaque-origin HTML/CSS/JS sandbox with no automatic parent filesystem/auth access |

Cloudflare uses Browser Run plus a per-user Durable Object. Live View is a Cloudflare beta feature; sessions are temporary and websites can present normal bot challenges. It does not reuse your personal browser profile. The secondary Node service uses a DNS-pinned public-only proxy and image transport; that transport does not relay website audio, clipboard selection, or upload dialogs. See [deployment differences](docs/DEPLOYMENT.md).

## Your data

User files live in **Origin Private File System** under `/home/guest` and `/.oma`. Small window/preference records use localStorage. Different devices, browsers, and URLs have separate files; clearing site data removes them.

**Settings → Storage & backup** requests persistent storage and exports a portable ZIP. Restore previews files and skips existing paths unless replacement is explicitly selected. Save open documents first. Server authentication secrets and provider keys are excluded; personal notes and saved conversations can be included.

Python loads pinned Pyodide 314.0.6 assets lazily through a same-origin, hash-verified gateway. Models and external websites need network access. Local data persistence does not promise complete offline startup after a fresh reload. Cloud backup/sync is not implemented; the hosted account has not enabled R2.

## Hosting

### Cloudflare — primary

```sh
npx wrangler login
npx wrangler secret put LWC_SECRET
npm run deploy:cloudflare
```

Supply a stable random secret when prompted. The script runs the Vite build and Wrangler deployment. `wrangler.jsonc` declares static assets, SQLite auth/browser Durable Objects, managed Browser Run, rate limiting, and observability. Pyodide uses a lazy Cache API gateway. No Node sidecar or Redis is required on this target.

The published deployment runs on an existing Workers Paid account; this work did not upgrade the plan. Browser runtime and other services have usage allowances and charges. Follow the [deployment guide](docs/DEPLOYMENT.md) for prerequisites, verification, and secrets. [Cloudflare architecture](docs/CLOUDFLARE.md) separates working services from future options such as R2, AI Gateway, and durable background agents.

### Node / Docker / Vercel — alternatives

```sh
npm ci
npm run setup:browser
npm run build
OMA_BROWSER_ENABLED=1 npm start
```

Node serves port **3017** by default and bundles local auth plus optional Chromium. Docker uses `docker compose up --build -d`; its configuration was reviewed but not run in the build environment. Vercel uses the retained Next target; ChatGPT auth requires `LWC_SECRET` and both Upstash Redis REST credentials. Vercel does not run interactive Chromium. See [the capability matrix](docs/DEPLOYMENT.md) and [environment variables](.env.example).

## Contributing

```sh
npm test
npm run typecheck
npm run build
npm run build:cloudflare
npx playwright install chromium
npm run test:e2e
```

Tests cover layout, command routing, storage integrity, agent streaming/permissions, archives, app formats, and navigation. End-to-end tests use isolated contexts for real shell, persistence, responsive, touch, and app workflows; no model credentials are required.

Read [AGENTS.md](AGENTS.md), [BUILD_PLAN.md](BUILD_PLAN.md), and the original [specification](OMA_OS_V1_SPEC.md). Current user direction and the expanded build plan resolve the original scope restrictions.

| Area | Location |
| --- | --- |
| Apps and windows | `lib/apps/registry.ts`, `lib/state/store.ts`, `components/Tile.tsx` |
| Command bus | `lib/oma/bus.ts` |
| Files and archives | `lib/fs/`, `lib/files/` |
| Shell / agent | `lib/shell/`, `lib/agent/` |
| App catalog | `lib/apps/catalog.ts`, `public/templates/` |
| Website rendering | `lib/browser/`, `lib/remote-browser/` |
| Auth helper | `lib/auth/`, `app/api/chatgpt/` |

## For agents

Copy this into a coding agent:

```text
You are working on oma.os, an MIT-licensed browser desktop.
Read AGENTS.md, BUILD_PLAN.md, and OMA_OS_V1_SPEC.md. Current user direction
and BUILD_PLAN.md resolve the original specification's scope limits.

Primary target: npm ci && npm run dev:cloudflare (localhost:3018).
Verify: npm test, npm run typecheck, npm run build, npm run build:cloudflare,
and relevant npm run test:e2e checks. Deploy: npm run deploy:cloudflare.
Node fallback: npm run setup:browser && npm run dev (localhost:3017).
Cloud pipeline: Vite -> Workers Static Assets + cloudflare/index.ts;
AUTH_SESSIONS/AuthSession, BROWSER_SESSIONS/BrowserSession, BROWSER,
AI_QUOTA/AIQuota, AI, API_LIMITER, ASSETS. LWC_SECRET is a Worker secret, never a client variable.
Pyodide uses /runtime/pyodide/v314.0.6/ through a verified lazy cache gateway.
Do not add unused cloud bindings or claim R2 is configured. Workers AI is
explicitly selected; verify actual inference before claiming it works.

Apps share OPFS files and the typed command bus in lib/oma/bus.ts.
Register apps in lib/apps/registry.ts and mount them in components/Tile.tsx.
App IDs: term, files, editor, agent, browser, notes, canvas, lab, data,
media, tasks, settings, apps, draw, database, activity, notice.
Keep clients mounted through workspace changes; respect save conflicts.
Use real runtimes. Never invent native processes or successful tool output.

Preserve Tokyo Night tokens, sharp borders, and keyboard/touch usability.
Local HTML apps stay sandboxed without the parent origin. Agent shell must
remain read-only and scoped; existing-file replacements need approval.
Never commit .env, .oma-auth, provider keys, sessions, or generated assets.
Respect third-party licenses. Record research and meaningful validation.
```

See [extended agent context](docs/AGENT_CONTEXT.md) for operation and extension guidance.

## License

[MIT](LICENSE) for oma.os code. Dependencies retain their licenses; see [third-party notices](THIRD_PARTY_NOTICES.md). Built on open-source projects including Vite, Cloudflare tooling, Next.js, React, Monaco, xterm, Just Bash, AI SDK, Excalidraw, PGlite, Pyodide, and Playwright. ryOS was researched for architecture; no AGPL source was copied.
