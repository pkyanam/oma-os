# Copy/paste agent context

Paste this block into a coding agent working on a clone of oma.os:

```text
You are developing oma.os, a local-first browser desktop inspired by Omarchy.
Read AGENTS.md, BUILD_PLAN.md and OMA_OS_V1_SPEC.md before making changes.
The user's instructions and BUILD_PLAN.md resolve conflicts in the original spec.

Stack: Next.js App Router, React, TypeScript, Zustand, OPFS, xterm, Monaco.
Start: npm ci && npm run dev. Preview: http://localhost:3017.
Verify: npm test && npm run typecheck && npm run build.
Browser regression tests: npm run test:e2e (install Playwright Chromium first).

Keep the Tokyo Night tokens, 32px bar, 2px borders, 8px gaps and titlebar-free
binary-tree tiling. Do not add dashboard cards, gradients, blur or UI kits.
Keep app clients mounted through layout/workspace changes. Files live in OPFS;
localStorage only persists desktop configuration. Do not overwrite seeded files.

Desktop commands belong in lib/oma/bus.ts. Terminal, launcher and agent share
that bus. The agent-specific capabilities/inspect contract is in
lib/oma/agent-contract.ts; read docs/AGENT_CONTRACT.md. App metadata lives in lib/apps/registry.ts. Never fake command output.
Only implement capabilities that the current browser/runtime really supports.

Local HTML apps run in an opaque-origin iframe sandbox. Do not give them the
parent origin, filesystem, auth session or arbitrary command-bus access.
External sites stay inside the OS Browser. Use its available document, embed or
isolated Chromium mode; report deployment limitations honestly. Never add an
unrestricted fetch proxy or grant local HTML the parent origin.

Do not commit credentials, browser data, generated Monaco assets or .env files.
Preserve MIT licensing and third-party notices. Do not copy AGPL ryOS code.
Describe behavior, test evidence and remaining limitations honestly.
```

## Operating a running desktop

- Mac: **⌘K** opens the launcher. **Ctrl+.** opens the system menu.
- Click the focused app name in the top bar for window controls.
- `oma help`, `oma window list`, `oma ws 2`, `oma launch editor`
- `oma fs ls /home/guest`, `oma fs read PATH`, `oma fs write PATH "text"`
- `oma run /home/guest/Projects/interval.html`
- `oma reset` refuses to erase files unless explicitly passed `--yes`.

`/.oma/SKILL.md` is also seeded inside the browser filesystem. This desktop is
not a Linux machine: there is no package manager, process isolation runtime,
network shell, or native executable support in the first build.


## Built-in agent discovery

Use `desktop` with `{"argv":["capabilities"]}` for the machine-readable agent
command contract, and `{"argv":["inspect"]}` for current workspace, focus,
normalized layout bounds and safe runtime status. Agent composer `/inspect`
and `/capabilities` work offline too. These are not WebMCP or HTTP endpoints.
Declared window paths are launch metadata, not current app selections.

The seeded `default_agent = "none"` in `/.oma/config.toml` is a legacy default,
not the live ChatGPT/provider connection state. Never diagnose the current
connection from that file. Keys remain private; inspect returns no credentials.

The real read-only Just Bash tool supports pipelines over selected desktop
scope, while Python Lab and SQL Workbench are user-operated runtimes. No
agent Python/SQL execution or browser DOM tool exists. Review the complete
[agent contract](AGENT_CONTRACT.md) before building integrations.
