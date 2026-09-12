# oma.os v1 — Agent Build Spec

A coding agent should be able to implement v1 from this file alone.
Do not invent product scope. Do not "improve" the visual language.
Ship the desktop described here.

Date of research: 2026-09-12.
Working name: **oma.os** (Omarchy Web). Not affiliated with Omarchy / Omacom / DHH.
Tone of the product: DHH's Omarchy — keyboard-first tiling Linux desk, Tokyo Night, sharp, quiet. Not a SaaS dashboard. Not a retro toy OS. Not an AI-generated landing page.

---

## 0. What you are building

A **browser-native Omarchy-class desktop**. First paint is a full-screen tiling compositor with:

- a 32px top bar
- numbered workspaces
- tiled client windows with 2px borders and no titlebars
- `Super+Space` launcher
- `Super+Alt+Space` system menu
- a real terminal (xterm.js + in-browser command router)
- a files pane over Origin Private File System
- a code editor
- an agent pane that is a first-class window, not a floating chatbot

v1 does **not** boot a real Linux kernel. WASM Linux (CheerpX / WebVM / container2wasm) is Phase 2. Leave a `GuestRuntime` interface so it can be plugged in later.

v1 **does** run on Vercel as a Next.js App Router app that is almost entirely client-side.

---

## 1. State of the art (2026-09-12) — decisions already made

### 1.1 Comparable products

| Product | What it is | Steal | Do not steal |
|---|---|---|---|
| Omarchy 4 "Quattro" | Arch + Hyprland + Quickshell. Agents are users. Unified `omarchy` CLI. Theme is one `colors.toml`. | Doctrine, keybinds, theme model, bar density, no titlebars, CLI-as-OS | 6 GB ISO, Wayland, AUR, GPU blur |
| tryomarchy.dev | Real Hyprland streamed as H.264 from a Cloudflare Container | Super-key remap (Alt acts as Super), 6-second "boot" illusion | Per-session VM cost, no offline, no agent protocol |
| ryOS (os.ryo.lu) | React desktop, IndexedDB VFS, AI assistant, 27 apps | Persistence pattern, app registry | Retro skins, playful chrome, non-tiling windows |
| Puter | Cloud desktop + app store + OPFS/cloud FS | File UX seriousness | Start-menu metaphor, icon soup |
| WebVM 2.0 / CheerpX | Unmodified Debian + Xorg/i3 in-browser via x86→WASM JIT | Phase 2 compute plane | Shipping it in v1. Community license is free for individuals/FOSS; commercial orgs need a paid license and cannot self-host the runtime. Load from `https://cxrtnc.leaningtech.com/` later. |
| Greenfield | Wayland compositor in the browser | Phase 4 research | v1 |
| dockview / FlexLayout / Golden Layout | IDE docking managers | Nothing for the compositor | Titlebars, tabs-as-OS, VS Code chrome |
| react-mosaic | React tiling WM | Binary-tree split model | Blueprint theme, window chrome |

### 1.2 Hosting decision: **Vercel for v1. Cloudflare only if Phase 2 assets demand it.**

v1 is a static-ish client app plus two tiny routes (`/api/health`, later `/api/mcp` and `/api/chat`). That is what Vercel is for.

| Constraint | Vercel (2026) | Cloudflare Workers / Pages | Implication |
|---|---|---|---|
| Static CDN | Yes, global | Yes, unmetered static | Either works for the GUI |
| Single asset size | Comfortable for JS bundles | Pages: **25 MiB per file** | A Debian disk image cannot live on CF Pages |
| Function memory | 2–4 GB Fluid Compute | **128 MB isolate** (JS + WASM) | Do not run a VM or LLM inside a Worker |
| WASM in the browser | Served as static files from `public/` | Same, if < 25 MiB or put on R2 | Browser WASM is not a server problem |
| SharedArrayBuffer | Set COOP/COEP on the app | Same | Needed only when the Linux guest arrives |
| AI primitives | AI SDK 7, AI Gateway, `mcp-handler`, Vercel Blob | Workers AI, Durable Objects | Agent chat in v1.5 is one Vercel route |
| Egress for big images | Billed | R2 = **zero egress** | Phase 2 disk images belong on R2 or CheerpX's CDN |

