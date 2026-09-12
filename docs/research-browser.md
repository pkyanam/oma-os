# Browsing inside oma.os

Research and implementation notes, September 12, 2026. This implementation is original; no ryOS source is incorporated.

## What a web desktop can actually do

An iframe is a real browser rendering context. It executes permitted JavaScript, lays out pages, handles forms and plays media. It is not a separate browser process with unrestricted access to every site. Website `Content-Security-Policy: frame-ancestors` and `X-Frame-Options` can forbid embedding. A parent page cannot switch those controls off. An iframe `load` event is not proof a website rendered: browsers intentionally make failure detection ambiguous.

Sources: [MDN iframe](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe), [MDN frame-ancestors](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-ancestors), [MDN X-Frame-Options](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/X-Frame-Options).

ryOS combines live embedded content with a server-side HTML processing path and additional browser services. Its public code is useful architectural evidence that a polished browser desktop still needs multiple rendering strategies, not evidence that iframe restrictions disappear. Inspected its Internet Explorer component/iframe processing architecture. [ryOS repository](https://github.com/ryokun6/ryos). Its AGPL implementation was not copied.

## Implemented strategies

- **Local app**: HTML and explicitly referenced static assets are read from OPFS and mounted in an opaque-origin sandbox. Classic JavaScript, CSS and images can live beside the HTML in the same app directory. The loader rejects traversal outside that directory, unsupported asset types, more than 100 assets or more than 25 MB. CSS imports and local ES modules must be bundled first. It can run JavaScript and forms and export downloads through normal browser download links (including generated Blob files). Only explicitly launched local HTML apps receive `allow-downloads`; remote documents do not. The sandbox still has no same-origin access and receives no arbitrary desktop filesystem or agent access. Desktop keyboard shortcuts use a small source-validated message bridge. App state remains mounted when switching browser tabs.
- **Document**: the bundled Node gateway fetches a public HTML page, resolves links/assets against the final redirect URL and sanitizes executable content. A generated nonce allows only our navigation/keyboard bridge. Links and GET searches navigate within oma.os, including Ctrl/Cmd-click and `target=_blank`, which create an internal browser tab. Password fields are disabled; POST forms explain the limitation. Page CSS/images can load from their source and therefore still make browser network requests.
- **Live**: a remote iframe runs the actual site when that site allows embedding. This preserves website JavaScript, while site CSP, cookie policy, browser features and mixed-content restrictions still apply. No `allow-popups` or top-navigation capability is granted. This mode is explicitly labeled; there is no external-tab fallback and no false “loaded successfully” detection.

Document mode is useful for research, documentation, articles, reference sites and classic web pages. It is not a login proxy and should never be presented as one. Google and similar script-heavy sites can present bot checks to server fetches; Google’s `igu=1` embed URL is a compatibility attempt rather than a supported Google browser API or universal guarantee.

## Useful desktop workflows added

1. Keep a research page in one browser tab, an HTML prototype running in another, and an editor alongside the browser. Local app execution survives tab changes. Tab addresses and the selected tab restore after reload; inactive restored tabs load only when selected.
2. Bookmark references and reopen recent pages. The browser library persists locally, caps history to 200 distinct URLs, tolerates corrupt storage, and supports clearing history.
3. Save a readable document into `/home/guest/Downloads` as HTML. The saved copy appears in Files and on the browser start page and opens without refetching its HTML. Remote images/styles still require network, so this is a saved document, not a guaranteed complete offline website mirror.
4. Open an article link in another OS browser tab without creating a host browser tab.
5. Use the browser library on narrow/touch screens as an overlay, with scrollable tab controls and enlarged coarse-pointer targets.

## Gateway boundary

The server allows only HTTP(S), standard ports, no URL credentials, and publicly routable destination addresses. DNS is checked for every redirect and pinned into the outbound connection to prevent a second lookup from changing the destination. Loopback, local, private, link-local, multicast and IPv4-mapped IPv6 addresses are rejected. Redirects, response size, decompression output and total network time are bounded. No incoming cookies or authorization are forwarded. This gateway is not a general network proxy.

The rendered document has a nonce-limited CSP, disallows forms/frames/connections, removes website scripts/event handlers and refresh metadata, and lives in a sandbox without same-origin access. The desktop itself sends `frame-ancestors 'none'` to prevent it being embedded inside a permissive live frame after a redirect.

## Implemented Chromium runtime

The user requested correct Google/MDN rendering, so an actual Chromium runtime was added after the initial document browser. `lib/remote-browser/service.ts` owns isolated Playwright contexts; `/api/browser-runtime` exposes owner-cookie-bound sessions. `RemoteBrowser.tsx` displays actual viewport JPEGs and forwards mouse hover, click/drag, wheel, text/IME and keyboard controls. Touch tap/click and swipe/scroll are mapped separately, with an explicit on-screen-keyboard button. Remote sessions keep running while switching internal browser tabs; screenshot polling pauses for inactive tabs and hidden host documents. Transient capture failures use bounded exponential backoff, and expired/forbidden sessions stop polling until reconnection. The bounded input queue coalesces mouse motion, wheel and adjacent text events without changing click/key ordering; pending input is discarded when the session closes. Back, forward, reload, address changes and page screenshot export use the same session.

The default local application now chooses Chromium when its capability endpoint reports availability. Document and Live embed remain explicitly selectable fallbacks. Rendering uses roughly three screenshots per second, not a video stream: it prioritizes readable functional pages over low-latency animation. Native webpage accessibility semantics, copying remote selections, audio/video streaming, arbitrary remote downloads and passkey/WebAuthn support are not provided by this image transport. The UI offers Document mode for accessible page text and copying. Pasting text from the host clipboard is supported, and Copy address uses the host clipboard explicitly. Third-party CAPTCHA, account policy and network requirements remain applicable even with genuine Chromium.

Network traffic uses a bundled HTTP/CONNECT proxy constrained to public addresses, with DNS pinning. Service workers, direct proxy bypass and non-proxied WebRTC traffic are restricted; applications requiring those capabilities may not work. Contexts are separate from the host browser and do not inherit its signed-in sessions. Idle sessions expire. Runtime availability is opt-in for public self-hosted deployment and disabled on Vercel rather than falsely claiming persistent Chromium can run in a normal stateless function.

A future streamed CDP/WebRTC provider could reduce input/display latency and add richer runtime capabilities. [Browserless LiveURL](https://docs.browserless.io/bql-schema/operations/mutations/live-url) supports interactive browser streaming and session timeouts; [hybrid automation](https://docs.browserless.io/baas/monitor-sessions/hybrid-automation) documents its session lifecycle. Such a service adds server CPU/memory cost, sensitive session credentials, expiry, authentication and separate deployment requirements. It should have per-user isolation, resource quotas and explicit data residency. No paid Browserless service is required by the currently bundled local Chromium implementation.
