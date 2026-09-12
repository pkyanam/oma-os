# oma.os first build

Preserve the Tokyo Night desktop in [the spec](OMA_OS_V1_SPEC.md). Ship v1 before any provider integration or Linux runtime.

## Clarifications

- The spec assigns Alt+K to both focus-up and help. Alt+K opens help; Alt+Arrow keys provide all four focus directions, with Alt+H/J/L also supported. Alt+Shift+H/J/K/L swaps. Help documents this explicitly.
- Use the maintained @xterm/xterm package (the spec's unscoped xterm is legacy).
- Autosave editor buffers after 350 ms, flush pending changes on close/workspace switch, and expose saved/saving/error state. Ctrl+S also saves. Never silently discard an unsaved buffer.
- Serve fonts and Monaco assets locally. The first build needs no external service or credential.
- Keep workspace clients mounted while hidden so terminals and buffers survive navigation. Fullscreen uses the existing tile, preserving client state.
- One command bus owns terminal, launcher, menu and local agent commands. Validate paths/workspace IDs and report actual filesystem errors.
- Welcome dismissal is an OPFS marker; seed missing files only, never overwrite edits on startup. UI state persists independently.
- Destructive reset requires confirmation in UI or explicit `oma reset --yes`.

## Delivery sequence

1. Start the local Next.js server and share its URL immediately.
2. Build and test binary-tree geometry, persistence and keyboard routing.
3. Add xterm, OPFS, Monaco and the shared command bus.
4. Add searchable launcher, keyboard menu, welcome and offline agent.
5. Check production compilation, layout/parser tests and browser behavior at 1280×800 and 1920×1080.

Vercel-ready source is part of this build; public deployment depends on an available project/account. Development runs locally for immediate review. Phase 1.5 and the Linux guest remain deferred.
