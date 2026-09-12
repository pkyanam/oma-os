# Agent compute: isolation proposal

Research date: 2026-09-12. **Architecture proposal only; these compute tools are not implemented.** The current agent can run the enforced read-only Just Bash tool. Python Lab and Database are user-operated applications, not arbitrary agent execution endpoints.

## Recommendation

Deliver disposable SQL analysis over explicitly selected CSV files first. Prototype Python separately in an opaque-origin frame and worker with a closed, offline runtime asset graph. Do not connect the existing Python worker or persistent Database worker to model-authored code.

The useful initial workflows are concrete: aggregate an exported transaction CSV, compare two inventories, generate a grouped report, or calculate statistics and save an approved Markdown/CSV artifact. Computation must return actual runtime results and its input provenance; a generated Python script is not an executed analysis.

## Current implementation boundary

`public/runtime/python-worker.mjs` runs Pyodide in a same-origin module worker and permits runtime package loading. Python's JavaScript bridge can reach worker APIs. Moving execution off the UI thread prevents ordinary blocking but does not remove origin privileges. Changing `jsglobals` is an API configuration choice, not a security proof. The current Pyodide documentation explicitly defaults this object to `globalThis`. Its current module loader also loads `pyodide.asm.mjs`, WASM, standard library and package metadata. [Pyodide API](https://pyodide.org/en/stable/usage/api/js-api.html), [worker deployment](https://pyodide.org/en/stable/usage/webworker.html).

`public/workers/database.js` is likewise a trusted application worker. It executes user SQL and returns database checkpoints to its parent for persistence. An agent must never receive that checkpoint capability implicitly. Its imported data, SQL and outputs must be independent of the user's active database session.

## Threat model

Assume model-authored Python can obtain arbitrary JavaScript execution in its worker. Assume SQL and input files are hostile, outputs can be fabricated, and any available message channel will be probed. Trust the browser isolation implementation, pinned runtime assets and small host/child bootstrap. Browser vulnerabilities, speculative execution attacks and a hard physical memory quota are outside this proposal's guarantee.

| Asset or capability | Required boundary |
| --- | --- |
| ChatGPT session cookies, BYOK and same-origin endpoints | No parent-origin interpreter; no credentials or authenticated fetch capability transferred |
| OPFS files, conversation archives and database snapshots | Copy only explicitly selected input bytes; no directory/file handles, mounts or generic filesystem RPC |
| Internet access | No external origins in execution CSP; parent loads a fixed manifest before input enters the realm |
| Desktop control and writes | No desktop bus bridge; outputs require the existing reviewed file-write path |
| UI responsiveness | Dedicated worker, host deadline, immediate termination and bounded message processing |
| Output authenticity | Label as code output; show source, selected inputs, truncation and errors; never execute returned HTML |

## Python architecture to prototype

