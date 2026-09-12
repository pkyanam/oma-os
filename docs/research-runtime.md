# Browser compute and data workbench

Research and implementation: 12 September 2026. These apps implement the user's expanded scope beyond the initial v1 spec. They preserve Tokyo Night and use the existing OPFS and desktop state APIs.

## Choices

**Python Lab uses Pyodide 314.0.6 in a dedicated module worker.** This is a real CPython/WebAssembly runtime, not a command simulation. Pyodide's current [worker guide](https://pyodide.org/en/stable/usage/webworker.html) explicitly requires module workers. A lazily created same-origin worker imports the pinned runtime from jsDelivr; ordinary desktop startup downloads no Python. Python runs off the UI thread. The [JavaScript API](https://pyodide.org/en/stable/usage/api/js-api.html) provides import-driven package loading and stdout redirection. Python variables and `/work` persist in that worker until it is stopped or its tile closes.

Stop terminates the worker and a two-minute wall-clock watchdog does the same for abandoned runs. This discards Python memory but keeps the source editor intact. Pyodide's [Python interrupt mechanism](https://pyodide.org/en/stable/usage/keyboard-interrupts.html) requires SharedArrayBuffer and cross-origin isolation. Terminating the worker avoids imposing those headers on the browser app. It is a hard reset, not resumable suspension. It is not a memory quota or security boundary.

The UI ships runnable examples for traffic analysis, SQL through Python's SQLite library, golden-angle generative SVG, and an imported CSV report. Output is capped at 100 KB. Flat text files under `/work` up to 1 MB can be explicitly exported into oma.os Documents. Imports are explicit copies from OPFS and persist in Python memory, not an automatic OPFS mount. Binary files and nested output directories are not exported by this initial bridge. Export refuses to overwrite an existing desktop file.

**Data is an original local CSV workbench.** CSV requires no downloaded runtime. It implements the useful subset of [RFC 4180](https://www.rfc-editor.org/rfc/rfc4180): quoted commas, escaped double quotes, multiline fields, CRLF and LF records, plus tolerant ragged rows. It provides editable cells and headers, numeric-aware sorting, all-column filtering, undo, row/column additions, row deletion, summaries, and bar charts. A 100-row page avoids mounting thousands of inputs. Limits are 2 MB input, 10,000 rows, and 100 columns. Export follows the current filter/sort order; Save preserves the underlying full table. Cells are plain strings and no formula or JavaScript evaluation occurs. External spreadsheet programs can interpret formula-like exported strings; the download status makes that distinction explicit.

We chose this CSV scope over adding an additional SQLite WASM dependency because Python already supplies a genuine SQL path and the data editor must remain fast and useful offline. A future direct SQL app can use [SQLite's maintained WASM distribution](https://sqlite.org/wasm/doc/trunk/index.md) with an OPFS worker, after measuring browser isolation constraints.

## Integration

Register app IDs `lab` and `data`, lazy-load `components/apps/Lab.tsx` / `Data.tsx` in Tile, and pass `{ id, path?, active? }`. They import their own `Runtime.module.css`. `.py` file launches may target Lab and `.csv` Data. Existing dirty-state protection is used for edits; Save calls `refreshFs()`.

No package changes are required. Serve `public/runtime/python-worker.mjs` unchanged from the application origin. The CDN uses a pinned version rather than `latest`. Source files and CSV tables are OPFS data, and UI does not upload them to a server. Python can intentionally invoke browser networking using its JavaScript bridge, so run trusted code only. A Worker prevents UI blocking; it does not make arbitrary code safe or isolate it from same-origin browser capabilities. Do not expose unattended agent execution as a security sandbox.

## Offline and hosting

The Data app works after the application is loaded with no external requests. Python's initial runtime and newly imported packages require network access to `cdn.jsdelivr.net`. Browser HTTP caching may help subsequent starts, but offline Python boot is not guaranteed and is not advertised. A self-hosted deployment can mirror the pinned Pyodide full distribution and change `INDEX` in the worker. No auth sidecar or server compute is used by these apps.

## Verification

`lib/runtime/csv.test.ts` tests multiline/escaped-field round trips, BOM/ragged rows, malformed input, dimensional limits, and numerical summaries. CDN response for the pinned module was HTTP 200 with `Access-Control-Allow-Origin: *`. Root-agent browser QA verified actual first-run Python/WASM execution: the traffic example printed total 968 and mean 193.6, completed in 0.04 seconds after initialization, and produced a 53-byte report.csv. Remaining checks include traceback, Stop on a busy loop, generated-file export, CSV save/reopen, filtering/charting, and narrow touch-sized layout. Runtime document tests additionally cover save-as confirmation, concurrent-write rejection, safe creation, and path constraints. Clean saved documents reload on desktop filesystem changes; dirty buffers are preserved and saves use optimistic concurrency checks.


## Save/export regression fix

The filesystem now treats an `expected` baseline on a missing file as a deletion conflict. Runtime document creation therefore uses `writeBlob(..., { overwrite: false })` rather than pretending a missing file has an empty expected baseline. Existing-file saves still use optimistic content checks. Untouched starter source is not marked dirty; edited source remains protected, and Close delegates to the desktop's explicit keep/discard confirmation. Export has visible pending state, typed worker errors, a deadline, and Stop cleanup. Busy, uninitialized, invalid, or missing worker files all produce responses instead of being silently ignored.

The isolated Chromium integration suite `e2e/runtime.spec.ts` passed both tests: real Pyodide initialization/execution, absent source creation, CSV export and reopening in Data, safe repeated-export collision, infinite-loop Stop, keep-open preserving source, discard-close, and closing an untouched starter. These tests run in fresh test contexts, without using the user's browser storage.