**Do not put the compositor in a Worker. Do not SSR the desktop.** The desktop is a client component mounted on `/`.

Use these Vercel primitives and no others in v1:

- Next.js App Router
- `ai` + `@ai-sdk/react` (agent pane only; optional until the GUI is done)
- `mcp-handler` for `app/api/mcp/route.ts` when you add the agent bus
- `vercel.json` headers
- optional Vercel Blob **later** for shared snapshots — not v1

Skip for v1: Vercel KV, Postgres, Auth.js, Neon, Drizzle, server actions that touch the desktop state, `next/og`, middleware auth walls.

Cloudflare becomes relevant in Phase 2 if you host a custom ext2/squashfs image (R2) or want a Durable Object per shared live session. Document the seam. Do not build it now.

### 1.3 Tiling library decision: **write it. ~400 lines.**

Dockview and react-mosaic produce the wrong object: IDE panels with tabs and titlebars. Hyprland clients are border + content. A custom binary tree is the product.

Model:

```
type SplitDir = "row" | "col";
type TileId = string;

type LayoutNode =
  | { type: "leaf"; id: TileId }
  | { type: "split"; dir: SplitDir; ratio: number; a: LayoutNode; b: LayoutNode };
```

`ratio` is the fraction given to `a` (0.2–0.8). Drag the 6px gutter to change it. New windows split the focused leaf, alternating dir (Hyprland dwindle-ish). Closing a leaf promotes its sibling.

Workspaces are `Record<1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9, { layout: LayoutNode | null; focus: TileId | null }>`.

---

## 2. Non-goals for v1

- Real Linux / CheerpX / v86 / qemu-wasm / Alpine image
- Wayland, Hyprland, Quickshell ports
- User accounts, billing, teams
- Mobile layout (desktop browser only; 1280×800 minimum)
- Glassmorphism, mesh gradients, glow, neon, "AI orb", purple-on-black SaaS
- Rounded-2xl cards, drop shadows beyond a 1px border
- An app store
- Collaborative cursors
- Local LLM
- Windows 95 / macOS Aqua skins

If a library or UI pattern pulls you toward any of the above, reject it.

---

## 3. Visual spec — this is the product

Copy Omarchy Tokyo Night. Do not approximate. Do not add a second palette until the theme engine exists.

### 3.1 Tokens (`app/theme/tokyo-night.css`)

```css
:root[data-theme="tokyo-night"] {
  --bg:        #1a1b26;
  --bg-dim:    #16161e;
  --bg-el:     #1f2335;
  --bg-hl:     #292e42;
  --fg:        #c0caf5;
  --fg-dim:    #a9b1d6;
  --fg-mute:   #565f89;
  --border:    #3b4261;
  --accent:    #7aa2f7;
  --red:       #f7768e;
  --orange:    #ff9e64;
  --yellow:    #e0af68;
  --green:     #9ece6a;
  --cyan:      #7dcfff;
  --magenta:   #bb9af7;
  --term-black:#32344a;
  --gap:       8px;
  --gap-out:   10px;
  --bar-h:     32px;
  --border-w:  2px;
  --radius:    0px;
  --font-ui:   "Inter", "IBM Plex Sans", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "JetBrains Mono", "CaskaydiaCove NFD", ui-monospace, monospace;
}
```

Active client border = `--accent`. Inactive = `--border`. Focused workspace number in the bar = `--accent`. Everything else is `--fg-dim` on `--bg`.

Wallpaper: a **single photographic still**, darkened to ~30% over `--bg`. Do not generate a colorful gradient mesh. Prefer a muted night city / lake / forest photograph at low saturation, or a flat `--bg` with no wallpaper. If you ship a wallpaper, put it at `public/wall/tokyo-night.jpg` and overlay `background-color: color-mix(in srgb, var(--bg) 55%, transparent)`.

### 3.2 Geometry

