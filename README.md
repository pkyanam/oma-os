# oma.os

[Live desktop](https://oma-os-red.vercel.app) · [Agent contract](docs/AGENT_CONTRACT.md) · [Deployment guide](docs/DEPLOYMENT.md)
A local-first browser desktop for thinking, making, and working with an agent. Tokyo Night, tiled windows, nine workspaces, real applications, and one shared filesystem.

**[Quick start](#quick-start) · [Applications](#applications) · [Self-hosting](#self-hosting) · [For agents](#for-agents) · [Research](docs/RESEARCH.md)**

MIT licensed. Inspired by Omarchy; not affiliated with Omarchy, Omacom, OpenAI, or Vercel.

## Quick start

Requires **Node.js 22+ and Git**. On macOS or Linux:

```sh
curl -fsSL https://raw.githubusercontent.com/pkyanam/oma-os/main/scripts/install.sh | sh
```

The [installer](scripts/install.sh) clones into a new `oma-os` directory, installs dependencies and Chromium, then starts **[localhost:3017](http://localhost:3017)**. It refuses to overwrite an existing directory. Set `OMA_INSTALL_DIR` for another destination or `OMA_SKIP_BROWSER=1` to skip Chromium. Review the script before running it.

Or install manually:

```sh
git clone https://github.com/pkyanam/oma-os.git
cd oma-os
npm ci
npm run setup:browser
npm run dev
```

Linux may need `npx playwright install-deps chromium`. Use HTTPS or localhost for browser filesystem access.

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

**ChatGPT account:** the bundled [Login with ChatGPT](https://github.com/opencoredev/login-with-chatgpt) community SDK handles device authorization and server-side proxying. Read the in-app consent text. This is not an official OpenAI sign-in SDK. Models are discovered from the account. Self-hosted encrypted sessions live in `.oma-auth`; disconnect removes the session.

**Provider key:** enter an OpenAI-compatible endpoint, key, and model ID. Requests go directly from the browser to a CORS-enabled provider. Keys stay in tab memory; endpoint/model preferences can persist. Reloading requires reentering the key.

Selected file context and tool-read content are sent to your model. Replacing an existing file requires approval. The shell tool is enforced read-only. Stop ends a run; completed file writes remain. Provider access, quotas, and usage charges belong to your account.

## Website rendering

| Mode | Capabilities |
| --- | --- |
| Chromium | Real isolated browser on a persistent Node server: JavaScript, CSS, mouse, keyboard, scrolling, navigation inside oma.os |
| Document | Readable HTML with scripts removed; links and GET forms stay inside the OS |
| Embed | Direct iframe when the website permits embedding |
| Local app | Opaque-origin HTML/CSS/JS sandbox with local exports and no automatic parent filesystem/auth access |

Chromium's public-only egress proxy pins DNS addresses and blocks private networks. It never uses your host browser profile. Sessions are ephemeral. Image transport currently does not relay website audio, native-frame-rate video, clipboard selection, or file-upload dialogs. Websites can still present normal bot challenges or sign-in requirements. Details: [browser](docs/research-browser.md), [Chromium service](docs/research-remote-browser.md).

## Your data

User files live in **Origin Private File System** under `/home/guest` and `/.oma`. Small window/preference records use localStorage. Different devices, browsers, and URLs have separate files; clearing site data removes them.

**Settings → Storage & backup** requests persistent storage and exports a portable ZIP. Restore previews files and skips existing paths unless replacement is explicitly selected. Save open documents first. Server authentication secrets and provider keys are excluded; personal notes and saved conversations can be included.

Python downloads a pinned Pyodide runtime on first use. Models and external websites need network access. Local data persistence does not promise complete offline startup after a fresh reload.

## Self-hosting

### Node

```sh
npm ci
npm run setup:browser
npm run build
OMA_BROWSER_ENABLED=1 npm start
```

Production uses port **3017** by default (`PORT` overrides it). The startup script serves Next's standalone build and keeps authentication storage outside generated files. Use HTTPS and your normal access controls before exposing a Chromium-enabled host publicly.

See [`.env.example`](.env.example). A persistent single host can generate its encryption secret automatically. Set `LWC_SECRET` for an explicitly managed secret and `OMA_AUTH_DIR` for persistent server storage.

### Docker

```sh
docker compose up --build -d
```

The composition binds `127.0.0.1:3017`, uses a non-root user, retains server auth in a volume, and includes Playwright's sandbox seccomp profile. Client files stay in the user's browser. See [deployment requirements and validation](docs/DEPLOYMENT.md).

### Vercel

Import this repository as a Next.js project or run `vercel --prod`. The desktop, local apps, provider-key mode, and document browser work on Vercel.

ChatGPT login requires **all three**: `LWC_SECRET`, `UPSTASH_REDIS_REST_URL`, and `UPSTASH_REDIS_REST_TOKEN`. Without shared durable storage, the UI explains the limitation and offers provider-key mode.

Interactive Chromium requires a persistent server and is disabled in Vercel functions. Cloudflare Workers is not a drop-in deployment for the Node TCP/DNS browser service. See the [capability matrix](docs/DEPLOYMENT.md).

## Contributing

```sh
npm test
npm run typecheck
npm run build
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

Start: npm ci && npm run setup:browser && npm run dev (localhost:3017).
Verify: npm test, npm run typecheck, npm run build, npm run test:e2e.

Apps share OPFS files and the typed command bus in lib/oma/bus.ts.
Register apps in lib/apps/registry.ts and mount them in components/Tile.tsx.
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

[MIT](LICENSE) for oma.os code. Dependencies retain their licenses; see [third-party notices](THIRD_PARTY_NOTICES.md). Built on open-source projects including Next.js, React, Monaco, xterm, Just Bash, AI SDK, Excalidraw, PGlite, Pyodide, and Playwright. ryOS was researched for architecture; no AGPL source was copied.
