# Agent workbench: research and implementation

Research checked September 12, 2026. This document distinguishes implemented behavior from future extensions.

## Harness choice

oma.os uses the existing **AI SDK `ToolLoopAgent`**, not a hand-rolled simulation. A turn can stream text, invoke local tools, observe their results, and continue. The loop is bounded to twelve model steps. `prepareStep` supplies visible progress; provider usage supplies the displayed token counts. The user can stop a run, including while a write approval is open. [AI SDK ToolLoopAgent](https://ai-sdk.dev/docs/reference/ai-sdk-core/tool-loop-agent), [loop control](https://ai-sdk.dev/docs/agents/loop-control).

The agent runs in the client because its tools act on that user's desktop and OPFS. ChatGPT requests use the already bundled authentication/proxy sidecar; a CORS-capable OpenAI-compatible provider can instead receive requests directly from the browser. Direct provider keys remain in tab memory and are excluded from conversation archives. Model IDs are discovered from the connected account/provider; no fictional model selector is populated.

The Codex SDK is a different deployment model: its TypeScript execution layer imports `node:child_process` and launches a native executable. A future Codex-backed mode needs an authenticated companion process or app-server bridge. Importing that SDK into a browser bundle would not provide a sandbox VM. [Codex SDK execution source](https://github.com/openai/codex/blob/main/sdk/typescript/src/exec.ts).

## Why this is useful as a desktop agent

- **Make a small application:** build a responsive, self-contained HTML tool, save it to Projects, and open it in the OS browser. Examples: a decision matrix, a habit experiment, an interview practice timer, a card sorter, or an interactive explanation. Generated app controls are ordinary real JavaScript; the agent must not claim it tested code without an execution result.
- **Synthesize personal research:** explicitly attach local Markdown/text files, then ask for a source-attributed brief saved as a new document. File attachments are visible snapshots, limited to four files and 16,000 characters per file. The UI identifies truncation.
- **Create a learning lab:** turn a topic into an interactive demonstration, controls, and self-check questions. An HTML file remains editable and can be inspected in the editor.
- **Prepare reproducible analysis:** inspect a CSV and generate a Python script for the actual Lab app. The agent describes how to run it rather than inventing Python output.
- **Review before changing:** inspect a project, identify specific issues, and propose a fix plan. Existing-file edits show their exact proposed contents before approval.
- **Set up a focused work session:** create a practical plan and open relevant desktop applications with the same command bus used by the launcher and terminal.

These are user-editable starter prompts, not canned outputs. Selecting a starter only fills the composer. It does not spend tokens or create files until the user sends it.

## Tools and edit guarantees

`filesystem` supports directory listing, bounded text reads, filename search, directory creation, complete writes, and exact unique-text patches. Paths are normalized before scope checks. Existing writes require approval; declined edits return a concrete failure to the model. Concurrent tool calls queue their approvals. An optimistic expected-content check rejects a write if another app changed the file during review. Cancellation is checked again after approval and before mutation. There is no filesystem deletion tool.

`desktop` exposes a limited command allowlist, including app discovery, launching, document opening, workspace/window placement, and opening the embedded browser. It does not accept shell syntax, reset the desktop, or close arbitrary windows. Discovering applications through the bus keeps capabilities synchronized with the real registry.

The filesystem search does not return private conversation archives. An exported transcript can be attached explicitly. File and webpage content is treated as reference data, never elevated instructions. JSON-delimited attachments make document boundaries explicit. This is defense in depth, not a claim that prompt injection is solved.

AI SDK offers both built-in approval suspension and tool callbacks. Our browser tool callback waits for a concrete local review, then returns its real result to the same active loop. It avoids introducing a server-side desktop executor. [Tool calling and approval patterns](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling).

## Read-only shell as a real agent capability

The `read_only_shell` tool runs Just Bash in a disposable browser worker. It can inspect real desktop files with pipelines, `find`, `grep`, `jq`, `awk`, `sed`, sorting, and shell variables. Every call starts in `/home/guest`; it does not silently inherit a user's terminal state. `/sh SCRIPT` exposes the same capability directly in the agent pane without a model connection.

An explicit `IFileSystem` adapter denies every mutation method, including redirection, append, rename, copy, permission changes, and directory creation. This does not depend on screening command names: variables, scripts and substitution cannot bypass the filesystem boundary. All reads are normalized and scoped; private `/.oma` directories are omitted; symlink ancestors are rejected. The worker registers no desktop command channel and supplies no network, Python, or JavaScript execution configuration. The interpreter has a 15-second execution budget, with a separate 20-second worker deadline. Stop terminates the worker.

Just Bash's upstream documentation confirms browser support for its core interpreter and filesystem abstraction, with network and optional runtimes disabled by default. Its threat model identifies the filesystem adapter as an authority boundary and recommends isolation for untrusted workloads. We use a disposable worker and a narrower read-only adapter; this still is not a Linux VM. [Just Bash README](https://github.com/vercel-labs/just-bash/blob/main/packages/just-bash/README.md), [threat model](https://github.com/vercel-labs/just-bash/blob/main/THREAT_MODEL.md).

Actual browser verification covered a successful pipeline, a rejected redirect, a subsequent check proving no file was created, and cancellation of a sleeping worker. Tests additionally cover mutation commands, traversal, hidden archives, symlink escape, missing desktop/network commands, result limits, and worker disposal/deadlines.

## Durable conversations and bounded context

Conversation transcripts are saved in `/.oma/conversations/<id>.json`. The workbench can switch, delete, and export conversations. It validates loaded records and preserves unreadable archive files rather than silently replacing them. Saving failures are visible. Secret connection settings are never serialized with transcripts. Mode, endpoint, model ID and tool preference survive reload using a strict local preference allowlist; keys and authentication claims are excluded on both writing and rehydration.

Within a live session, model history retains actual tool calls and matching results. On reload, only user/assistant text is replayed; saved system notices and tool records are never replayed as higher-priority instructions or unmatched tool calls. Older complete turns are omitted from model context when its approximate character budget is exceeded, with a visible notice; they remain in the local transcript. This is bounded replay, not semantic compaction or a background memory service.

The SDK documentation distinguishes display messages from model messages and recommends validating persisted messages. We use a small validated display-record schema because this application owns its client tool loop, while keeping provider-shaped history only in memory. [Message persistence](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-message-persistence), [ModelMessage](https://ai-sdk.dev/docs/reference/ai-sdk-core/model-message).

OPFS survives ordinary page reloads but is local to the site's origin. Clearing site data removes it; browser storage can be subject to eviction. Export important work or use the OS backup controls. An archive is not cloud synchronization. [MDN OPFS](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system), [storage quotas and eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria).

## Streaming lessons and tests

The installed SDK's `result.response.messages` contains only the final step. `result.responseMessages` contains the complete generated turn. Tests caught this distinction and verify that a model can call the real filesystem tool, receive its result, continue answering, and retain that result for follow-up turns.

Cancellation can reject both the stream and auxiliary promises. The harness immediately observes `responseMessages` and `totalUsage`, drains stream error events, then reports a single controlled error. An abort regression starts a stream, emits text, cancels it, and checks that no unhandled promise rejection escapes. An interrupted run honestly states that completed local writes remain saved.

The suite uses `MockLanguageModelV4` so it runs deterministically without credentials or provider spending. It covers streaming success, provider failure, mid-stream cancellation, a complete tool round trip, path traversal, protected archives, edit decline, approval-time conflicts, abort-before-write, exact patch ambiguity, bounded reads, archive validation, and complete-turn context trimming. [AI SDK testing](https://ai-sdk.dev/docs/ai-sdk-core/testing).

## Deliberate boundaries

There is no background run after a tab closes, no claim of resumable server streaming, no autonomous model fleet, and no hidden model spending from workflow suggestions. Local HTML apps run in an opaque-origin sandbox; they do not inherit desktop filesystem authority. Generated apps should offer explicit export/import when they need durable data. Stronger app capabilities, a browser execution tool, and a Codex companion should be designed as explicit interfaces with reviewable permissions.