- App shell is `100dvh × 100dvw`, `overflow: hidden`, `user-select: none` except in editors/terminals.
- Top bar: 32px, `background: var(--bg-dim)`, bottom edge `1px solid var(--border)`. No blur. No shadow.
- Desktop area: `padding: var(--gap-out)`. Tiles separated by `var(--gap)`.
- Tile: `border: var(--border-w) solid var(--border)`. Focused: `border-color: var(--accent)`. **No titlebar. No traffic lights. No shadow. No radius.**
- Resize gutter: 6px hit target, 1px visible line `var(--border)` on hover `var(--accent)`.
- Launcher / menu: 560px wide, max 420px tall, centered, `background: var(--bg-el)`, `border: 1px solid var(--border)`. No backdrop blur. A 40% `#000` scrim is allowed.
- Notifications: top-right stack, 320px wide, same chrome as the menu.

### 3.3 Type

- Bar, launcher, menu: 12.5px / 13px Inter, tracking normal, weight 450.
- Monospace everywhere a path, command, or keybind appears: JetBrains Mono 12px.
- Do not use 8xl display type. There is no marketing page in v1. `/` IS the OS.

### 3.4 Motion

- Workspace switch: 120ms opacity + 8px translate. Ease `cubic-bezier(0.2, 0.8, 0.2, 1)`.
- Launcher: 80ms fade. No bounce.
- Tile insert: no animation, or 80ms flex grow.
- **No spring physics. No layout thrash. No parallax.**

### 3.5 Forbidden visual moves (reject in review)

