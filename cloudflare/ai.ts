import {
  authenticatedAccountIdentity,
  type AuthEnv,
} from "../companions/cloudflare-app/src/auth-core";

export const WORKERS_AI_MODEL = "@cf/zai-org/glm-4.7-flash";
export const AI_LIMITS = Object.freeze({
  bodyBytes: 262144,
  outputTokens: 2048,
  deploymentCalls: 64,
  accountCalls: 16,
  deploymentInputBytes: 1048576,
  accountInputBytes: 262144,
  deploymentOutputTokens: 131072,
  accountOutputTokens: 32768,
});
type Counter = { calls: number; inputBytes: number; outputTokens: number };
export type Budget = {
  day: string;
  total: Counter;
  accounts: Record<string, Counter>;
  active: Record<string, { account: string; until: number }>;
};
const emptyCounter = (): Counter => ({
  calls: 0,
  inputBytes: 0,
  outputTokens: 0,
});
export function reserveBudget(
  previous: Budget | undefined,
  account: string,
  inputBytes: number,
  outputTokens: number,
  now = Date.now(),
): { budget?: Budget; lease?: string; error?: string } {
  if (
    !/^[a-f0-9]{64}$/.test(account) ||
    !Number.isInteger(inputBytes) ||
    inputBytes < 1 ||
    inputBytes > AI_LIMITS.bodyBytes ||
    !Number.isInteger(outputTokens) ||
    outputTokens < 1 ||
    outputTokens > AI_LIMITS.outputTokens
  )
    return { error: "invalid_reservation" };
  const day = new Date(now).toISOString().slice(0, 10);
  const budget =
    previous?.day === day
      ? structuredClone(previous)
      : {
          day,
          total: emptyCounter(),
          accounts: {},
          active: previous?.active ?? {},
        };
  budget.active = Object.fromEntries(
    Object.entries(budget.active ?? {}).filter(
      ([, lease]) => lease.until > now,
    ),
  );
  if (Object.values(budget.active).some((lease) => lease.account === account))
    return { error: "account_busy" };
  if (Object.keys(budget.active).length >= 4)
    return { error: "deployment_busy" };
  const lease = crypto.randomUUID();
  const personal = budget.accounts[account] ?? emptyCounter();
  const exceeds = (c: Counter, calls: number, chars: number, tokens: number) =>
    c.calls + 1 > calls ||
    c.inputBytes + inputBytes > chars ||
    c.outputTokens + outputTokens > tokens;
  if (
    exceeds(
      budget.total,
      AI_LIMITS.deploymentCalls,
      AI_LIMITS.deploymentInputBytes,
      AI_LIMITS.deploymentOutputTokens,
    )
  )
    return { error: "deployment_daily_limit" };
  if (
    exceeds(
      personal,
      AI_LIMITS.accountCalls,
      AI_LIMITS.accountInputBytes,
      AI_LIMITS.accountOutputTokens,
    )
  )
    return { error: "account_daily_limit" };
  for (const counter of [budget.total, personal]) {
    counter.calls++;
    counter.inputBytes += inputBytes;
    counter.outputTokens += outputTokens;
  }
  budget.accounts[account] = personal;
  budget.active[lease] = { account, until: now + 65000 };
  return { budget, lease };
}

/** One singleton DO per deployment makes account and deployment reservations atomic.
 * Failed/cancelled inference is intentionally not refunded. Only counters are stored. */
export class AIQuota {
  constructor(
    private ctx: {
      storage: {
        transaction<T>(
          fn: (txn: {
            get<T>(key: string): Promise<T | undefined>;
            put(key: string, value: unknown): Promise<unknown>;
          }) => Promise<T>,
        ): Promise<T>;
      };
    },
  ) {}
  async fetch(request: Request): Promise<Response> {
    if (
      request.method !== "POST" ||
      !["/reserve", "/release"].includes(new URL(request.url).pathname)
    )
      return Response.json({ error: "not_found" }, { status: 404 });
    if (new URL(request.url).pathname === "/release") {
      const { lease } = (await request.json()) as { lease: string };
      return this.ctx.storage.transaction(async (txn) => {
        const budget = await txn.get<Budget>("budget");
        if (budget?.active && typeof lease === "string") {
          delete budget.active[lease];
          await txn.put("budget", budget);
        }
        return Response.json({ released: true });
      });
    }
    const { account, inputBytes, outputTokens } = (await request.json()) as {
      account: string;
      inputBytes: number;
      outputTokens: number;
    };
    return this.ctx.storage.transaction(async (txn) => {
      const reservation = reserveBudget(
        await txn.get<Budget>("budget"),
        account,
        inputBytes,
        outputTokens,
      );
      if (!reservation.budget)
        return Response.json({ error: reservation.error }, { status: 429 });
      await txn.put("budget", reservation.budget);
      return Response.json({ reserved: true, lease: reservation.lease });
    });
  }
}

