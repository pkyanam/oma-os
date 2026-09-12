import test from "node:test";
import assert from "node:assert/strict";
import { fitConversation } from "./context-budget";
import type { ModelMessage } from "ai";
test("context trimming drops complete turns rather than orphaning tool calls", () => {
  const messages: ModelMessage[] = [
    { role: "user", content: "a".repeat(100) },
    {
      role: "assistant",
      content: [
        {
          type: "tool-call",
          toolCallId: "1",
          toolName: "filesystem",
          input: {},
        },
      ],
    },
    {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: "1",
          toolName: "filesystem",
          output: { type: "text", value: "result" },
        },
      ],
    },
    { role: "user", content: "Current task" },
  ];
  const result = fitConversation(messages, 100);
  assert.equal(result.omitted, 3);
  assert.deepEqual(result.messages, [messages[3]]);
});
test("latest user input is never silently truncated", () => {
  const messages: ModelMessage[] = [
    { role: "user", content: "a".repeat(1000) },
  ];
  assert.deepEqual(fitConversation(messages, 100), { messages, omitted: 0 });
});
