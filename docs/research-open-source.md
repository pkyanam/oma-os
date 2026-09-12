# Native open-source applications

Research and implementation: 2026-09-12. User explicitly expanded oma.os beyond the original v1 app list. The goal is to run useful upstream software inside desktop windows, with durable artifacts and no dependency on an external app account.

## Integrated in this build

### Excalidraw — professional visual thinking

The real `@excalidraw/excalidraw` React component runs inside a lazy-loaded tile. It provides freehand drawing, bound arrows, shapes, text, images, grouping, selection, undo/redo, search, touch gestures, and upstream editing behavior. This is not an iframe of excalidraw.com and does not require its collaboration server.

oma.os adds:

- A normal `/home/guest/Documents/Sketch.excalidraw` file, including embedded images, saved through the OPFS document queue with optimistic conflict detection.
- Native `.excalidraw` import/export and SVG/PNG image export.
- Local font assets, dark colors, a compact responsive toolbar, and a starter architecture sketch.
- HTTP links routed into the OS browser; arbitrary embedded web content is disabled.
- Drawings can be backed up, inspected in the editor, and modified by agents through the same filesystem.

Creative workflows: design an agent's tool architecture next to its code, draw a customer journey while taking Markdown notes, annotate screenshots, or create a workshop board and export SVG for documentation. The lightweight built-in Canvas remains useful for its simpler portable shape format; Excalidraw supplies the richer upstream editor.

Primary sources: [component installation and local font assets](https://github.com/excalidraw/excalidraw/blob/master/dev-docs/docs/%40excalidraw/excalidraw/installation.mdx), [React component source](https://github.com/excalidraw/excalidraw/tree/master/packages/excalidraw), [MIT license](https://github.com/excalidraw/excalidraw/blob/master/LICENSE). Current installed package supports React 19. The upstream component and fonts keep their own license notices.

### PGlite — PostgreSQL in a desktop window

The actual `@electric-sql/pglite` PostgreSQL WebAssembly runtime executes in a dedicated browser worker. The SQL Workbench supports multi-statement SQL, selection execution, tables, query history during the session, CSV import from the device or OPFS, and result export as ordinary CSV files.

A successful operation checkpoints the database to `/home/guest/Documents/Workbench.pglite.tar.gz`. Restarting the app restores that checkpoint. SQL scripts are ordinary `.sql` files. The worker holds no credentials and contacts no remote database. A Web Lock prevents two browser tabs from overwriting the same checkpoint. A failed checkpoint remains explicitly unsaved and can be retried. Stop terminates the worker; reconnect restores the last saved checkpoint.

CSV imports use quoted identifiers and parameterized values. All imported columns start as TEXT so leading zeroes and input values are preserved; query authors can explicitly cast numeric/date columns. Import creates a new table and fails on an existing table instead of overwriting it. The UI displays and exports up to 1,000 result rows; add WHERE/LIMIT for exploration. The runtime is intended for local working datasets, not production server workloads.

Creative workflows: explore research data using real SQL, prototype application schemas without provisioning a database, compare CSV exports with joins, teach SQL offline after assets load, and hand a query plus result CSV to the agent for analysis.

Primary sources: [PGlite overview](https://pglite.dev/docs/about), [API and database snapshots](https://pglite.dev/docs/api), [filesystem choices](https://pglite.dev/docs/filesystems), [multi-tab coordination](https://pglite.dev/docs/multi-tab-worker), [Apache-2.0 license](https://github.com/electric-sql/pglite/blob/main/LICENSE). PGlite also offers the PostgreSQL license as an alternative; oma.os retains both notices. PostgreSQL and bundled extensions have their own upstream notices. Checkpoint archives are PGlite version-specific; export portable SQL/CSV when migrating PostgreSQL versions.

## Evaluated next integrations

| Project | Why it fits | Integration decision |
| --- | --- | --- |
| [Mermaid](https://github.com/mermaid-js/mermaid) | Text-based architecture, flowcharts, sequence diagrams; useful agent-generated artifacts. MIT. | Good next Notes/editor preview. Use strict security mode and a sandbox; do not render untrusted diagram HTML directly into the desktop. |
| [Markmap](https://github.com/markmap/markmap) | Turn a Markdown outline into an interactive mind map. MIT. | Strong next native view over existing Markdown files. Keep links in OS Browser and preserve the Markdown source. |
| [JupyterLite](https://github.com/jupyterlite/jupyterlite) | Existing notebook ecosystem in the browser, BSD-3-Clause. | A larger notebook import/export integration after the existing Pyodide lab; needs careful storage bridge and extension packaging. |
| [Sandpack](https://github.com/codesandbox/sandpack) | React/web application previews and browser-based code evaluation, Apache-2.0. | Useful for an app-authoring studio, but audit bundler network dependencies and isolated preview origin before shipping. |

These are researched candidates, not installed or advertised as working applications. Source licenses should be checked again at the exact version incorporated. Native integrations should be lazy-loaded, expose readable artifact formats, preserve upstream notices, and avoid embedding a remote demo as though it were an installed application.

## Validation

`lib/integrations/database.test.ts` executes real PGlite SQL, imports injection-shaped CSV values using parameters, and restores a compressed checkpoint into a second database. Drawing tests verify native scene validation. Browser integration tests exercise the actual Excalidraw UI and SQL worker; see the test run results for the current build rather than treating this document as a claim that every browser/device has passed.
