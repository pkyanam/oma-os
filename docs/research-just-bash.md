# Just Bash in oma.os

Research and implementation: September 12, 2026. Installed version: `just-bash@3.4.2` (Apache-2.0).

## Why it fits

The [official repository](https://github.com/vercel-labs/just-bash) implements a Bash parser/interpreter in TypeScript with a virtual filesystem and useful built-in commands. The [package README](https://github.com/vercel-labs/just-bash/blob/main/packages/just-bash/README.md) explicitly supports browser execution for its shell core. Its [filesystem interface](https://github.com/vercel-labs/just-bash/blob/main/packages/just-bash/src/fs/interface.ts) requires asynchronous operations, which match OPFS's browser API. No VM service or command-execution backend is required.

This replaces oma.os's small command switch with actual pipelines, redirections, globbing, conditionals, loops, scripts, grep, sed, awk, find, jq, sort, and other built-ins. A pipeline reads the same OPFS files that the editor, Files app, and agent see; no filesystem snapshot or synchronization layer is involved.

## Architecture

- Each terminal creates a dedicated Web Worker on its first command. The npm package's browser export condition selects the browser bundle. It stays out of initial desktop loading.
- `OpfsShellFs` adapts file bytes and directory operations directly to the existing desktop filesystem. `/tmp` is a worker-local in-memory mount.
- `createShellEngine` owns the interpreter. Interactive calls explicitly carry environment variables and working directory into the next execution, because the upstream API resets shell state per call. Functions and aliases belong to the submitted script; they do not survive across commands.
- `oma`, `edit`, `open`, `run`, and desktop aliases call the existing command bus over a worker/main-thread message bridge. Shell expansions and piped UTF-8 input reach the bus as parsed arguments and text.
- `executeShell(script, ctx, signal)` is a one-shot integration surface. It creates and disposes its own worker. Agent callers must request approval before allowing this mutating tool; filesystem side effects are not automatically covered by individual write-tool approvals.

## Execution boundaries

Network options are absent, and `curl`/`wget` return an explicit disabled message. No provider key or server environment is sent to the worker. Native binaries, Node.js, Python, SQLite, and JavaScript execution are not enabled by this integration. An interpreted Bash environment is not a Linux kernel or a container.

The interpreter uses the hardened execution profile with explicit limits: 15 seconds, 10,000 commands/loop iterations, 128 KiB shell source, 1 MiB output, bounded traversal and intermediate memory. Each OPFS file read/write is capped at 16 MiB. The host also terminates a worker after 20 seconds, including startup. Ctrl+C terminates it immediately and resets its shell state. Completed writes remain; cancellation is not a transaction rollback.

The adapter rejects removal/movement of protected desktop roots before recursion. It reports unsupported POSIX links rather than simulating them. Permissions and explicit modification times are session-local metadata; OPFS does not implement POSIX ownership or executable permissions. Copy/move operations are not transactional. Existing OPFS locking handles writes, while simultaneous append from independent terminals is not an atomic POSIX append guarantee.

This is a useful agent workspace boundary, not a claim of a security-reviewed VM. The [upstream security model](https://github.com/vercel-labs/just-bash/blob/main/packages/just-bash/README.md#security-model) distinguishes in-process interpretation from arbitrary binary execution in a full VM.

## Working examples

```bash
printf 'Beta\nAlpha\n' | sort
find /home/guest -name '*.md' | head
grep -rn TODO /home/guest/Projects | sort
printf '{"items":[{"name":"oma"}]}' | jq -r '.items[].name'
printf 'hello from Bash\n' > /home/guest/Documents/hello.txt
edit /home/guest/Documents/hello.txt
oma launch notes
```

Seventeen integration tests cover real pipelines, redirection, environment/cwd persistence, Unicode desktop-command input, network/native denial, runaway loops, OPFS binary content, protected roots, filesystem lifecycle/errors, combined help, terminal close semantics and local-file/URL routing. Browser QA additionally checks the worker bundle, terminal interaction, persistence in the real OPFS backend, and Ctrl+C.

### Browser compression

Just Bash 3.4.2's browser declaration explicitly documents that upstream `gzip`,
`gunzip`, and `zcat` depend on Node zlib and fail in browsers. A real Vite browser
pipeline confirmed that failure. oma.os supplies these three terminal commands
using the existing `fflate` browser library instead. They accept stdin or one file,
`-c` / `--stdout`, and `-d` / `--decompress`; file input requires stdout mode
(`zcat` implies it). Save output with ordinary shell redirection. Source files are
never deleted. Unsupported flags are rejected, rather than approximated.

Inputs and decompressed output are capped at 16 MiB. Inflate processes compressed
input in 1 KiB chunks and checks every emitted output chunk before retaining it;
the shell worker's wall-clock deadline still applies. These are compression tools,
not GNU gzip replacements. Examples:

```sh
printf 'hello\n' | gzip | gunzip
gzip -c Documents/note.md > Documents/note.md.gz
zcat Documents/note.md.gz | head
```

Regression coverage includes all 256 byte values through file and pipe round trips,
malformed data, oversized input, an inflate bomb exceeding the output cap, and real
headless browser execution against the Cloudflare Vite build.
