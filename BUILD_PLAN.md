# oma.os implementation plan

The user expanded the original [v1 specification](OMA_OS_V1_SPEC.md) into a feature-rich, self-hostable desktop with a real model harness and native open-source applications. This document records the revised scope; implementation evidence and limitations live in [the research index](docs/RESEARCH.md).

## Product priorities

1. Keep the live desktop available at port 3017 throughout iteration.
2. Make shared files and reliable application workflows the foundation: create, edit, execute, save, reopen, export and recover from failure.
3. Preserve Tokyo Night visual coherence while supporting narrow windows, touch, keyboard navigation and visible window controls.
4. Make agent capabilities discoverable and inspectable. Report actual results, request review for existing-file changes, support cancellation, and never equate a browser runtime with a Linux VM.
5. Deliver an MIT-licensed repository with reproducible installation, deployment guidance, source attribution and meaningful tests.

## Implemented architecture

- A Next.js desktop with persistent binary-tree tiling, nine workspaces, a launcher, window controls and configurable keyboard modifiers. Hidden workspaces retain their application instances.
- A shared OPFS filesystem, atomic writes, optimistic edit conflicts and guarded document closing. Portable ZIP backups complement browser persistence.
- Monaco Editor, Files, Notes, Tasks, Canvas, Media and editable local HTML applications share normal documents instead of private demo state.
- Actual Just Bash in workers, actual Pyodide Python, and actual PGlite PostgreSQL with explicit stop/recovery behavior.
- Native Excalidraw with portable scenes and image assets.
- AI SDK ToolLoopAgent with streamed output, bounded steps, scoped filesystem tools, a read-only shell, review checkpoints and persisted conversations. The bundled ChatGPT auth service is optional; direct CORS-capable providers are also supported.
- An internal Browser with document, embed and real Chromium modes. Chromium needs a persistent Node host; normal Vercel deployments use the other modes. Websites keep their own account and anti-bot requirements.

## Feedback-driven hardening

Real user and built-in-agent feedback is driving fixes for Python save/export/worker lifecycle, close confirmations, mobile header collisions, terminal command integration, browser rendering and discoverable capabilities. Additional work includes a versioned agent contract, structured desktop inspection, session activity and diagnostics. Existing-file approvals remain under user control.

## Verification and delivery

- Unit tests exercise filesystem integrity, path boundaries, command parsing, layout restoration, worker lifecycle, agent cancellation and integration data formats.
- Isolated browser tests exercise actual application workflows, persistence, downloads, stop/reconnect and responsive/touch layouts without altering the user's desktop.
- Live website tests are opt-in because third-party services and network conditions are external dependencies.
- Production compilation and a standalone-server smoke check precede publication.
- Publish the GitHub source and a Vercel preview. Document persistent-host capabilities separately from serverless capabilities; do not advertise Cloudflare compatibility until its adapter is implemented and tested.

## Deliberately deferred

A Linux kernel, arbitrary native executables, browser-native WebMCP registration, unrestricted agent Python execution, remote-agent handoff, cross-device file synchronization and a full app permission marketplace are not shipped capabilities. The [future compute proposal](docs/research-agent-compute.md) defines the isolation tests needed before exposing stronger execution tools.

## Design reference

Reviewed [ryOS](https://github.com/ryokun6/ryos) for app-instance and sandboxed applet patterns. The implementation is original and does not incorporate its AGPL source. Open-source components incorporated directly retain their own notices and licenses.
