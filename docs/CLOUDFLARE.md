# Cloudflare architecture and next steps

Research checked against official documentation on 2026-09-12. This is an implementation map and ranked proposal, not a promise that every service is configured or free. Deployment instructions belong in [DEPLOYMENT.md](DEPLOYMENT.md); measured asset sizes are in [PERFORMANCE.md](PERFORMANCE.md).

## Implemented foundation

The Cloudflare target builds the React desktop with Vite and serves it through Workers Static Assets. `cloudflare/index.ts` handles API requests; static navigation falls through to `ASSETS`. This avoids requiring the Node/Next server on Cloudflare. Browser apps, OPFS files, Python, SQL, and the desktop tool interface continue running client-side.

Authentication uses per-session SQLite Durable Objects through `AUTH_SESSIONS`, keeping mutable session state out of an ephemeral Worker process. `API_LIMITER` provides native throttling, and Workers observability is enabled. The Pyodide gateway uses the Cache API and a fixed, hash-verified runtime manifest so Python dependencies load lazily without shipping every package with the desktop. Cache entries are expendable; they are not a database.

Native rate limits are local to Cloudflare locations and eventually consistent. They help control abuse, but a strict global spending cap requires a coordinated counter or account-level enforcement. Logs should exclude credentials, authorization headers, private documents, and model prompts. [Rate limiting semantics](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).

