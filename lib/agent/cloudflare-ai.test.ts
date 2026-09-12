import test from "node:test";
import assert from "node:assert/strict";
import { sign } from "@opencoredev/loginwithchatgpt-server";
import {
  AIQuota,
  AI_LIMITS,
  WORKERS_AI_MODEL,
  reserveBudget,
  validateAIInput,
  routeAI,
  type Budget,
} from "../../cloudflare/ai";
const account = "a".repeat(64);
const input = () => ({
  model: WORKERS_AI_MODEL,
  messages: [{ role: "user", content: "hello" }],
  stream: true,
  max_tokens: 32,
});
function quotaStore() {
  let stored: Budget | undefined;
  let queue = Promise.resolve();
  const quota = new AIQuota({
    storage: {
      transaction<T>(
        fn: (txn: {
          get<T>(key: string): Promise<T | undefined>;
          put(key: string, value: unknown): Promise<unknown>;
        }) => Promise<T>,
      ) {
        const next = queue.then(() =>
          fn({
            get: async <T>() => structuredClone(stored) as T | undefined,
            put: async (_key, value) => {
              stored = structuredClone(value as Budget);
            },
          }),
        );
        queue = next.then(
          () => {},
          () => {},
        );
        return next;
      },
    },
  });
  return { quota, read: () => stored };
}
async function setup() {
  const store = quotaStore();
  let calls = 0;
  const secret = "s".repeat(40);
  const cookie =
    "lwc_session=" + encodeURIComponent(await sign("x".repeat(32), secret));
  const env: Parameters<typeof routeAI>[1] = {
    LWC_SECRET: secret,
    AUTH_SESSIONS: {
      idFromName: (n) => ({ toString: () => n }),
      get: () => ({
        fetch: async () =>
          Response.json({
            status: "authenticated",
            user: { accountId: "real-account" },
          }),
      }),
    },
    AI_QUOTA: {
      idFromName: (n) => n,
      get: () => ({ fetch: (r) => store.quota.fetch(r) }),
    },
    AI: {
      run: async () => {
        calls++;
        return new ReadableStream({
          start(c) {
            c.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
            c.close();
          },
        });
      },
    },
  };
  const request = (body: unknown = input(), headers: HeadersInit = {}) =>
    new Request("https://oma.test/api/ai/v1/chat/completions", {
      method: "POST",
      headers: { cookie, "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
  return { env, request, store, calls: () => calls };
}
test("fixed model, text and tool input only; canonical output limit and reasoning disabled", () => {
  const result = validateAIInput({
    ...input(),
    chat_template_kwargs: { enable_thinking: true },
    web_search_options: {},
  });
  assert.equal(result.max_completion_tokens, 32);
  assert.deepEqual(result.chat_template_kwargs, { enable_thinking: false });
  assert.ok(!("web_search_options" in result));
  for (const bad of [
    { model: "other" },
    { max_tokens: 2049 },
    { max_completion_tokens: 2049 },
    { n: 2 },
    { stream: false },
    {
      messages: [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: "https://remote" } },
          ],
        },
      ],
    },
  ])
    assert.throws(() => validateAIInput({ ...input(), ...bad }));
  const tool = validateAIInput({
    ...input(),
    messages: [
      {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: { name: "files_read", arguments: "{}" },
          },
        ],
      },
      { role: "tool", tool_call_id: "call_1", content: "file contents" },
    ],
    tools: [
      {
        type: "function",
        function: { name: "files_read", parameters: { type: "object" } },
      },
    ],
    tool_choice: "auto",
  });
  assert.equal(tool.tools?.length, 1);
  assert.equal(tool.messages.length, 2);
});
test("daily account, aggregate input bytes and deployment limits reserve before use; lease expires", () => {
  const now = Date.UTC(2026, 8, 12);
  let budget: Budget | undefined;
  for (let i = 0; i < 16; i++) {
    const r = reserveBudget(budget, account, 100, 2048, now + i * 66000);
    assert.ok(r.budget);
    budget = r.budget;
  }
  assert.equal(
    reserveBudget(budget, account, 100, 1, now + 17 * 66000).error,
    "account_daily_limit",
  );
  assert.ok(reserveBudget(budget, account, 100, 1, now + 86400000).budget);
  const large = reserveBudget(undefined, account, AI_LIMITS.bodyBytes, 1, now);
  assert.equal(
    reserveBudget(large.budget, account, 1, 1, now + 66000).error,
    "account_daily_limit",
  );
  assert.equal(
    reserveBudget(large.budget, account, 1, 1, now + 1).error,
    "account_busy",
  );
  let global: Budget | undefined;
  for (let i = 0; i < 64; i++) {
    const r = reserveBudget(
      global,
      (i % 8).toString(16).repeat(64),
      1,
      1,
      now + i * 66000,
    );
    assert.ok(r.budget);
    global = r.budget;
  }
  assert.equal(
    reserveBudget(global, "f".repeat(64), 1, 1, now + 65 * 66000).error,
    "deployment_daily_limit",
  );
});
test("atomic concurrent reservation allows one account lease; release retains spent quota", async () => {
  const { quota, read } = quotaStore();
  const reserve = () =>
    quota.fetch(
      new Request("https://quota/reserve", {
        method: "POST",
        body: JSON.stringify({ account, inputBytes: 100, outputTokens: 32 }),
      }),
    );
  const results = await Promise.all(Array.from({ length: 16 }, reserve));
  assert.equal(results.filter((r) => r.ok).length, 1);
  assert.equal(read()?.total.calls, 1);
  const lease = (await results.find((r) => r.ok)!.json()).lease;
  await quota.fetch(
    new Request("https://quota/release", {
      method: "POST",
      body: JSON.stringify({ lease }),
    }),
  );
  assert.equal((await reserve()).status, 200);
  assert.equal(read()?.total.calls, 2);
});
test("route rejects unauthenticated, cross origin, oversized UTF8 and malformed input without inference", async () => {
  const s = await setup();
  assert.equal(
    (await routeAI(s.request(input(), { cookie: "" }), s.env)).status,
    401,
  );
  assert.equal(
    (await routeAI(s.request(input(), { origin: "https://evil.test" }), s.env))
      .status,
    403,
  );
  assert.equal(
    (
      await routeAI(
        s.request({
          ...input(),
          messages: [{ role: "user", content: "界".repeat(100000) }],
        }),
        s.env,
      )
    ).status,
    413,
  );
  assert.equal(
    (await routeAI(s.request({ ...input(), max_tokens: 9000 }), s.env)).status,
    400,
  );
  assert.equal(s.calls(), 0);
  assert.equal(s.store.read(), undefined);
});
test("route streams and releases lease; failed inference retains daily reservation", async () => {
  const s = await setup();
  const response = await routeAI(s.request(), s.env);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /DONE/);
  assert.equal(s.calls(), 1);
  assert.equal(Object.keys(s.store.read()!.active).length, 0);
  s.env.AI!.run = async () => {
    throw new Error("private upstream content");
  };
  const fail = await routeAI(s.request(), s.env);
  assert.equal(fail.status, 502);
  assert.ok(!(await fail.text()).includes("private"));
  assert.equal(s.store.read()?.total.calls, 2);
  assert.equal(Object.keys(s.store.read()!.active).length, 0);
});
test("downstream cancellation reaches upstream and releases lease", async () => {
  const s = await setup();
  let cancelled = false;
  s.env.AI!.run = async () =>
    new ReadableStream({
      cancel() {
        cancelled = true;
      },
    });
  const response = await routeAI(s.request(), s.env);
  await response.body!.cancel();
  assert.equal(cancelled, true);
  assert.equal(Object.keys(s.store.read()!.active).length, 0);
  assert.equal(s.store.read()?.total.calls, 1);
});

