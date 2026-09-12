# Files and media: implementation research

Reviewed September 12, 2026. The expanded user request authorizes importing files, media apps and richer file operations beyond the original v1 specification.

## Platform choices

- **OPFS is the actual disk.** It is private to this origin, subject to browser storage quota and deletion when site data is cleared. It is not a view of the user's host filesystem. Files are read with `getFile()` and written through `createWritable()`. Primary references: [MDN OPFS](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system), [WebKit implementation](https://webkit.org/blog/12257/the-file-system-access-api-with-origin-private-file-system/).
- **Import uses standard file input and drag/drop.** This works without requiring the Chromium-only host directory picker. File bytes are copied into OPFS; existing names receive numbered suffixes. [MDN file handling](https://developer.mozilla.org/en-US/docs/Web/API/File_API/Using_files_from_web_applications).
- **Media uses object URLs and native controls.** This avoids base64 expansion and network uploads. URLs are revoked on replacement and unmount. Actual codec support remains the host browser's responsibility. Images support fit, zoom and rotation; audio/video support seeking and native device media controls. [W3C File API](https://www.w3.org/TR/FileAPI/), [MDN revokeObjectURL](https://developer.mozilla.org/en-US/docs/Web/API/URL/revokeObjectURL_static).
- **ZIP is explicit interchange.** fflate creates archives asynchronously and extracts them through a bounded streaming decoder. Extraction checks actual emitted bytes, CRC checksums, and matching local/central headers rather than trusting advertised sizes. Extraction rejects absolute paths, traversal, backslashes, control characters and archives above 128 MB expanded / 5,000 entries. Archives extract into a newly named directory. Encrypted, split, and ZIP64 archives are rejected. [fflate API and implementation](https://github.com/101arrowz/fflate).

## User workflows shipped

1. Drop a photograph, audio clip, video, PDF, HTML file or source file into Files; open it inside the desktop.
2. Select multiple files using Cmd/Ctrl-click or Shift-click; copy/cut them, navigate to another directory, and paste. Touch users can operate each item with the visible Open and action buttons.
3. Rename or move items using an inline form. Open editor files must be closed first so a mounted autosaving buffer cannot recreate a deleted path.
4. Download one file unchanged or export multiple files/directories as ZIP. Extract a ZIP into a new directory without replacing existing files.
5. Review delete confirmation before recursively deleting a directory. System roots remain protected.

## Limits and seams

This is a browser file manager, not a mounted host filesystem. Optimistic saves refuse to recreate a file deleted after it was read. Per-file locks serialize saves, imports, touch and deletion; failed new-file writes remove their empty placeholder. Copy-then-delete moves preserve the source until copying succeeds but are not atomic across a whole directory. Imports are capped at 512 MB per file; ZIP export is capped at 128 MB uncompressed to bound memory. Browser codec support determines which media plays. SVG files are displayed as images rather than inserted into the application DOM. Local HTML runs through the Browser sandbox. PDF rendering uses the browser's built-in viewer, where supported. No third-party media or documents are uploaded to a service.
