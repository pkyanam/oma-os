# Native Cloudflare model provider

The Cloudflare build exposes an explicit Workers AI provider through the existing browser AI SDK harness. Desktop tools still execute in the browser with the existing review rules. There is no automatic fallback from another provider.

## Architecture

`/api/ai/v1/chat/completions` works without ChatGPT sign-in or a browser API key. It derives a daily HMAC-SHA256 identifier from Cloudflare's trusted `CF-Connecting-IP` header using the deployment secret. Raw addresses are not stored. `X-Forwarded-For`, cookies and client account IDs are ignored. Missing trusted network identity fails closed on hosted origins; localhost has a development fallback.

People sharing a public address share the network allowance. The global deployment cap remains independent of network changes. HMAC identifiers rotate daily. This is anonymous network-based throttling, not proof of a unique person.

The server allowlists four models in `lib/agent/workers-models.ts` (DeepSeek V4 Flash by default, GLM 5.3 Flash, Qwen 3.8 27B and Kimi K2.7 Code), accepts only text/function tool messages, normalizes the maximum output token field and requests disabled model thinking for this interactive mode (provider behavior varies). Unknown request fields are not forwarded. The AI binding returns streamed chat completion chunks to the existing OpenAI-compatible AI SDK client. Browser tools run locally between model steps.

Workers AI is paid by the deployment owner. No Cloudflare API token reaches the browser. The Worker requires both `AI` and `AI_QUOTA` bindings and a configured deployment secret (`LWC_SECRET`, also reused by optional ChatGPT sign-in); this provider is unavailable on deployments without them.

## Conservative limits

A singleton `AIQuota` Durable Object transaction reserves the deployment and network counters together **before inference**. UTC daily caps:

| Limit | Deployment | Network |
|---|---:|---:|
| Requests | 64 | 16 |
| Input UTF-8 bytes | 1,048,576 | 262,144 |
| Reserved output tokens | 131,072 | 32,768 |
| Active inference leases | 4 | 1 |

Each request has a 256 KiB UTF-8 body limit and an output cap of 2,048 tokens. Input byte accounting includes the serialized request and tool schemas; it is not a tokenizer or precise billing estimate. A single agent workflow may consume multiple requests. Failed and cancelled inference remains charged against the daily reservation. These bounds are deliberately conservative usage limits, not a strict dollar guarantee.

Active leases expire after 65 seconds. Stream completion, cancellation and errors release the lease without refunding the daily counters; an abort signal is sent upstream after 60 seconds. The lease protects against concurrent requests and abandoned streams, while the daily counters remain the hard application-side reservation boundary. Upstream cancellation cannot guarantee zero provider work after disconnect.

Only counters, daily keyed network identifiers and expiring lease IDs are persisted. Prompts and outputs are not logged or stored by this adapter. Provider data policies still apply.

## Verification

`lib/agent/cloudflare-ai.test.ts` covers request/model validation, denied requests reaching no inference binding, UTF-8 size enforcement, atomic concurrent reservations, daily reset/caps, lease expiry, cancellation, failure accounting, and a real installed AI SDK ToolLoopAgent consuming mocked streamed function-call chunks and continuing with its tool result.

The parent integration task separately performed one tiny live GLM binding inference. Automated tests do not invoke paid inference. A live tool-calling model interaction remains distinct from the mocked protocol test.

## Primary sources

- [GLM 5.3 Flash](https://developers.cloudflare.com/workers-ai/models/glm-5.3-flash/), [DeepSeek V4 Flash](https://developers.cloudflare.com/workers-ai/models/deepseek-v4-flash-0731/), [Qwen 3.8 27B](https://developers.cloudflare.com/workers-ai/models/qwen3.8-27b/), [Kimi K2.7 Code](https://developers.cloudflare.com/workers-ai/models/kimi-k2.7-code/): current catalog, function calling and streaming support. Authenticated `cf ai getModelSchema` verified chat-completion output, tool inputs, `max_completion_tokens`, and `chat_template_kwargs.enable_thinking` for all four on 2026-09-12. GLM, DeepSeek and Kimi require Workers Paid in the current catalog; no separate AI Gateway account is required.
- [Cloudflare request headers](https://developers.cloudflare.com/fundamentals/reference/http-request-headers/#cf-connecting-ip): trusted edge-provided connection address. This adapter is intended to run directly on Workers, not behind an untrusted proxy that accepts forged Cloudflare headers.
- [Workers AI bindings](https://developers.cloudflare.com/workers-ai/configuration/bindings/): native `AI` binding configuration.
- [Function calling](https://developers.cloudflare.com/workers-ai/features/function-calling/): model-selected function calls; execution remains in the application.
- [OpenAI compatibility](https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/): compatible chat completion endpoint format. This adapter uses the binding rather than a separate REST API token.
- [Rate limit binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/): per-location, eventually consistent limiting is unsuitable for strict account budget accounting; the adapter uses a Durable Object transaction instead.

## Live provider check

On 2026-09-12, the configured account returned a real GLM text completion (14 tokens), a correct `add(17, 25)` function call (206 tokens), and an OpenAI-compatible SSE text stream through the Cloudflare CLI. These check the live provider, separately from the previous authenticated application route. The route and AI SDK multi-step tool continuation are covered by isolated tests; these earlier checks do not constitute live validation of the new model allowlist or anonymous route.
