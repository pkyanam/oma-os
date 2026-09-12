# oma.os agent contract 1.0.0

This document describes the implemented built-in agent interface. The runtime source of truth is `lib/oma/agent-contract.ts`; query `desktop({"argv":["capabilities"]})` for command input schemas, result envelopes, examples, permissions and error codes. This is an AI SDK tool contract, **not an implemented WebMCP or remote MCP service**. `/api/mcp` currently returns 501. External agents cannot use these examples as HTTP endpoints.

## Discover, inspect, act, verify

The built-in model receives three tools: `desktop`, `filesystem` and `read_only_shell`. They exist only when desktop tools are enabled. Call the desktop tool with an argument vector, without the `oma` prefix:

```json
{"argv":["capabilities"]}
```

```json
{"argv":["inspect"]}
```

```json
{"argv":["apps"]}
```

```json
{"argv":["launch","editor","/home/guest/Projects/report.md"]}
```

The human-facing Agent composer also supports `/inspect`, `/capabilities`, `/help`, `/launch`, `/ws`, `/theme`, `/ls` and `/sh SCRIPT` without a model. These slash commands are distinct from Terminal's `oma` commands. `capabilities` and `inspect` are currently agent-tool/slash commands, not additional command-bus commands.

Desktop operations return an envelope:

```json
{"ok":true,"message":"Current desktop state","data":{"contractVersion":"1.0.0","workspace":1,"focusedWindow":"editor-1"}}
```

The example is abbreviated. The complete inspection includes all workspaces, their focused window IDs, windows, full-screen window ID, and safe live agent metadata. Each window has `id`, `app`, `title`, `workspace`, `focused`, `visible`, `fullscreen`, `layoutBounds`, `declaredPath`, `pendingSave`, `appState` and `selection`.

- `layoutBounds` contains normalized `x`, `y`, `width`, `height` within the binary layout tree. These are **not rendered pixel bounds**; responsive stacking and full-screen mode can change visible geometry.
- `focused` describes each workspace's remembered focus; top-level `focusedWindow` is the active workspace's focus.
- `declaredPath` is launch metadata. It can differ from the document or URL subsequently selected inside an app.
- `appState` and `selection` are currently `null`, deliberately. Read saved artifacts with the filesystem tool; this cannot see unsaved editor buffers or browser DOM.
- `agent` contains runtime `status`, configured `mode`, `modelSelected`, and `toolsEnabled`. It never includes a key, cookie, auth token or provider URL. A selected model does not prove the connection currently works.

The legacy seeded `/.oma/config.toml` field `default_agent = "none"` is not live model connection state. The desktop continues to work without a configured model. Use Agent Settings and runtime status to distinguish an unconfigured model from a provider error.

## Errors and command semantics

Arguments are checked against the advertised command grammar before dispatch. Extra arguments, invalid workspace numbers and unknown app IDs are rejected rather than silently ignored. Errors carry actionable suggestions:

```json
{
  "ok": false,
  "code": "CONTEXT_UNAVAILABLE",
  "message": "There is no focused window in the active workspace.",
  "suggestions": ["Launch an app or switch to a workspace with windows."],
  "retryable": false
}
```

| Code | Meaning |
| --- | --- |
| `UNSUPPORTED_COMMAND` | No implemented agent command with that name |
| `PERMISSION_DENIED` | A known operation is disallowed, or a scoped path/storage permission is denied |
| `INVALID_ARGUMENT` | Arguments do not match any advertised variant |
| `CONTEXT_UNAVAILABLE` | The operation requires a focused window but none exists |
| `NOT_FOUND` | A surfaced filesystem operation reports a missing entry |
| `CONFLICT` | Reserved for an explicit concurrency conflict |
| `CANCELLED` | Reserved for a structured cancellation result; active tool cancellation currently aborts the run |
| `UNAVAILABLE` | A capability is not available in the current environment |
| `EXECUTION_FAILED` | An execution failure without a more specific typed cause |

The underlying shared bus still has legacy text errors; these are conservatively wrapped as `EXECUTION_FAILED`, not guessed into a more specific code. `retryable: false` means inspect or change the request before retrying, rather than retrying the identical action automatically. The filesystem/shell tools retain their own result shapes; this version's standardized error envelope applies to the desktop tool.

`launch`, `browse`, `run` and `open` acknowledge desktop navigation. They do not certify that an external page loaded, a program executed, or a generated artifact passed tests. Directional focus/swap at a layout edge may leave the layout unchanged; inspect afterwards. `run` opens HTML; it is not Python or shell execution.

## Permissions and revocation

The live capability response names read/control/launch/theme/navigation permissions and scoped filesystem/shell permissions. These names describe current enforcement; they are not yet individually configurable grants.

- Reads and new directories/files in allowed paths need no approval. Creation is atomic and refuses an existing file.
- Existing-file edits show exact before/after content for approval, then check that the original file still matches. Declining never authorizes a retry. Concurrent edits must be reread and reviewed again.
- Scope is `/home/guest` and public `/.oma`. Private roots `agent`, `conversations`, `auth`, `private`, `credentials` and `secrets` under `/.oma` are excluded case-insensitively.
- The agent cannot reset the desktop, delete files, close windows or approve its own edits.
- Just Bash runs in a disposable worker through a read-only filesystem adapter. Redirection and other mutations are denied by the adapter. There is no network, Python, native process or desktop command bridge.
- Stop cancels the current model turn, pending approvals and shell worker. Disable desktop tools in Agent Settings to revoke all model tools on future turns. There is no fine-grained revocation UI yet.

File content and tool output are untrusted inputs, not instructions. Local HTML runs in a sandbox without parent-origin storage privileges. Browser navigation does not grant a webpage control over the agent.

## Files, persistence and resumability

User documents live in OPFS. Paths are scoped to this browser origin; this is not the host filesystem. Native applications use ordinary text/JSON/CSV files and documented app formats. Discover registered applications rather than assuming IDs from an old prompt.

The agent saves local conversation archives, visible tool calls/results and partial output. Reloaded conversations replay user/assistant text, not executable approval state or unresolved tool calls. Archives are private to the agent UI; export a transcript to share it. File writes and archive saves detect concurrent changes. The desktop persists its layout separately; recovery is not a full VM snapshot. Export portable backups before clearing browser data.

## Versioning and limitations

`contractVersion` is independent of the desktop's marketing version. Compatible additions can add commands/fields; consumers should ignore unknown optional fields. Removing or changing command meanings requires a major contract revision. App IDs come from the live registry and may expand between builds.

Not implemented: WebMCP, event subscriptions, remote tool access, standard per-app adapters, selections/unsaved buffers, agent Python or SQL execution, browser DOM extraction, agent-to-agent handoff and model-controlled approvals. The Python/SQL isolation proposal in `research-agent-compute.md` is research only. Do not advertise any of these as usable tools.
