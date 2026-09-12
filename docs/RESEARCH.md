# Research and implementation decisions

Checked September 12, 2026. These notes separate working integrations from proposed extensions. Versions are locked in `package-lock.json`; review upstream changes before upgrading.

## Architecture choices

| Need | Integrated project | Why it fits | Boundary |
| --- | --- | --- | --- |
| Agent loop | Vercel AI SDK ToolLoopAgent | Streaming, structured tools, provider adapters, bounded multi-step execution | Local desktop tools run in the user's browser; model inference remains remote |
| ChatGPT connection | login-with-chatgpt | Bundled authentication and model proxy | Requires server sessions; not a browser-only OAuth flow |
| Shell | Vercel Just Bash | Real Bash interpreter with asynchronous filesystem adapter | No Linux kernel or native processes; network disabled |
| Source editor | Monaco | Mature editing, language support, browser workers | Loaded only when needed; checked sanitizer patch documented separately |
| Python | Pyodide | Actual CPython/WebAssembly in a terminable worker | User-run code; not exposed as an unrestricted model tool |
| SQL | PGlite | Actual PostgreSQL in WebAssembly | Worker execution, local checkpoint files, no remote database needed |
| Drawing | Excalidraw | Mature native scene format and editor | Lazy loaded; scene assets stored with documents |
| Website compatibility | Playwright Chromium | Runs real page JavaScript and layout | Persistent Node host; screenshot transport has accessibility/media limitations |
| Portable files | OPFS and fflate | Browser-local bytes and interoperable ZIP export | Storage belongs to one origin/browser; backups remain necessary |

## Detailed evidence

- [Agent harness, cancellation, write approvals and context](research-agent.md)
- [Safer future agent compute: architecture and acceptance criteria](research-agent-compute.md)
- [Just Bash integration and execution limits](research-just-bash.md)
- [Browser rendering modes](research-browser.md)
- [Chromium service and public-network proxy](research-remote-browser.md)
- [Python and data runtimes](research-runtime.md)
- [Native open-source applications](research-open-source.md)
- [Creative applications and document formats](research-creative.md)
- [Files, archives and media](research-files.md)
- [Desktop controls and responsive behavior](research-desktop.md)
- [Editable local application templates](research-templates.md)
- [Dependency review and checked Monaco patch](dependency-review.md)

## What we chose not to pretend

OpenAI's open-source Codex SDK launches a native executable through Node's child-process APIs. It cannot become a browser sandbox through bundling. A future Codex integration would require an authenticated companion process. The current AI SDK harness is a real browser-compatible agent loop, with explicit local tools. [Codex execution source](https://github.com/openai/codex/blob/main/sdk/typescript/src/exec.ts).

Framing arbitrary websites cannot override their embedding policies. HTML rewriting can provide readable documents, but it is not equivalent to the original page's JavaScript environment. The bundled Chromium service supplies that environment on a persistent self-hosted server. Normal Vercel functions do not supply a persistent interactive browser session. See the browser research for the precise limits.

More applications alone do not make an agent environment reliable. Feedback from a real built-in-agent exploration is informing a discoverable capability contract, structured desktop inspection, useful errors, session activity, and diagnostics. Existing-file approvals remain human decisions; publishing an approval schema does not authorize an agent to approve its own changes.