test("existing AI SDK completes a streamed function call and follow-up through the route", async () => {
  const { createOpenAI } = await import("@ai-sdk/openai");
  const { ToolLoopAgent, tool, jsonSchema, stepCountIs } = await import("ai");
  const s = await setup();
  let step = 0;
  let executed = false;
  s.env.AI!.run = async (_model, payload) => {
    step++;
    if (step === 2)
      assert.ok(JSON.stringify(payload).includes("tool-result-ok"));
    const delta =
      step === 1
        ? {
            tool_calls: [
              {
                index: 0,
                id: "call_one",
                type: "function",
                function: { name: "inspect", arguments: "{}" },
              },
            ],
          }
        : { content: "Finished" };
    const chunk = {
      id: "completion",
      object: "chat.completion.chunk",
      created: 1,
      model: WORKERS_AI_MODEL,
      choices: [{ index: 0, delta, finish_reason: null }],
    };
    const end = {
      ...chunk,
      choices: [
        {
          index: 0,
          delta: {},
          finish_reason: step === 1 ? "tool_calls" : "stop",
        },
      ],
    };
    return new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            `data: ${JSON.stringify(chunk)}\n\ndata: ${JSON.stringify(end)}\n\ndata: [DONE]\n\n`,
          ),
        );
        controller.close();
      },
    });
  };
  const model = createOpenAI({
    apiKey: "unused",
    baseURL: "https://oma.test/api/ai/v1",
    fetch: async (url, init) => {
      const request = s.request(JSON.parse(String(init?.body)));
      return routeAI(new Request(String(url), request), s.env);
    },
  }).chat(WORKERS_AI_MODEL);
  const agent = new ToolLoopAgent({
    model,
    maxOutputTokens: 32,
    stopWhen: stepCountIs(3),
    tools: {
      inspect: tool({
        description: "Inspect",
        inputSchema: jsonSchema<Record<string, never>>({
          type: "object",
          properties: {},
          additionalProperties: false,
        }),
        execute: async () => {
          executed = true;
          return "tool-result-ok";
        },
      }),
    },
  });
  const result = await agent.stream({ prompt: "Inspect then finish" });
  let text = "";
  for await (const chunk of result.textStream) text += chunk;
  assert.equal(text, "Finished");
  assert.equal(executed, true);
  assert.equal(step, 2);
  assert.equal(s.store.read()?.total.calls, 2);
});

