# Native Cloudflare model provider

The Cloudflare build exposes an explicit Workers AI provider through the existing browser AI SDK harness. Desktop tools still execute in the browser with the existing review rules. There is no automatic fallback from another provider.

## Architecture

`/api/ai/v1/chat/completions` validates the signed ChatGPT session and hashes the authenticated session's account ID for quota ownership. The session cookie's random routing ID is deliberately not used as the quota account: signing in again must not reset an account allowance. A pending login is insufficient.

The server fixes the model to `@cf/zai-org/glm-4.7-flash`, accepts only text/function tool messages, normalizes the maximum output token field and disables model thinking for this interactive mode. Unknown request fields are not forwarded. The AI binding returns streamed chat completion chunks to the existing OpenAI-compatible AI SDK client. Browser tools run locally between model steps.

Workers AI is paid by the deployment owner. No Cloudflare API token reaches the browser. The Worker requires both `AI` and `AI_QUOTA` bindings and a configured authentication secret; this provider is unavailable on deployments without them.

## Conservative limits

A singleton `AIQuota` Durable Object transaction reserves the deployment and account counters together **before inference**. UTC daily caps:

| Limit | Deployment | Account |
|---|---:|---:|
| Requests | 64 | 16 |
| Input UTF-8 bytes | 1,048,576 | 262,144 |
| Reserved output tokens | 131,072 | 32,768 |
| Active inference leases | 4 | 1 |

Each request has a 256 KiB UTF-8 body limit and an output cap of 2,048 tokens. Input byte accounting includes the serialized request and tool schemas; it is not a tokenizer or precise billing estimate. A single agent workflow may consume multiple requests. Failed and cancelled inference remains charged against the daily reservation. These bounds are deliberately conservative usage limits, not a strict dollar guarantee.

Active leases expire after 65 seconds. Stream completion, cancellation and errors release the lease without refunding the daily counters; an abort signal is sent upstream after 60 seconds. The lease protects against concurrent requests and abandoned streams, while the daily counters remain the hard application-side reservation boundary. Upstream cancellation cannot guarantee zero provider work after disconnect.

Only counters, hashed account IDs and expiring lease IDs are persisted. Prompts and outputs are not logged or stored by this adapter. Provider data policies still apply.

## Verification

`lib/agent/cloudflare-ai.test.ts` covers request/model validation, denied requests reaching no inference binding, UTF-8 size enforcement, atomic concurrent reservations, daily reset/caps, lease expiry, cancellation, failure accounting, and a real installed AI SDK ToolLoopAgent consuming mocked streamed function-call chunks and continuing with its tool result.

The parent integration task separately performed one tiny live GLM binding inference. Automated tests do not invoke paid inference. A live tool-calling model interaction remains distinct from the mocked protocol test.

## Primary sources

- [GLM-4.7-Flash model and binding schema](https://developers.cloudflare.com/workers-ai/models/glm-4.7-flash/): text generation, function calling and streaming support.
- [Workers AI bindings](https://developers.cloudflare.com/workers-ai/configuration/bindings/): native `AI` binding configuration.
- [Function calling](https://developers.cloudflare.com/workers-ai/features/function-calling/): model-selected function calls; execution remains in the application.
- [OpenAI compatibility](https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/): compatible chat completion endpoint format. This adapter uses the binding rather than a separate REST API token.
- [Rate limit binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/): per-location, eventually consistent limiting is unsuitable for strict account budget accounting; the adapter uses a Durable Object transaction instead.