- `linear-gradient` on the shell, bar, launcher, or tiles
- `blur(` greater than 0 on bar or windows
- `box-shadow` except a single `0 0 0 1px` if a border won't do
- `border-radius` greater than 2px
- accent colors used as large fills
- emoji as UI icons (key glyphs like `⌘` are fine; a rocket is not)
- "Made with AI" badges, sparkles, orb avatars
- Inter Tight / Geist at 72px
- Rainbow active borders (Omarchy's stock tokyo-night hyprland.conf has a gradient border — **do not copy that**. Use a flat `--accent` border. The gradient is the one piece of Omarchy chrome that reads as slop on the web.)

### 3.6 Icons

Use a 16px stroke-2 icon set. Lucide is acceptable if stroked at 1.75 and colored `currentColor`. Do not mix icon families. Workspace indicators are **text numbers**, not dots.

---

## 4. Information architecture

```
┌─────────────────────────────────────────────────────────────┐
│ 1  2  3  4     oma.os          Fri 12 Sep  04:47    ▸ agent │  32px bar
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌─────────────────────────────────────┐  │
│  │ terminal     │  │ editor                              │  │
│  │              │  │                                     │  │
│  │              │  ├─────────────────────────────────────┤  │
│  │              │  │ files                               │  │
│  └──────────────┘  └─────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

Bar left: workspace numbers `1–9`. Occupied = `--fg`. Empty = `--fg-mute`. Active = `--accent` + bottom 2px underline.
Bar center: clock `Fri 12 Sep  04:47` (local). Optional focused window class in `--fg-mute`.
Bar right: `agent` status (`idle` | `think` | `err`), storage used, theme name. Clicking theme name is not a settings dump — it opens the theme switcher.

Default workspace 1 layout on first boot:

```
row 40/60
  └─ terminal
  └─ col 62/38
       └─ editor
       └─ files
```

Workspace 2 empty until the user opens something.
Workspace 3 reserved as the default target for the agent window (`Super+A`).

---

## 5. Keybinds

Browsers eat the Super/Win/Meta key. **Alt is Super.** Document this in the first-run notice and on `Super+K`.

Also support `Ctrl+Space` as an alias for the launcher because some platforms steal Alt.

| Bind | Action |
|---|---|
| Alt+Space / Ctrl+Space | Launcher |
| Alt+Shift+Space | Omarchy menu |
| Alt+Return | New terminal on focused workspace |
| Alt+W | Close focused tile |
| Alt+1 … Alt+9 | Switch workspace |
| Alt+Shift+1 … 9 | Move focused tile to workspace |
| Alt+H / J / K / L | Focus left / down / up / right |
| Alt+Shift+H / J / K / L | Swap with neighbor |
| Alt+Equal / Alt+Minus | Grow / shrink focused tile on main axis (±0.05 ratio) |
| Alt+F | Toggle tile fullscreen within the desktop area |
| Alt+A | Open / focus agent tile on workspace 3 |
| Alt+E | Open / focus editor |
| Alt+T | Cycle theme (v1 ships one theme; bind should still exist and no-op with a notice) |
| Alt+K | Keybind overlay |
| Escape | Close overlay (launcher, menu, keybinds, first-run) |

Do not bind Ctrl+W, Ctrl+T, Ctrl+N, Ctrl+R, Ctrl+L, Ctrl+Shift+C/I. The browser owns those.

When an xterm or the editor is focused, printable keys go to the client. Binds above still win.

Implement a single `useKeybind` hook that reads a table. Do not scatter `addEventListener("keydown")` across components.

---

## 6. Apps in v1

Each app is a React component registered in `lib/apps/registry.ts`.

```ts
export type AppId = "term" | "files" | "editor" | "agent" | "notice";

export type AppMeta = {
  id: AppId;
  title: string;
  singleton?: boolean;     // files, agent: one per session
  defaultWorkspace?: 1|2|3|4|5|6|7|8|9;
};
```

### 6.1 Terminal (`term`)

- `xterm` + `@xterm/addon-fit` + `@xterm/addon-webgl` if WebGL is available, else canvas.
- Theme colors from the CSS tokens (map to xterm `ITheme`).
- Font: JetBrains Mono 13, line height 1.25.
- A JS command router, **not** a Linux guest.

Prompt:

```
oma.os ~ ▸
```

Built-in commands (implement all of these):

```
help                  list commands
clear                 clear scrollback
date                  local datetime
echo <text>
theme                 print current theme
theme list
theme set <id>        only tokyo-night in v1; others print "not in v1"
ws                    print workspace + focus
ws <n>                switch workspace
launch <app>          term | files | editor | agent
close                 close this tile
oma                   same as the system CLI (see §8)
ls [path]             list OPFS
cat <path>
touch <path>
rm <path>
mkdir <path>
edit <path>           open path in editor tile
whoami                "guest"
uname                 "oma.os v1 (web)"
```

Unknown commands: `command not found: foo`. No jokes. No ASCII art on startup other than one line:

```
oma.os v1 — Alt+Space launcher · Alt+K keys
```

Resize: FitAddon on container resize via ResizeObserver. Debounce 50ms.

### 6.2 Files (`files`)

OPFS via `navigator.storage.getDirectory()`. Wrap in `lib/fs/opfs.ts`.

UI: two columns. Left 220px tree. Right listing. Selected row `--bg-hl`. Double-click file → editor. Double-click dir → descend.

Root listing always includes:

```
/home/guest
/home/guest/Projects
/home/guest/Documents
/.oma
/.oma/SKILL.md
/.oma/config.toml
```

Seed those on first boot (`lib/fs/seed.ts`). `SKILL.md` contents are in §11. `config.toml`:

```toml
theme = "tokyo-night"
default_agent = "none"
bar.clock = "local"
```

No drag from the host desktop in v1 (File System Access API is Phase 1.5).

Show storage estimate from `navigator.storage.estimate()` in the bar.

### 6.3 Editor (`editor`)

Monaco via `@monaco-editor/react`. Theme `vs-dark` remapped to Tokyo Night tokens (define a custom Monaco theme named `oma-tokyo-night`). Vim mode is **not** required in v1. Tab size 2. Minimap off. Line numbers on. Font JetBrains Mono 13.

Open files from OPFS. Dirty buffer indicator in the bar center when focused.

### 6.4 Agent (`agent`)

v1 ships the **pane and the protocol stub**, not a billed chatbot.

Layout: transcript (top) + input (bottom). Empty state is three lines of `--fg-mute`:

```
No default agent.
Commands still work: type "oma help" in a terminal.
Connect a provider in Phase 1.5.
```

Input submits to `lib/agent/router.ts`. In v1 the router handles only local slash commands:

```
/help
/theme <id>
/launch <app>
/ws <n>
/ls
```

Anything else replies with a single system line: `offline: no model configured`. Do not fake an LLM. Do not call a public demo key.

When Phase 1.5 lands, this pane uses `useChat` from `@ai-sdk/react` against `app/api/chat/route.ts`, with tools that call the same `oma` command bus as the terminal.

### 6.5 Notice

First-run card. Five facts, one action (`Enter` dismisses and writes `/.oma/seen-welcome`).

```
oma.os
Alt is Super. Alt+Space opens the launcher.
Alt+HJKL moves focus. Alt+1..9 switches workspaces.
Nothing leaves this browser unless you connect an agent later.
This is not Omarchy Linux. It is the desk, in a tab.
```

---

## 7. System overlays

### 7.1 Launcher (`Alt+Space`)

Fuzzy filter over: apps, `oma` commands, files under `/home/guest` (cap 20), workspaces.

Rows: 32px. Icon + title + `--fg-mute` keybind hint on the right.
Type-ahead is case-insensitive subsequence match.
Enter runs the highlighted row. `Ctrl+J/K` or arrows move.

### 7.2 Menu (`Alt+Shift+Space`)

Static groups, Walker/Omarchy-menu shaped:

```
Launch
  Terminal
  Editor
  Files
  Agent
Workspace
  1 … 9
Theme
  Tokyo Night
System
  Keybinds
  Reset machine     (wipes OPFS after confirm)
  About
```

Keyboard only. No mouse-required item.

### 7.3 Keybind overlay (`Alt+K`)

Two columns of the table in §5. Centered panel. Same chrome as launcher.

---

## 8. The `oma` command bus

This is the OS. Terminal, launcher, menu, agent, and (later) MCP all call the same functions.

```ts
// lib/oma/bus.ts
export type OmaResult = { ok: true; message: string; data?: unknown } | { ok: false; message: string };

export async function oma(argv: string[], ctx: BusContext): Promise<OmaResult>;
```

Commands to implement in v1:

```
oma help
oma version                          → "oma.os 0.1.0"
oma theme
oma theme list
oma theme set <id>
oma ws
oma ws <n>
oma launch <app>
oma close
oma focus left|right|up|down
oma swap left|right|up|down
oma reset                            → requires --yes
oma fs ls [path]
oma fs read <path>
oma fs write <path>                  → body from ctx.stdin or arg
oma snapshot list                    → v1: "snapshots: Phase 1.5"
oma agent status                     → "offline"
```

`BusContext` holds the zustand store APIs and the OPFS handle. Never import React in this file.

---

## 9. State

Zustand store, persisted to `localStorage` for UI and OPFS for files.

```ts
// lib/state/store.ts
type Store = {
  theme: "tokyo-night";
  workspace: 1|2|3|4|5|6|7|8|9;
  workspaces: Record<number, { layout: LayoutNode | null; focus: TileId | null }>;
  tiles: Record<TileId, { app: AppId; title: string; createdAt: number }>;
  overlay: null | "launcher" | "menu" | "keys" | "welcome";
  agentStatus: "idle" | "think" | "err" | "offline";
  // actions: focusDir, swapDir, closeTile, launch, gotoWs, moveToWs, setRatio, setOverlay
};
```

Persist: `theme`, `workspace`, `workspaces`, `tiles`. Do not persist `overlay`.

On boot: if no persist, seed workspace 1 as in §4 and open the welcome overlay.

---

## 10. Repository layout

```
oma-os/
  AGENTS.md                         ← point here: "read artifacts/OMA_OS_V1_SPEC.md"
  package.json
  next.config.ts
  vercel.json
  tsconfig.json
  public/
    wall/tokyo-night.jpg            ← optional, photographic, muted
    fonts/                          ← self-host JetBrains Mono + Inter, no Google Fonts runtime
  app/
    layout.tsx                      ← html/body full viewport, no nextjs template chrome
    page.tsx                        ← "use client" desktop
    globals.css                     ← tokens + reset only
    api/health/route.ts             ← { ok: true, version }
    api/mcp/route.ts                ← stub 501 until Phase 1.5
  components/
    Bar.tsx
    Desktop.tsx
    Tile.tsx
    Split.tsx
    Launcher.tsx
    Menu.tsx
    Keys.tsx
    Welcome.tsx
    apps/
      Terminal.tsx
      Files.tsx
      Editor.tsx
      Agent.tsx
  lib/
    oma/bus.ts
    oma/parse.ts
    apps/registry.ts
    fs/opfs.ts
    fs/seed.ts
    layout/tree.ts                  ← split / close / neighbor / swap
    layout/geometry.ts              ← focus direction given bounding boxes
    keys/bindings.ts
    keys/useKeybind.ts
    state/store.ts
    theme/tokens.ts
    agent/router.ts
  themes/
    tokyo-night.json                ← colors.toml equivalent
```

Next.js config notes:

- `app/page.tsx` is a client component. Do not wrap the desktop in a server `children` forest.
- Disable the default Next.js 404 / error chrome looking like a marketing page.
- Fonts: `next/font/local` from `public/fonts`.

`vercel.json`:

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "Referrer-Policy", "value": "no-referrer" }
      ]
    }
  ]
}
```

Do **not** set `Cross-Origin-Embedder-Policy: require-corp` in v1. It will break Monaco CDN workers and any future third-party font. Enable COOP/COEP only when the WASM guest lands, and host every worker same-origin.

---

## 11. `/.oma/SKILL.md` (seed this exact file into OPFS)

```markdown
# oma.os skill

You are operating oma.os, a browser desktop inspired by Omarchy Linux.
You are a user of the machine. Prefer the command bus to clicking.

## Rules
- Mutate state only through `oma …` commands.
- Do not wipe /home without `oma reset --yes`.
- Theme IDs are slugs from `oma theme list`.
- Workspaces are 1–9. Tiling is a binary tree. There are no titlebars.
- Files live in Origin Private File System. Paths start at /home/guest or /.oma.

## Useful commands
- oma help
- oma launch term|files|editor|agent
- oma ws N
- oma theme set tokyo-night
- oma fs ls /home/guest
- oma fs read PATH
- oma fs write PATH

## Constraints
- There is no package manager and no root.
- There is no network from the guest. The page itself may call /api/*.
- If a model is not configured, say so. Do not invent command output.
```

---

## 12. Implementation order (follow this)

A coding agent should commit after each step. Do not skip ahead to the agent pane or MCP.

### Step 1 — Skeleton on Vercel
- Next.js latest App Router, TypeScript, no Tailwind plugin theme packs. Tailwind v4 is allowed **only** as a utility engine; all colors come from the CSS variables in §3.1. No `@tailwindcss/typography`. No `shadcn` install. No `aceternity`. No `magicui`.
- Reset CSS. Full-viewport `page.tsx`.
- Deploy empty Tokyo Night screen with the 32px bar and clock.
- Acceptance: `https://*.vercel.app` shows a 32px bar on `#1a1b26`. No gradient. No Vercel splash leftovers.

### Step 2 — Layout engine
- `lib/layout/tree.ts` with unit tests (node:test or vitest): split focused leaf, close leaf, swap siblings, ratio clamp.
- Render `Split` / `Tile` recursively. Empty workspace = centered `--fg-mute` hint `Alt+Return terminal · Alt+Space launcher`.
- Acceptance: three panes on ws 1, drag gutter, close one, the other fills.

### Step 3 — Keybinds + workspaces
- `useKeybind` + workspace switcher in the bar.
- Focus ring = accent border.
- Acceptance: Alt+1..4, Alt+HJKL, Alt+Return, Alt+W all work with the terminal unfocused. With the terminal focused, the same binds still work.

### Step 4 — Terminal
- xterm.js, command router, `oma` wired to the bus.
- Acceptance: `oma launch files` opens the files tile. `oma ws 2` switches.

### Step 5 — OPFS files + seed
- Seed §6.2 paths. Files app lists them. `cat /.oma/SKILL.md` works in the terminal.
- Acceptance: refresh the tab, the files are still there.

### Step 6 — Editor
- Monaco, open from files and from `edit`.
- Acceptance: edit `/.oma/config.toml`, reload, change is on disk.

### Step 7 — Launcher, menu, keys, welcome
- Acceptance: a new session shows welcome; Enter dismisses permanently. Alt+Space launches apps by name.

### Step 8 — Agent pane stub
- Local slash commands only.
- Acceptance: Alt+A focuses ws 3 with the agent tile. `/theme tokyo-night` prints ok. `hello` prints `offline: no model configured`.

### Step 9 — Polish pass (mandatory)
- FitAddon resize
- no layout shift on bar clock
- no horizontal scrollbar on the shell
- launcher scroll stays inside the panel
- 1280×800 and 1920×1080 both usable
- `prefers-reduced-motion` disables the 120ms workspace fade
- Lighthouse is irrelevant; visual correctness is the test
- Manual screenshot against Omarchy Tokyo Night references. If it looks like a dashboard, fix it.

Do not start Phase 1.5 until Step 9 is done.

---

## 13. Phase 1.5 (after v1 looks right)

Only then:

1. `app/api/chat/route.ts` with AI SDK 7 `streamText`, model via AI Gateway (`anthropic/claude-sonnet-4.6` or whatever the project key allows). Tools wrap `oma()`.
2. `app/api/mcp/route.ts` via `mcp-handler` exposing the same tools. Streamable HTTP. No auth in the first cut; gate with a bearer token in env `OMA_MCP_TOKEN` before any public deploy.
3. Snapshots: copy OPFS `/home` to `/snap/<iso-time>` and `oma snapshot restore`.
4. Theme pack #2: `nord` (`bg #2e3440`, accent `#81a1c1`). Same geometry. No new components.

Phase 2 (not specified here): `GuestRuntime` + CheerpX loaded from Leaning Tech CDN, OPFS overlay home, COOP/COEP headers, `uname` starts telling the truth.

---

## 14. Dependencies (allowed)

```
next
react react-dom
zustand
xterm @xterm/addon-fit @xterm/addon-webgl
@monaco-editor/react monaco-editor
lucide-react          # icons only
zod
```

Phase 1.5 add:

```
ai @ai-sdk/react @ai-sdk/mcp
mcp-handler
```

Banned unless this spec is updated:

- shadcn/ui, radix themes, mantine, chakra, daisyui
- framer-motion / motion (CSS transitions only)
- three.js, react-three-fiber
- next-themes with a light default
- google fonts CDN
- any "AI chatbot widget" npm package
- dockview, flexlayout, golden-layout, react-mosaic
- cheerpx, v86 in v1

---

## 15. Testing

- `lib/layout/tree.ts` — 10 tests minimum (split, close last child, close one side of a nested split, ratio clamp, neighbor lookup).
- `lib/oma/parse.ts` — argv splitting with quotes.
- `lib/fs/opfs.ts` — skip in CI if OPFS missing; run in Playwright.
- Playwright spec `e2e/desktop.spec.ts`:
  1. loads `/`
  2. presses Alt+K, overlay visible
  3. Escape
  4. Alt+Return, a second terminal tile exists
  5. types `oma version` → `oma.os 0.1.0`

---

## 16. About page / README (ship in-repo, not as a marketing site)

```
oma.os
A browser desktop with Omarchy's habits.

Alt is Super.
This is not Linux. It is the desk.

MIT.
Not affiliated with Omarchy, Omacom, 37signals, or DHH.
```

That is the whole README. Link this spec under "Build".

---

## 17. Review checklist before calling v1 done

- [ ] No gradient anywhere in the shell
- [ ] No titlebars on tiles
- [ ] Active border is `#7aa2f7`, 2px
- [ ] Bar is 32px and does not blur the wallpaper
- [ ] JetBrains Mono in terminal and editor
- [ ] Alt+Space launcher works even when xterm is focused
- [ ] OPFS survives reload
- [ ] `/.oma/SKILL.md` exists and matches §11
- [ ] `oma` in the terminal drives workspaces and launch
- [ ] Agent pane does not pretend to be a model
- [ ] Deployed on Vercel from `main`
- [ ] Looks like a Hyprland screenshot, not a YC dashboard

If the desktop could be mistaken for Linear, Vercel’s template gallery, or ChatGPT’s canvas, it is wrong. Go back to §3.