type Input = {
  model: string;
  messages: unknown[];
  tools?: unknown[];
  tool_choice?: unknown;
  stream: true;
  stream_options: { include_usage: true };
  max_completion_tokens: number;
  n: 1;
  chat_template_kwargs: { enable_thinking: false };
};
type AIEnv = AuthEnv & {
  AI?: {
    run: (
      model: string,
      input: never,
      options?: { signal?: AbortSignal },
    ) => Promise<unknown>;
  };
  AI_QUOTA?: {
    idFromName(name: string): unknown;
    get(id: never): { fetch(request: Request): Promise<Response> };
  };
};
export function aiEnabled(env: {
  AI?: unknown;
  AI_QUOTA?: unknown;
  LWC_SECRET?: string;
}) {
  return (
    !!env.AI &&
    !!env.AI_QUOTA &&
    !!env.LWC_SECRET &&
    env.LWC_SECRET.length >= 32
  );
}
function error(message: string, status: number, code: string) {
  return Response.json(
    { error: { message, type: "workers_ai_error", code } },
    {
      status,
      headers: {
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    },
  );
}
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
export function validateAIInput(value: unknown): Input {
  if (!record(value) || value.model !== WORKERS_AI_MODEL)
    throw new Error("Choose the supported Cloudflare model.");
  if (value.stream !== true)
    throw new Error("This endpoint requires streaming.");
  const max =
    value.max_completion_tokens ?? value.max_tokens ?? AI_LIMITS.outputTokens;
  if (
    !Number.isInteger(max) ||
    (max as number) < 1 ||
    (max as number) > AI_LIMITS.outputTokens ||
    (value.max_tokens !== undefined &&
      (!Number.isInteger(value.max_tokens) ||
        (value.max_tokens as number) < 1 ||
        (value.max_tokens as number) > AI_LIMITS.outputTokens)) ||
    (value.n !== undefined && value.n !== 1)
  )
    throw new Error("Use one completion with at most 2048 output tokens.");
  if (
    !Array.isArray(value.messages) ||
    value.messages.length < 1 ||
    value.messages.length > 128
  )
    throw new Error("Send between 1 and 128 text or tool messages.");
  const messages = value.messages.map((message) => {
    if (
      !record(message) ||
      !["system", "developer", "user", "assistant", "tool"].includes(
        String(message.role),
      )
    )
      throw new Error("Unsupported message role.");
    let content = message.content;
    if (Array.isArray(content)) {
      if (
        !content.every(
          (part) =>
            record(part) &&
            part.type === "text" &&
            typeof part.text === "string",
        )
      )
        throw new Error(
          "Cloudflare mode accepts text and tool results; images and remote media are not supported.",
        );
      content = content
        .map((part) => (part as { text: string }).text)
        .join("\n");
    }
    if (
      content !== null &&
      content !== undefined &&
      typeof content !== "string"
    )
      throw new Error("Messages must contain text.");
    const result: Record<string, unknown> = {
      role: message.role,
      content: content ?? null,
    };
    if (message.role === "tool") {
      if (
        typeof message.tool_call_id !== "string" ||
        !message.tool_call_id ||
        typeof content !== "string"
      )
        throw new Error("Tool results need a call ID and text content.");
      result.tool_call_id = message.tool_call_id;
    }
    if (message.tool_calls !== undefined) {
      if (
        message.role !== "assistant" ||
        !Array.isArray(message.tool_calls) ||
        message.tool_calls.length > 64
      )
        throw new Error("Invalid assistant tool calls.");
      result.tool_calls = message.tool_calls.map((call) => {
        if (
          !record(call) ||
          typeof call.id !== "string" ||
          !call.id ||
          call.type !== "function" ||
          !record(call.function) ||
          typeof call.function.name !== "string" ||
          typeof call.function.arguments !== "string"
        )
          throw new Error("Invalid assistant function call.");
        return {
          id: call.id,
          type: "function",
          function: {
            name: call.function.name,
            arguments: call.function.arguments,
          },
        };
      });
    }
    return result;
  });
  const input: Input = {
    model: WORKERS_AI_MODEL,
    messages,
    stream: true,
    stream_options: { include_usage: true },
    max_completion_tokens: max as number,
    n: 1,
    chat_template_kwargs: { enable_thinking: false },
  };
  if (value.tools !== undefined) {
    if (!Array.isArray(value.tools) || value.tools.length > 64)
      throw new Error("At most 64 function tools are supported.");
    input.tools = value.tools.map((t) => {
      if (
        !record(t) ||
        t.type !== "function" ||
        !record(t.function) ||
        typeof t.function.name !== "string" ||
        !/^[a-zA-Z0-9_-]{1,64}$/.test(t.function.name) ||
        !record(t.function.parameters)
      )
        throw new Error("Only JSON-schema function tools are supported.");
      return {
        type: "function",
        function: {
          name: t.function.name,
          parameters: t.function.parameters,
          ...(typeof t.function.description === "string"
            ? { description: t.function.description }
            : {}),
        },
      };
    });
  }
  if (value.tool_choice !== undefined) {
    if (!["auto", "none", "required"].includes(String(value.tool_choice)))
      throw new Error("Unsupported tool choice.");
    input.tool_choice = value.tool_choice;
  }
  return input;
}
async function readBody(request: Request): Promise<string> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("A JSON request body is required.");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > AI_LIMITS.bodyBytes) {
        await reader.cancel();
        throw new RangeError(
          "Conversation exceeds 256 KiB. Start a new conversation or shorten the request.",
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(body);
}
export async function routeAI(
  request: Request,
  env: AIEnv,
  ctx?: { waitUntil(promise: Promise<unknown>): void },
): Promise<Response> {
  if (request.method !== "POST")
    return error("Use POST for model requests.", 405, "method_not_allowed");
  const origin = request.headers.get("origin");
  if (
    request.headers.get("sec-fetch-site") === "cross-site" ||
    (origin && origin !== new URL(request.url).origin)
  )
    return error(
      "Cross-origin model requests are not allowed.",
      403,
      "origin_not_allowed",
    );
  if (!aiEnabled(env))
    return error(
      "Cloudflare AI is not configured on this deployment.",
      503,
      "not_configured",
    );
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    return error("Send application/json.", 415, "invalid_content_type");
  const account = await authenticatedAccountIdentity(request, env);
  if (!account)
    return error(
      "Sign in with ChatGPT to use this deployment's Cloudflare model.",
      401,
      "authentication_required",
    );
  let input: Input, body: string;
  try {
    body = await readBody(request);
    input = validateAIInput(JSON.parse(body));
  } catch (cause) {
    return error(
      cause instanceof Error ? cause.message : "Invalid request.",
      cause instanceof RangeError ? 413 : 400,
      "invalid_request",
    );
  }
  if (request.signal.aborted)
    return error("Request cancelled.", 499, "cancelled");
  const quota = await env
    .AI_QUOTA!.get(env.AI_QUOTA!.idFromName("deployment") as never)
    .fetch(
      new Request("https://quota/reserve", {
        method: "POST",
        body: JSON.stringify({
          account,
          inputBytes: new TextEncoder().encode(body).byteLength,
          outputTokens: input.max_completion_tokens,
        }),
      }),
    );
  if (!quota.ok) {
    const result = (await quota.json()) as { error?: string };
    return error(
      result.error?.endsWith("_busy")
        ? "A Cloudflare AI request is already running. Try again shortly."
        : result.error === "account_daily_limit"
          ? "Your Cloudflare AI daily allowance is used. Try after 00:00 UTC or choose another provider."
          : "This deployment's Cloudflare AI daily allowance is used. Try after 00:00 UTC or choose another provider.",
      429,
      result.error ?? "quota_unavailable",
    );
  }
  const { lease } = (await quota.json()) as { lease: string };
  let released = false;
  const release = async () => {
    if (released) return;
    released = true;
    await env
      .AI_QUOTA!.get(env.AI_QUOTA!.idFromName("deployment") as never)
      .fetch(
        new Request("https://quota/release", {
          method: "POST",
          body: JSON.stringify({ lease }),
        }),
      );
  };
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(60000)]);
  try {
    const stream = await env.AI!.run(WORKERS_AI_MODEL, input as never, {
      signal,
    });
    if (!(stream instanceof ReadableStream)) {
      await release();
      return error(
        "Cloudflare returned an unexpected response. Please retry.",
        502,
        "invalid_upstream_response",
      );
    }
    const reader = stream.getReader();
    const abort = () => {
      const cleanup = reader
        .cancel(signal.reason)
        .catch(() => {})
        .then(release)
        .catch(() => {});
      ctx?.waitUntil(cleanup);
    };
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    const cleanup = async () => {
      signal.removeEventListener("abort", abort);
      await release();
    };
    const output = new ReadableStream({
      async pull(controller) {
        try {
          const result = await reader.read();
          if (result.done) {
            await cleanup();
            controller.close();
          } else controller.enqueue(result.value);
        } catch (cause) {
          await cleanup();
          controller.error(cause);
        }
      },
      async cancel(reason) {
        try {
          await reader.cancel(reason);
        } finally {
          await cleanup();
        }
      },
    });
    return new Response(output, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    await release().catch(() => {});
    return error(
      "Cloudflare AI could not finish this request. Retry or choose another provider.",
      502,
      "inference_failed",
    );
  }
}
