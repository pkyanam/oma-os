# Editable app templates

12 September 2026. These original applications are complete single HTML files with inline CSS and JavaScript. They use Tokyo Night colors, responsive layouts, touch targets, native controls, and no third-party assets or packages. Apps Hub copies them into OPFS on explicit installation; edits to installed copies should never be overwritten by catalog refreshes.

## Pulse

`public/templates/pulse.html` is an eight-track, sixteen-step sequencer: five melodic tracks and kick, snare, and hi-hat. It synthesizes oscillators and filtered noise with [Web Audio](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API). The audio clock schedules notes ahead of time, following the pattern described in MDN's [sequencing guide](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Advanced_techniques). A short JavaScript timer fills a 120 ms audio scheduling window; it does not use timer arrival time as the note clock.

Press Play to explicitly create/resume AudioContext; there is no autoplay or microphone request. Tempo, swing, oscillator voice, volume, scale, and cells can change during playback. Stop closes the context and clears scheduled UI callbacks. Visibility/pagehide stops playback. The starter groove and melody mutation are editable starting points. JSON export/import includes schema validation, track dimensions, numeric bounds, and scale/voice validation. Export presents text and a copy/select fallback because an opaque sandbox cannot promise downloads or clipboard permission.

## Image Studio

`public/templates/image-studio.html` accepts actual local PNG, JPEG, WebP, GIF, and BMP files through a file picker or drop. [createImageBitmap](https://developer.mozilla.org/en-US/docs/Web/API/Window/createImageBitmap) decodes the input. Canvas performs crop, rotation, flip, resampling, and pixel-based brightness/contrast/saturation. Pixel transforms avoid reliance on browser-specific canvas filter support. Crop coordinates refer to the source image before rotation; resize aspect ratio can be locked. A generated color study makes the tools immediately testable without a host file.

A sampled quantized palette exposes up to eight dominant colors. Output encoding uses [canvas.toBlob](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob), with PNG alpha or a white JPEG background and user-selected quality. The export dialog shows the actual encoded image plus dimensions, MIME type, and size. An ordinary download link is included, but the existing sandbox may block it; right-click/long-press Save Image provides a native fallback without changing parent permissions. Maximum input is 32 MB/40 million pixels, output 8 million pixels/4096 pixels per side; initial preview is scaled to at most 2048 pixels per side. Files are not uploaded.

## Regex Lab

`public/templates/regex-lab.html` creates a disposable Blob worker for each debounced evaluation. JavaScript's native RegExp performs the actual matching. A 750 ms deadline uses [Worker.terminate](https://developer.mozilla.org/en-US/docs/Web/API/Worker/terminate) to end catastrophic backtracking without blocking the UI. If the browser denies worker creation inside this sandbox, the app reports that limitation rather than running the regex on the main thread.

Match highlighting uses text nodes, never injected HTML. The inspector shows positions, captures, and named groups, while replacement supports JavaScript dollar tokens. Replacement builds bounded output incrementally to prevent pathological expansion. Zero-width Unicode matches advance by code point. Limits: 200 KB source, 10 KB pattern/replacement, 1,000 matches, 500 KB output. The inspector displays the first 100 rows; all accepted matches still participate in highlighting/replacement. Examples include emails, structured logs, dates, duplicate words, and zero-width boundaries. Session JSON can be copied/exported and pasted/imported.

## Sandbox contract

No parent capabilities, origin access, filesystem bridge, or remote requests are added. Apps run under the existing `allow-scripts allow-forms` sandbox. Editable document source persists in OPFS; in-memory pattern/image/regex state does not automatically persist across closing the Browser window. Users should export pattern/session text or image outputs before closing. Clipboard is best effort with an explicit manual copy fallback. Browser downloads may be blocked by the sandbox; the UI does not claim otherwise.

## Tests and acceptance

`lib/runtime/templates.test.ts` extracts and syntax-checks each actual inline script. Tests exercise Pulse pattern validation and swing timing; Image Studio's alpha-preserving transforms, luminance conversion, palette extraction, and size bounds; and Regex Lab replacement parity with JavaScript, Unicode zero-width behavior, invalid regexes, and match limits. A real Node worker executes the same regex core with a catastrophic-backtracking input and is successfully terminated; this proves the bounded worker design without claiming browser automation.

Root browser acceptance: open each installed template. Pulse: toggle cells, Play/Stop, change tempo, export/import JSON. Image Studio: generated image, rotate, crop, tone, actual encoded export; also open a host file. Regex Lab: default matches, dates replacement, invalid pattern, catastrophic regex cancellation. Verify the source remains editable in Editor and layouts scroll within the app at narrow widths. Child-agent browser runtime discovery was unavailable, so interactive validation belongs to the root agent's active browser session.
