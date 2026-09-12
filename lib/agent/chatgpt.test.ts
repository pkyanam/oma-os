import test from "node:test";
import assert from "node:assert/strict";
import { createChatGPTProxyProvider } from "@opencoredev/loginwithchatgpt-ai";
import { runAgent } from "./harness";

test("ChatGPT sends full stateless assistant and encrypted reasoning history instead of discarded item references", async () => {
  let request: Record<string, unknown> | undefined;
  const model = createChatGPTProxyProvider({
    fetch: async (_input, init) => {
      request = JSON.parse(String(init?.body));
      return Response.json(
        { error: { message: "fixture captured", type: "fixture" } },
        { status: 400 },
      );
    },
  })("gpt-5.6-luna");
  await assert.rejects(
    runAgent(
      {
        mode: "chatgpt",
        model: "gpt-5.6-luna",
        baseURL: "",
        apiKey: "",
        tools: false,
      },
      [
        { role: "user", content: "Remember my project name." },
        {
          role: "assistant",
          content: [
            {
              type: "reasoning",
              text: "Remember the name",
              providerOptions: {
                openai: {
                  itemId: "rs_fixture",
                  reasoningEncryptedContent: "opaque-fixture",
                },
              },
            },
            {
              type: "text",
              text: "Your project is oma.os.",
              providerOptions: { openai: { itemId: "msg_fixture" } },
            },
          ],
        },
        { role: "user", content: "What is its name?" },
      ],
      new AbortController().signal,
      () => {},
      async () => false,
      { model },
    ),
    /fixture captured/,
  );
  assert.equal(request?.store, false);
  const input = request?.input as Array<Record<string, unknown>>;
  assert.equal(
    input.some((item) => item.type === "item_reference"),
    false,
  );
  assert.equal(
    input.some(
      (item) =>
        item.role === "assistant" &&
        JSON.stringify(item.content).includes("Your project is oma.os."),
    ),
    true,
  );
  assert.equal(
    input.some(
      (item) =>
        item.type === "reasoning" &&
        item.encrypted_content === "opaque-fixture",
    ),
    true,
  );
});