test("re-login cannot reset an account lease; pending sessions cannot spend inference", async () => {
  const s = await setup();
  s.env.AI!.run = async () => new ReadableStream();
  const first = await routeAI(s.request(), s.env);
  assert.equal(first.status, 200);
  const differentCookie =
    "lwc_session=" +
    encodeURIComponent(await sign("y".repeat(32), s.env.LWC_SECRET));
  const second = await routeAI(
    s.request(input(), { cookie: differentCookie }),
    s.env,
  );
  assert.equal(second.status, 429);
  assert.match(await second.text(), /account_busy/);
  assert.equal(s.store.read()?.total.calls, 1);
  await first.body!.cancel();
  s.env.AUTH_SESSIONS.get = () => ({
    fetch: async () =>
      Response.json({ status: "pending", user: { accountId: "real-account" } }),
  });
  assert.equal((await routeAI(s.request(), s.env)).status, 401);
  assert.equal(s.store.read()?.total.calls, 1);
});

test("deployment lease cap applies across accounts and daily reset retains active leases", () => {
  const now = Date.UTC(2026, 8, 12, 23, 59, 59);
  let budget: Budget | undefined;
  for (let i = 0; i < 4; i++)
    budget = reserveBudget(budget, String(i).repeat(64), 1, 1, now).budget;
  assert.equal(
    reserveBudget(budget, "f".repeat(64), 1, 1, now + 2000).error,
    "deployment_busy",
  );
  assert.ok(reserveBudget(budget, "f".repeat(64), 1, 1, now + 66000).budget);
});
