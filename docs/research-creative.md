# Creative applications: research and implementation

Reviewed September 12, 2026. The user explicitly expanded the original v1 scope to working creative applications. All implementation here is original; no code was copied from Obsidian or Excalidraw.

## Product choices

**Notebook** is a quiet working notebook with searchable pages, pins, an archive, a daily page, and project brief templates. The daily note and template workflows are informed by [Obsidian Daily notes](https://obsidian.md/help/plugins/daily-notes) and [Templates](https://obsidian.md/help/plugins/templates). They reduce the empty-page problem without imposing a project database. Notes remain plain Markdown inside a versioned JSON notebook and export individually as `.md`. Markdown import adds a new note and does not replace the current notebook. Preview uses [react-markdown](https://github.com/remarkjs/react-markdown) with [remark-gfm](https://github.com/remarkjs/remark-gfm) for headings, code fences, tables, lists, quotations, interactive task checkboxes, and HTTP(S) links which open in the OS Browser. The shared renderer skips raw HTML and does not automatically load remote images; image buttons open the relevant OS app. Fenced code has a Copy button, and OPFS paths open through the native file association registry.

**Canvas** is a dependency-free SVG thinking board: rectangles, ellipses, arrows, freehand strokes, text, movement, numeric object sizing, duplication and layer order, color, undo/redo, pan, and zoom. [Excalidraw's export utilities](https://github.com/excalidraw/excalidraw/blob/master/dev-docs/docs/%40excalidraw/excalidraw/api/utils/utils-intro.md) are a useful reference for keeping editable scenes separate from image exports. We use an original scene schema with JSON import/export plus SVG and PNG output. Import validates data and appends shapes with fresh IDs, preserving the existing scene. No third-party app surface or library CSS is embedded in the desktop.

## Browser platform decisions

- [OPFS](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system) provides browser-local storage. Files are visible to the OS Files app and agent filesystem tools but do not automatically appear in the host's Downloads directory. Export is explicit. The [WebKit OPFS implementation overview](https://webkit.org/blog/12257/the-file-system-access-api-with-origin-private-file-system/) supports the cross-browser choice.
- [Pointer capture](https://developer.mozilla.org/en-US/docs/Web/API/Element/setPointerCapture) keeps drawing gestures attached when a pen, mouse, or finger moves outside the SVG. `touch-action: none` applies only to the drawing surface; the rest of the desktop can scroll normally.
- [SVGGraphicsElement](https://developer.mozilla.org/en-US/docs/Web/API/SVGGraphicsElement) coordinate transforms map pointer positions through `getScreenCTM().inverse()`. This avoids assumptions about tile dimensions, aspect-ratio letterboxing, or zoom.
- Both apps use container queries, so layout depends on their tile width, not only the browser viewport. Coarse pointers receive larger controls and inputs. Canvas offers a visible Pan tool so touch users never need a mouse modifier.

## Persistence and integration

`useDocument<T>(id, path, create, parse)` in `lib/apps/creative/useDocument.ts` is shared by local structured-document apps. It serializes writes, debounces them, marks the tile dirty, checks the prior file content before writing, flushes when hidden, warns before unload, and reloads externally modified files only when the local buffer is clean. A conflict preserves the local buffer and exposes explicit disk reload. It does not claim cloud synchronization or crash-proof persistence.

- Notes default: `/home/guest/Documents/Notebook.oma-notes.json`
- Canvas default: `/home/guest/Documents/Canvas.oma-canvas.json`
- Components accept `{ id, active, path? }`.
- Registry IDs: `notes`, `canvas`.
- Native filesystem routes: `.oma-notes.json` → Notes; `.oma-canvas.json` → Canvas.
- The initial canvas artboard is 1200 × 800. Export bounds expand to include shapes placed beyond it. JSON retains editable geometry, SVG preserves vectors, and PNG scales the longer edge to 2400 pixels.
- Canvas shortcuts when focused: V select, H pan, R rectangle, O ellipse, A arrow, P pen, T text; Delete removes selection; arrows move; Shift+arrows moves ten units; Cmd/Ctrl+Z undo; Shift+Cmd/Ctrl+Z redo; Cmd/Ctrl+S saves.

## Useful workflows

1. Research in Browser, collect links and conclusions in a daily note, and outline the result on Canvas.
2. Ask the agent to turn a project brief into an editable canvas JSON file. Open it through Files and adjust the diagram with touch or mouse.
3. Sketch an interface or architecture, export SVG, and incorporate it into a local HTML project.
4. Import meeting Markdown, check tasks off in Preview, and archive the page after delivery.

## Validation

`lib/apps/creative.test.ts` covers valid document round trips, malformed imports, duplicate IDs, bounded coordinates/strokes/content, SVG text escaping, negative rectangle geometry, and export filenames. TypeScript compilation validates the components with the main desktop. Browser interaction validation is performed by the parent integration task.

## Applications hub

The built-in Apps client is an entry point to real tools, not a remote marketplace. It groups the desktop's applications into Think, Create, Build, and System. Search includes use-case terms such as journal, CSV, and PDF. Working-session shortcuts open actual app pairs for research, data analysis, and project mapping.

Bundled HTML apps install from same-origin `/templates` assets into `/home/guest/Applications/<slug>/index.html`. Installation never overwrites a nonempty existing source file. The hub discovers at most 100 immediate application directories, with optional `.oma-app.json` metadata:

```json
{
  "version": 1,
  "title": "My application",
  "description": "What it does",
  "hidden": false
}
```

Metadata is optional, bounded, and treated as text. HTML executes only when the user opens it in Browser's local application sandbox. Removing a registration sets `hidden: true`; it preserves source files. Re-adding a bundled template restores the listing and retains edited HTML. Custom apps can restore their listing by setting `hidden: false` or removing the optional metadata file.

`lib/apps/catalog.test.ts` validates slug boundaries and metadata, plus installation, source preservation, hiding, and restoration against a filesystem test double. The runtime-app worker documents the three self-contained templates in `docs/research-templates.md`.
