# Cloudflare managed browser for oma.os

Research: September 12, 2026. The native viewer is verified and the application now includes a Cloudflare Worker adapter. Chromium runs on the managed browser service, not inside a Vercel function. No paid plan or service has been provisioned by this research.

## Finding

Cloudflare **Browser Run** (formerly Browser Rendering) supplies managed Chrome. A Vercel-hosted oma.os can use a small authenticated Cloudflare Worker as its browser module while retaining the existing desktop frontend and local/self-hosted runtime. Stateful **Browser Sessions**, rather than stateless screenshot Quick Actions, are the relevant product. [Product overview](https://developers.cloudflare.com/browser-run/).

There are two viable display approaches:

1. **Native Live View**, verified in an actual deployment. Cloudflare provides `mode=tab`, `mode=full`, and inspector viewers. `Cloudflare.getLiveView` returns a session-scoped viewer URL with an expiring credential. Default URL validity is five minutes; a custom lifetime can be requested. Established connections can continue while the browser session survives. This replaces our JPEG/input relay for the Cloudflare deployment. An actual deployment test verified iframe compatibility, click/type input, and Google-to-MDN navigation; see the proof below. [Live View](https://developers.cloudflare.com/browser-run/features/live-view/), [human handoff API](https://developers.cloudflare.com/browser-run/features/human-in-the-loop/).
2. **Existing JPEG/input protocol through a Durable Object**. The browser session persists on Cloudflare, and the object owns its control connection and serializes actions. The Vercel endpoint proxies bounded authenticated requests; the current `RemoteBrowser` UI needs little change.

## Limits that matter

The current Free plan includes **10 browser minutes per day total**, three simultaneous browsers, and one new browser every 20 seconds. A default idle browser closes after 60 seconds. The documented supported keep-alive maximum is 10 minutes; active sessions have no fixed lifetime, but service releases can close them. Paid accounts have a default technical concurrency limit of 200 and three launches per second. These technical limits differ from included billing allowances. [Limits, updated August 20, 2026](https://developers.cloudflare.com/browser-run/limits/).

Paid usage includes 10 browser hours/month and 10 averaged concurrent browsers, then charges $0.09 per additional browser hour and $2 per additional averaged concurrent browser. Workers/Durable Object charges are separate. Free usage is suitable for a short personal demonstration, not an always-open public OS browser. [Pricing](https://developers.cloudflare.com/browser-run/pricing/), [Durable Object pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/).

One API schema advertises a larger keep-alive maximum than the narrative product guides. Use 60 seconds for the proof and no more than the documented 600,000 ms for the first adapter; do not rely on the discrepancy. [CDP API schema](https://developers.cloudflare.com/api/resources/browser_rendering/subresources/devtools/subresources/browser/methods/connect).

## Session ownership and concurrency

`browser.disconnect()` preserves a Puppeteer session for later `puppeteer.connect(binding, sessionId)`. `browser.close()` destroys it. Only one Worker control connection can own a session at a time. A per-request reconnect scheme therefore races when screenshots and mouse actions overlap. It also loses local interception handlers between requests. A Durable Object is the better fit for interactive, user-specific state. Store only browser/session target IDs and ownership metadata; do not use in-memory Vercel maps as durable ownership. [Session reuse](https://developers.cloudflare.com/browser-run/features/reuse-sessions/), [Puppeteer API](https://developers.cloudflare.com/browser-run/puppeteer/).

A single object per authenticated owner can retain one browser and multiple tabs. Contexts isolate cookies and storage; never randomly attach an owner to another user's available browser. Inactive browser windows should stop polling, and an alarm should explicitly close idle sessions. Recovery after object eviction may reconnect to the saved session ID or return an expired-session response. Cloudflare documents Durable Objects for stateful browser reuse and supports SQLite-backed objects on Free. No R2 bucket is required for an in-memory screenshot relay. [Durable Object browser guide](https://developers.cloudflare.com/browser-run/how-to/browser-run-with-do/), [session/context isolation](https://developers.cloudflare.com/browser-run/faq/).

## Exact minimal adapter

Proposed companion directory:

```text
companions/cloudflare-browser/
  package.json                 # @cloudflare/puppeteer, wrangler, TypeScript
  wrangler.jsonc               # browser binding; optional SQLite DO binding
  src/index.ts                 # authenticated worker router
  src/session.ts               # DO browser owner, queue, idle alarm if relay needed
  README.md                    # deploy, secrets, quota limits, shutdown
```

Configuration uses `nodejs_compat`, a current compatibility date, and `browser.binding = BROWSER`. For the relay, add a `BrowserSession` Durable Object with a SQLite migration. Keep the companion independent of Next.js and the root lockfile. The Worker binding grants browser access without shipping a Cloudflare account token in the application. [Wrangler setup](https://developers.cloudflare.com/browser-run/get-started/).

Application integration (Cloudflare is now the primary hosted target):

- Server-only `OMA_CLOUD_BROWSER_URL` and `OMA_CLOUD_BROWSER_TOKEN`; fixed configured upstream, never a client-supplied URL.
- Existing `/api/browser-runtime` validates authenticated application session and same-origin requests, then forwards a server-authenticated owner identity and the existing bounded protocol.
- Worker validates the shared server secret on every control request, derives the owner object, and verifies that every logical session belongs to that owner.
- Public capabilities report availability and expiry without exposing Cloudflare credentials, raw CDP endpoints or another user's session IDs.
- Native viewer URLs are sensitive delegated browser-control capabilities. Return them only to their authenticated owner, with short validity and no logging/referrer leakage; never return a Cloudflare API token.
- Closed/expired sessions return 410; account exhaustion returns 429 with retry guidance. A launch reservation and account-wide budget guard prevent public traffic from consuming the entire free allowance accidentally.

The current JPEG contract can remain: POST `start/navigate/back/forward/reload/pointer/click/scroll/key/type/resize/close`; GET session frame with encoded URL/title/loading headers. Serialize screenshot metadata with its frame to avoid mismatched-page claims. Every cloud poll also incurs a Vercel invocation and Worker request, so cap frequency and pause hidden windows.

## Network security: what is known and what is not

The existing local runtime has a DNS-pinned public-only HTTP/CONNECT proxy. That implementation cannot simply be copied into a Worker binding. Hostname validation plus DNS-over-HTTPS followed by Chromium `request.continue()` does **not** pin the actual browser connection and does not close DNS-rebinding races.

The reviewed Browser Run documentation does not establish an equivalent private-network-deny guarantee or a supported custom egress-proxy configuration. Do not claim parity with the local pinned proxy. The production native viewer deliberately relies on Cloudflare’s managed browser isolation: it has no host filesystem, application secrets, or local credentials. Application-issued navigation rejects credentials, non-HTTP(S), custom ports, and IP literals, but the native viewer can navigate independently and this validation is not an egress firewall. Managed browsers are available only to authenticated users. This distinction is a documented deployment boundary, not a claim that arbitrary remote websites are trusted.

Cloudflare's managed browser is also visibly automated. Its requests use Cloudflare addresses/identification headers; changing the user agent does not remove bot identification. CAPTCHA and account restrictions can still affect Google and other sites. [Automatic identification](https://developers.cloudflare.com/browser-run/reference/automatic-request-headers/), [Playwright notes](https://developers.cloudflare.com/browser-run/playwright/).

## Bounded native-view proof

A secret-protected companion Worker launched a hardcoded Google page and issued a one-minute native viewer capability. An isolated Playwright page embedded it successfully: viewer response HTTP 200, CSP `frame-ancestors *`, no X-Frame-Options, one rendered canvas, and no console errors. A second bounded session clicked and typed into Google’s actual search field, then used the viewer address control to navigate to MDN. Screenshots were visually inspected: Google input and suggestions, then the real MDN homepage, with native styles intact. Both sessions were explicitly closed; combined measured interaction was under 20 seconds. No paid plan was provisioned. The temporary `oma-browser-probe` Worker was subsequently deleted after the production integration; all probe sessions had already been closed. Temporary probe source/tooling was removed; the integrated application adapter and tests remain.

The production adapter uses one Durable Object per verified authenticated session, one managed browser per authenticated sign-in session with up to four independent pages, serialized control requests, a 75-second page idle timeout, 120-second browser keepalive, and a 15-minute absolute session limit. Visible pages heartbeat every 30 seconds. Closing a tab closes its managed page; the last page closes the browser. Provider allowance errors stop automatic attempts and explain the shared free allowance. Native viewer URLs are private session capabilities, never API tokens; responses are no-store and iframe referrers are disabled.

Frontend lifecycle tests use an intercepted viewer fixture and consume no managed-browser quota. They verify embedding without opening host tabs, explicit session close, and an actionable authentication error. The local Node/Chromium screenshot mode remains available for self hosting.

Successful logout schedules immediate browser closure and revokes its Durable Object session, including late queued start requests. Cleanup errors do not block logout; the idle alarm remains a fallback. Worker-runtime tests verify authenticated ownership, cross-origin rejection, internal cleanup-header isolation, and logout revocation without launching a managed browser.
