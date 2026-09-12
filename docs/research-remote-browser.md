# Interactive Chromium inside oma.os

The browser uses a bundled, headless Chromium instance on a persistent Node host. Playwright creates a separate ephemeral browser context for each oma.os browser window. Screenshots stream through a same-origin endpoint and pointer, keyboard, text, wheel and navigation commands operate the actual page. This is real HTML/CSS/JavaScript rendering, not a screenshot service pretending to navigate.

## Research and architecture

- [Playwright BrowserType](https://playwright.dev/docs/api/class-browsertype) documents launching Chromium and connecting over CDP. New contexts isolate cookies and storage; no user browser profile is read.
- [Playwright BrowserContext](https://playwright.dev/docs/api/class-browsercontext) documents context-scoped proxy, viewport, routing, service-worker and permission controls.
- [Playwright network](https://playwright.dev/docs/network) explains request interception and service-worker gaps. An interception-only fetch proxy proved insufficient for Chromium redirects: a subsequent navigation can take the native network path. The implementation therefore uses a real HTTP CONNECT proxy, preserving native TLS, redirects, cookies and page policy.
- The local proxy resolves a destination once, rejects every non-public DNS result, then opens the socket to the validated IP. DNS is never re-resolved during connection. Only HTTP/HTTPS standard ports are accepted. Chromium's loopback proxy bypass is explicitly removed and non-proxied WebRTC is disabled. Browser contexts also disable service workers and downloads.

## Running

Install the runtime: `npx playwright install chromium`. Development on localhost enables it automatically. A production self-host must explicitly set `OMA_BROWSER_ENABLED=1`; run it behind the host's access control on a private trusted deployment. This is a resource-bearing browser service, not an anonymous public browsing platform.

`OMA_BROWSER_ENABLED=0` disables the runtime. `OMA_BROWSER_CDP_URL` optionally connects to an operator-owned Chromium service. A remote browser also requires `OMA_BROWSER_PROXY_URL`, pointing to a public-only egress proxy reachable from that service; an operator must enforce equivalent private-network blocking there. The local bundled proxy cannot be reached from another host. CDP is not an authenticated end-user browser session and must never point at someone's persistent personal browser.

Vercel deliberately reports this capability unavailable because these sessions require a persistent process. Document and Embed modes remain available on serverless deployments. A future durable service can expose this same contract with authenticated ownership and reconnectable sessions.

## Boundaries

Sessions use random IDs and an HttpOnly, SameSite=Strict ownership cookie. Mutation requires matching Origin. Three sessions per owner and twelve per process are allowed, with fifteen-minute idle expiry. API body limits, input rate limits and viewport limits bound work. Camera, microphone and WebRTC are unavailable; local device uploads and clipboard bridging are not implemented. Public sites can still require login, show CAPTCHA, reject automation, or have unsupported codecs. Google can present its own bot challenge; oma.os renders the actual challenge rather than bypassing it.

The remote image stream is not accessible page DOM. The local Document mode remains useful for selectable, accessible text. Stored media in OPFS uses the native Media app rather than this service.

## Verification

Product service smoke: Google homepage rendered, click/type/Enter entered and submitted a search, MDN Web APIs rendered with the correct title, private IP navigation rejected. HTTP API smoke verified same-origin session creation and JPEG frame response. Unit tests cover private/mapped/metadata addresses, denied HTTP and CONNECT proxy requests, cross-origin controls, missing session ownership and Next's internal-host origin handling.
