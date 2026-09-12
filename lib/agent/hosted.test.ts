import test from "node:test";
import assert from "node:assert/strict";
import { streamText } from "ai";
import { runAgent } from "./harness";
import {
  workersAIModel,
  workersAIAvailability,
  WORKERS_AI_MODEL,
} from "./hosted";
import { publicPreferences } from "./settings";
test("hosted model streams through only the same-origin endpoint without a provider key", async () => {
  let calls = 0;
  const model = workersAIModel(WORKERS_AI_MODEL, async (input, init) => {
    calls++;
    assert.equal(input, "/api/ai/v1/chat/completions");
    assert.equal(init?.credentials, "same-origin");
    assert.equal(init?.redirect, "error");
    assert.equal(new Headers(init?.headers).get("authorization"), null);
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, WORKERS_AI_MODEL);
    assert.equal(body.max_tokens ?? body.max_completion_tokens, 2048);
    const chunk = {
      id: "fixture",
      object: "chat.completion.chunk",
      created: 0,
      model: WORKERS_AI_MODEL,
      choices: [
        {
          index: 0,
          delta: { role: "assistant", content: "Hello" },
          finish_reason: null,
        },
      ],
    };
    const end = {
      ...chunk,
      choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
    };
    return new Response(
      `data: ${JSON.stringify(chunk)}\n\ndata: ${JSON.stringify(end)}\n\ndata: [DONE]\n\n`,
      { headers: { "content-type": "text/event-stream" } },
    );
  });
  const result = streamText({
    model,
    prompt: "Hi",
    maxOutputTokens: 2048,
    maxRetries: 0,
  });
  assert.equal(await result.text, "Hello");
  assert.equal(calls, 1);
});
test("hosted errors surface without provider fallback and unsupported models are rejected", async () => {
  assert.throws(
    () => workersAIModel("different-model"),
    /supported Workers AI model/,
  );
  let calls = 0;
  const model = workersAIModel(WORKERS_AI_MODEL, async () => {
    calls++;
    return Response.json(
      {
        error: {
          message: "Daily hosted allowance reached",
          type: "rate_limit_error",
          code: "quota_exceeded",
        },
      },
      { status: 429 },
    );
  });
  await assert.rejects(
    runAgent(
      {
        mode: "workers-ai",
        model: WORKERS_AI_MODEL,
        baseURL: "",
        apiKey: "",
        tools: false,
      },
      [{ role: "user", content: "Hi" }],
      new AbortController().signal,
      () => {},
      async () => false,
      { model },
    ),
    /Daily hosted allowance reached/,
  );
  assert.equal(calls, 1);
});
test("hosted availability and persisted mode are explicit without saved authentication claims", () => {
  assert.deepEqual(
    workersAIAvailability({
      enabled: true,
      models: [WORKERS_AI_MODEL, "unknown"],
    }),
    { enabled: true, models: [WORKERS_AI_MODEL] },
  );
  assert.equal(
    workersAIAvailability({ enabled: true, models: ["unknown"] }).enabled,
    false,
  );
  assert.equal(workersAIAvailability(undefined).enabled, false);
  assert.deepEqual(
    publicPreferences({
      mode: "workers-ai",
      model: WORKERS_AI_MODEL,
      apiKey: "secret",
      authenticated: true,
    }),
    { mode: "workers-ai", model: WORKERS_AI_MODEL },
  );
});

test("hosted OpenAI SSE tool calls execute and return results to the next model step", async () => {
  let calls = 0;
  const model = workersAIModel(WORKERS_AI_MODEL, async (_input, init) => {
    calls++;
    const body = JSON.parse(String(init?.body));
    assert.equal(body.max_tokens ?? body.max_completion_tokens, 2048);
    if (calls === 2)
      assert.ok(
        body.messages.some(
          (message: { role: string; content?: string }) =>
            message.role === "tool" && message.content?.includes("oma.os"),
        ),
      );
    const delta =
      calls === 1
        ? {
            role: "assistant",
            tool_calls: [
              {
                index: 0,
                id: "version-call",
                type: "function",
                function: {
                  name: "desktop",
                  arguments: JSON.stringify({ argv: ["version"] }),
                },
              },
            ],
          }
        : { role: "assistant", content: "Version verified." };
    const chunk = {
      id: "tools-fixture",
      object: "chat.completion.chunk",
      created: 0,
      model: WORKERS_AI_MODEL,
      choices: [{ index: 0, delta, finish_reason: null }],
    };
    const end = {
      ...chunk,
      choices: [
        {
          index: 0,
          delta: {},
          finish_reason: calls === 1 ? "tool_calls" : "stop",
        },
      ],
    };
    return new Response(
      `data: ${JSON.stringify(chunk)}\n\ndata: ${JSON.stringify(end)}\n\ndata: [DONE]\n\n`,
      { headers: { "content-type": "text/event-stream" } },
    );
  });
  const events: string[] = [];
  await runAgent(
    {
      mode: "workers-ai",
      model: WORKERS_AI_MODEL,
      baseURL: "",
      apiKey: "",
      tools: true,
    },
    [{ role: "user", content: "Check desktop version" }],
    new AbortController().signal,
    (event) => {
      if (event.type === "text") events.push(event.text);
    },
    async () => false,
    { model },
  );
  assert.equal(calls, 2);
  assert.equal(events.join(""), "Version verified.");
});