1. The trusted host fetches a fixed versioned manifest of runtime assets, with expected hashes, byte limits, omitted credentials and rejected unexpected redirects. Neither code nor input files choose asset URLs. Cache these public assets independently of private input. Do not start model code during loading.
2. Create a fixed bootstrap iframe using `sandbox="allow-scripts"`, with **no** `allow-same-origin`. Prefer a small response with a CSP header; a `srcdoc` implementation needs its CSP meta element before any executable content. CSP's `sandbox` directive itself cannot be supplied through a meta element. Without the same-origin permission, the frame receives an opaque origin. [iframe sandbox](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe), [CSP sandbox](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/sandbox).
3. Bootstrap creates asset Blob URLs and the module worker **inside that opaque frame**. Do not create the worker Blob in the privileged parent and assume the frame makes it opaque: Blob worker origin follows its creator. Blob workers inherit the creator's CSP; ordinary network workers need their own response policy. [Worker constructor](https://developer.mozilla.org/en-US/docs/Web/API/Worker/Worker), [CSP and workers](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy).
4. Transfer one MessageChannel to the exact frame WindowProxy. Opaque targets require a wildcard target origin, so validate the expected source, a one-use session nonce and a strict handshake schema; then remove the ambient message listener. A channel conveys only `run`, `cancel`, bounded `output` and `done/error`. Do not grant file, fetch, package-install, navigation or desktop methods. [postMessage security](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage), [MessageChannel](https://developer.mozilla.org/en-US/docs/Web/API/MessageChannel).
5. Copy selected file bytes into a fresh virtual `/work`. Normalize names; reject traversal, duplicate names and unsupported sizes. Never pass OPFS handles, native filesystem mounts, environment secrets or functions bound to parent state. Begin with standard-library Python and a fixed reviewed package set; automatic imports must not fetch new packages.
6. Execute only inside the worker. The iframe stays trusted and never evaluates code, inserts returned HTML or follows returned URLs. After completion or cancellation, terminate the worker, close ports, revoke Blob URLs and remove the iframe. Every request gets a fresh realm.

### Network policy is the difficult part

A candidate policy for experimentation is:

```text
default-src 'none';
script-src 'nonce-<per-frame-bootstrap-nonce>' blob: 'wasm-unsafe-eval';
worker-src blob:;
connect-src blob:;
img-src 'none'; style-src 'none'; media-src 'none';
frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'
```

This is **not a validated deployment policy**. Verify whether the runtime needs additional evaluation permissions, and whether Blob module imports/fetches work across Safari, Firefox and Chromium. If an engine requires broader policy, investigate a different bootstrap or fail closed; do not silently enable external origins or `allow-same-origin`.

Allowlisting a pinned CDN path is insufficient for no-egress execution. CSP source matching compares scheme, host, port and path, not a secret-bearing query string. A permitted asset request can therefore carry input data in its query. This is an inference from the normative matching algorithm, not a demonstrated vulnerability in this app. Parent-prefetched bytes remove this deliberate external destination. [CSP URL matching algorithm](https://www.w3.org/TR/CSP3/#match-url-to-source-expression).

`connect-src` governs APIs including fetch and WebSocket; it is not proof that every browser communication mechanism is unavailable. Explicitly test worker-accessible transports. Keeping arbitrary code out of the iframe removes DOM-based navigation and image channels from the interpreter. Nested workers and memory allocation remain denial-of-service concerns; inherited `worker-src blob:` may permit worker proliferation. A host timeout is mitigation, not a hard resource boundary. [connect-src](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/connect-src), [worker-src](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/worker-src).

### Loader feasibility gate

The inspected v314.0.6 loader constructs WASM URLs from `indexURL`. It supports `lockFileContents`, `stdLibURL` and an experimental `createPyodideModule` hook, but those options alone do not establish an offline closed graph. A prototype must map every module/WASM/stdlib dependency to transferred bytes without global fetch monkeypatching as the security boundary. Loader adaptation must be pinned and regression-tested. The runtime application owner confirmed no buffer-loader experiment has yet established this. [Pinned loader source](https://cdn.jsdelivr.net/pyodide/v314.0.6/full/pyodide.mjs).

## SQL: smaller initial capability

Use a fresh in-memory PGlite worker per analysis. Import only selected CSVs through trusted identifier quoting and parameterized inserts. Do not load an arbitrary database dump initially: it may contain functions or extension state that broaden the execution surface. Never mount OPFS/IndexedDB or emit a database checkpoint. PGlite supports ephemeral memory storage; persistence requires a separate filesystem or an explicit dump/load path. [PGlite filesystems](https://pglite.dev/docs/filesystems).

The first tool can accept a structured aggregation plan: selected columns, equality/range filters, group keys, count/sum/average/min/max, ordering and a bounded row limit. Generate SQL from an identifier allowlist and bind values. This produces real database results without needing to classify arbitrary SQL as harmless.

A later raw SQL tool should use single-statement `.query(sql, parameters)` rather than multi-statement `.exec`, a fresh disposable database, a restricted database role, no extension/plugin bridge and no persistence channel. PGlite also accepts precompiled runtime modules and a filesystem bundle, potentially making offline isolated loading simpler than Python. Validate these options in the installed version before relying on them. [PGlite API](https://pglite.dev/docs/api).

Read-only transactions are defense in depth, not the isolation boundary: PostgreSQL permits some temporary-table writes and exposes privileged file/program functions through roles. Do not promise safety based on a `SELECT` prefix or keyword blacklist. The important first boundary is a clean disposable dataset plus fixed query construction. [Read-only transaction semantics](https://www.postgresql.org/docs/current/sql-set-transaction.html), [privileged predefined roles](https://www.postgresql.org/docs/current/predefined-roles.html).

## Proposed limits and review gates

These are starting product limits, not measured runtime guarantees: four selected files, 2 MiB total input, 32 KiB source, 64 KiB textual output, 1 MiB exported artifacts, one concurrent worker, a 15-second execution deadline and a separately visible startup deadline. SQL should enforce row limits before results materialize; truncating a huge result afterwards does not limit allocation. Hash selected inputs and attach hashes to run results so later file changes do not obscure provenance.

Before exposing either tool to a model, automate:

- Successful computation against known fixture files, Unicode names and empty inputs; compare exact expected results.
- Cookie, storage, IndexedDB, OPFS and same-origin credential endpoint attempts fail; parent files and snapshots stay byte-identical.
- Fetch, WebSocket, imports, package downloads, allowed-asset query strings and supported worker transports cannot send fixture secrets to a test receiver.
- Spoofed messages from sibling frames, unknown request IDs, repeated handshakes, invalid schemas and unsolicited save/navigation messages are ignored.
- Infinite loops cancel promptly; output floods, oversize transfers, nested workers and allocation pressure produce a bounded failure where possible.
- SQL aggregation rejects unknown identifiers and treats injection strings as data; proposed raw SQL tests separately cover multi-statements, file functions, extension installation and transaction changes.
- Chromium, Firefox and WebKit run the real bootstrap under deployment headers, including an opaque-origin assertion. Unsupported cases fail visibly without weakening isolation.
- Returned HTML, SVG and Markdown never execute automatically. Saving an artifact uses explicit review and optimistic conflict checks.

Approve the smaller SQL capability independently. Treat Python as a browser isolation project that requires the prototype and adversarial tests above, not a quick reuse of the existing Lab worker.
