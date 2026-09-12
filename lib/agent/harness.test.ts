import test from "node:test";
import assert from "node:assert/strict";
import { MockLanguageModelV4 } from "ai/test";
import { runAgent, type HarnessEvent } from "./harness";
const config = {
  mode: "direct" as const,
  baseURL: "https://provider.example/v1",
  apiKey: "",
  model: "mock",
  tools: false,
};
test("cancelling a live model stream rejects only the awaited run", async () => {
  const abort = new AbortController();
  const model = new MockLanguageModelV4({
    doStream: async ({ abortSignal }) => ({
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue({ type: "stream-start", warnings: [] });
          controller.enqueue({ type: "text-start", id: "answer" });
          controller.enqueue({
            type: "text-delta",
            id: "answer",
            delta: "Working",
          });
          abortSignal?.addEventListener(
            "abort",
            () => controller.error(abortSignal.reason),
            { once: true },
          );
        },
      }),
    }),
  });
  await assert.rejects(
    runAgent(
      config,
      [{ role: "user", content: "Start" }],
      abort.signal,
      (event) => {
        if (event.type === "text") abort.abort();
      },
      async () => false,
      { model },
    ),
    { name: "AbortError" },
  );
  // Node's test runner also fails on any unhandled rejection after this settles.
  await new Promise((resolve) => setTimeout(resolve, 30));
});
test("provider errors are surfaced without orphaned response promises", async () => {
  const model = new MockLanguageModelV4({
    doStream: async () => ({
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue({
            type: "error",
            error: new Error("Provider disconnected"),
          });
          controller.close();
        },
      }),
    }),
  });
  await assert.rejects(
    runAgent(
      config,
      [{ role: "user", content: "Hello" }],
      new AbortController().signal,
      () => {},
      async () => false,
      { model },
    ),
    /Provider disconnected/,
  );
});
test("streams an answer and returns replayable model history and usage", async () => {
  const model = new MockLanguageModelV4({
    doStream: async ({ tools }) => {
      assert.equal(
        tools?.length ?? 0,
        0,
        "disabled tools must not expose web or desktop capabilities",
      );
      return {
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({ type: "stream-start", warnings: [] });
            controller.enqueue({ type: "text-start", id: "answer" });
            controller.enqueue({
              type: "text-delta",
              id: "answer",
              delta: "Hello",
            });
            controller.enqueue({ type: "text-end", id: "answer" });
            controller.enqueue({
              type: "finish",
              finishReason: { unified: "stop", raw: "stop" },
              usage: {
                inputTokens: {
                  total: 12,
                  noCache: 12,
                  cacheRead: 0,
                  cacheWrite: 0,
                },
                outputTokens: { total: 2, text: 2, reasoning: 0 },
              },
            });
            controller.close();
          },
        }),
      };
    },
  });
  const events: HarnessEvent[] = [];
  const history = await runAgent(
    config,
    [{ role: "user", content: "Hello" }],
    new AbortController().signal,
    (event) => events.push(event),
    async () => false,
    { model },
  );
  assert.equal(history.length, 2);
  assert.equal(history[1].role, "assistant");
  assert.deepEqual(
    events.find((event) => event.type === "usage"),
    { type: "usage", inputTokens: 12, outputTokens: 2, steps: 1 },
  );
});
test("real tool loop writes an artifact, receives its result, and continues answering", async () => {
  const files = new Map<string, string>();
  const abort = new AbortController();
  const model = new MockLanguageModelV4({
    doStream: async () => ({
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue({ type: "stream-start", warnings: [] });
          if (model.doStreamCalls.length === 1) {
            controller.enqueue({
              type: "tool-call",
              toolCallId: "write-1",
              toolName: "filesystem",
              input: JSON.stringify({
                action: "write",
                path: "/home/guest/demo.html",
                content: "<button>Real artifact</button>",
              }),
            });
          } else {
            controller.enqueue({ type: "text-start", id: "answer" });
            controller.enqueue({
              type: "text-delta",
              id: "answer",
              delta: "Saved your app.",
            });
            controller.enqueue({ type: "text-end", id: "answer" });
          }
          controller.enqueue({
            type: "finish",
            finishReason: {
              unified: model.doStreamCalls.length === 1 ? "tool-calls" : "stop",
              raw: "stop",
            },
            usage: {
              inputTokens: {
                total: 10,
                noCache: 10,
                cacheRead: 0,
                cacheWrite: 0,
              },
              outputTokens: { total: 10, text: 10, reasoning: 0 },
            },
          });
          controller.close();
        },
      }),
    }),
  });
  const events: HarnessEvent[] = [];
  const result = await runAgent(
    { ...config, tools: true },
    [{ role: "user", content: "Create a local app" }],
    abort.signal,
    (event) => events.push(event),
    async () => true,
    {
      model,
      dependencies: {
        fs: {
          normalize: (path) => path,
          ls: async () => [],
          search: async () => [],
          exists: async (path) => files.has(path),
          read: async (path) => files.get(path) ?? "",
          mkdir: async () => {},
          writeBlob: async (path, blob, options) => {
            assert.equal(options?.overwrite, false);
            files.set(path, await blob.text());
          },
          write: async (path, content) => {
            files.set(path, content);
          },
        },
        signal: abort.signal,
        approve: async () => {
          throw new Error("New files should not ask to overwrite");
        },
        refresh: () => {},
        command: async () => ({ ok: true }),
      },
    },
  );
  assert.equal(
    files.get("/home/guest/demo.html"),
    "<button>Real artifact</button>",
  );
  assert.equal(model.doStreamCalls.length, 2);
  assert.ok(
    result.some((message) => message.role === "tool"),
    JSON.stringify(result),
  );
  assert.ok(
    events.some(
      (event) => event.type === "text" && event.text === "Saved your app.",
    ),
  );
  assert.ok(
    JSON.stringify(model.doStreamCalls[1].prompt).includes('"created":true'),
  );
});
test("bounded tool loop reports an unfinished turn at its step limit", async () => {
  const model = new MockLanguageModelV4({
    doStream: async () => ({
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue({ type: "stream-start", warnings: [] });
          controller.enqueue({
            type: "tool-call",
            toolCallId: `inspect-${model.doStreamCalls.length}`,
            toolName: "desktop",
            input: JSON.stringify({ argv: ["version"] }),
          });
          controller.enqueue({
            type: "finish",
            finishReason: { unified: "tool-calls", raw: "tool_calls" },
            usage: {
              inputTokens: {
                total: 1,
                noCache: 1,
                cacheRead: 0,
                cacheWrite: 0,
              },
              outputTokens: { total: 1, text: 1, reasoning: 0 },
            },
          });
          controller.close();
        },
      }),
    }),
  });
  const events: HarnessEvent[] = [];
  await runAgent(
    { ...config, tools: true },
    [{ role: "user", content: "Inspect desktop version" }],
    new AbortController().signal,
    (event) => events.push(event),
    async () => false,
    { model },
  );
  assert.equal(model.doStreamCalls.length, 12);
  assert.ok(
    events.some(
      (event) =>
        event.type === "notice" && event.text.includes("12-step limit"),
    ),
  );
});