**Deployed browser integration:** managed Chromium through Browser Run, with a per-user Browser Durable Object coordinating sessions and Live View embedded inside the OS. The live deployment uses this integration; check the capabilities endpoint and actual navigation when deploying your own account. Live View is marked beta. Treat its access URLs as bearer capabilities: short lifetime, no shared cache or logging, and owner-checked session operations. Browser time and concurrency are separately metered; the documented Free allowance is only 10 browser minutes/day. [Live View](https://developers.cloudflare.com/browser-run/features/live-view/), [pricing](https://developers.cloudflare.com/browser-run/pricing/), [limits](https://developers.cloudflare.com/browser-run/limits/).

Workers AI integration adds `AI` and `AI_QUOTA`: ChatGPT sign-in supplies identity, while inference is billed to the Cloudflare deployment. The quota Durable Object stores counters rather than prompts and reserves at most 16 calls/account/day and 64/deployment/day, with input/output and concurrency limits. Model selection is explicit; code integration is not evidence of a successful authenticated inference request. See [exact limits](DEPLOYMENT.md#workers-ai-mode) and [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/).

## Highest-value additions

These are proposed, not enabled by this document.

**1. R2: recover the same workspace on another device.** Add opt-in encrypted snapshots of files, notes, drawings, and SQL exports. Start with explicit backup/restore before live synchronization. Bind private objects to authenticated owners, retain version manifests, enforce per-user byte quotas, and define key recovery before claiming end-to-end encryption. R2 charges storage and operations; free egress does not mean free storage. Its Standard free tier currently includes 10 GB-month and operation allowances. [R2 pricing](https://developers.cloudflare.com/r2/pricing/).

**2. AI Gateway: provider diagnostics and controls.** Workers AI itself is now implemented as an optional, explicitly selected `@cf/zai-org/glm-4.7-flash` mode with authenticated identity and atomic quota reservations. AI Gateway remains a proposal: add it when cross-provider diagnostics justify another service, keeping private prompt caching/logging off unless opted in. Gateway core features being free does not make inference free. [Gateway pricing](https://developers.cloudflare.com/ai-gateway/reference/pricing/).

**3. Agents SDK and Workflows: let a research job survive closing the tab.** Keep the existing browser agent harness and desktop approvals, then add a durable server-side coordinator for resumable jobs, scheduled work, and streaming status. Browser-owned tools must pause when the client disconnects; a background Worker cannot silently access OPFS. Workflows suit explicit retryable steps such as collect sources → produce draft → wait for review. Use idempotency keys around external writes and enforce a run budget, cancellation, and retention. The Agents SDK supplies identity, state, connections, and recovery; Workflows meters compute plus its applicable step/storage dimensions. [Agents runtime](https://developers.cloudflare.com/agents/), [Workflows pricing](https://developers.cloudflare.com/workflows/reference/pricing/).

## Add when the corresponding feature exists

| Service | Concrete oma.os use | Decision and constraints |
| --- | --- | --- |
| [D1](https://developers.cloudflare.com/d1/platform/pricing/) | Shared app catalog, indexed backup metadata, team membership | Use when cross-user relational queries are needed. Keep per-session coordination in Durable Objects. Index queries to control billed rows read; authorize every tenant query. |
| [KV](https://developers.cloudflare.com/kv/concepts/how-kv-works/) | Public catalog cache or noncritical feature configuration | Eventual consistency suits read-heavy data. Do not move auth revocation, locks, or spending counters here. |
| [Queues](https://developers.cloudflare.com/queues/) | Background thumbnail generation and document indexing after upload | Use idempotent consumers, bounded retries, and dead-letter handling; delivery can repeat. Messages and processing consume quotas. A durable interactive agent is better coordinated by Agents/Workflows. |
| [AI Search](https://developers.cloudflare.com/ai-search/) / [Vectorize](https://developers.cloudflare.com/vectorize/) | Search “the note with last month's architecture diagram” across approved cloud files | AI Search provides a managed retrieval path; Vectorize offers lower-level embedding search. Start only after opt-in cloud storage and deletion propagation exist. Filter by owner before retrieval; embeddings are sensitive derived data. Account for ingestion, embedding, retrieval, and model costs. |
| [Realtime](https://developers.cloudflare.com/realtime/) | Shared desktop sessions or voice collaboration | Add only with a real multiparty use case. Existing browser Live View does not itself require a new media stack. Authenticate room membership and short-lived TURN credentials. SFU/TURN egress and RealtimeKit participant-minute billing differ. |
| [Images](https://developers.cloudflare.com/images/) | Thumbnails for a shared media library | Valuable for uploaded cloud media, not local OPFS previews. Bound accepted sources and transformation variants; processing and delivery have usage costs. |
| [Turnstile](https://developers.cloudflare.com/turnstile/) | Protect anonymous browser/model session creation | Useful if public abuse appears. Verify tokens server-side and bind the intended action; a widget is not authentication or a strict budget cap. |
| [Containers](https://developers.cloudflare.com/containers/) / [Sandbox SDK](https://developers.cloudflare.com/sandbox/platform/) | Real npm builds, native tools, and repository execution beyond browser WASM | Highest capability gain, but adds compute/memory/network charges and isolation work. Require per-user sandboxes, restricted secrets, network policy, idle shutdown, and explicit persistence. Keep instant local Python/SQL for small tasks. |
| [Agent Memory](https://developers.cloudflare.com/agent-memory/) | Reviewed preferences and project facts across conversations | Private beta at review time; do not make open-source installation depend on access. Begin with inspectable local memory. Any pilot needs isolated profiles, opt-in ingestion, deletion/export, and protection against storing hostile instructions from retrieved pages. |

## Integration discipline

Add bindings only when a working UI and tested use case consume them. Track browser minutes, model tokens, uploaded bytes, and job attempts per owner; rate limits alone do not cap bills. Preserve local-only operation and make cloud data movement visible.

Use the repository's explicit `build:cloudflare` and `deploy:cloudflare` scripts. Generic framework autodetection can select the retained Next target incorrectly. Before deployment, inspect the generated Wrangler configuration and actual bindings, then test health, login, browser ownership, cold asset loads, and private-file isolation against the deployed origin. Recheck current [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) and service-specific limits when enabling a new capability.

## Continuous deployment

The published Worker currently deploys through Wrangler, with checks in GitHub Actions. No Workers Builds trigger is configured. Read-only CLI discovery found no usable repository link. Cloudflare requires a one-time [GitHub App authorization](https://developers.cloudflare.com/workers/ci-cd/builds/api-reference/#prerequisites) before API-based setup; after authorization, use repository `pkyanam/oma-os`, branch `main`, root `/`, build `npm run build:cloudflare`, deploy `npx wrangler deploy`, and Node 24. Keep Durable Object preview limitations in mind when adding branch builds.
