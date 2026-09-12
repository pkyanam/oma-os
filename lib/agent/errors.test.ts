import test from "node:test";
import assert from "node:assert/strict";
import { agentErrorText } from "./errors";
test("blank SDK error exposes ChatGPT HTML rejection without showing HTML", () => {
  const error = Object.assign(new Error(""), {
    statusCode: 403,
    responseBody: JSON.stringify({
      error: "responses_request_failed",
      status: 403,
      detail: "<html><head>blocked</head></html>",
    }),
  });
  assert.match(agentErrorText(error, "chatgpt"), /OpenAI rejected.*HTTP 403/);
  assert.doesNotMatch(agentErrorText(error, "chatgpt"), /<html>/);
});
test("extracts nested upstream error while retaining status and never rendering blank", () => {
  const error = Object.assign(new Error(""), {
    statusCode: 400,
    responseBody: JSON.stringify({
      detail: JSON.stringify({ error: { message: "Unsupported tool schema" } }),
    }),
  });
  assert.equal(agentErrorText(error), "HTTP 400: Unsupported tool schema");
  for (const value of [new Error(""), undefined, null, {}, "   "])
    assert.match(agentErrorText(value), /request failed/);
  assert.match(agentErrorText({ statusCode: 401 }, "chatgpt"), /sign in again/);
  assert.doesNotMatch(
    agentErrorText(new Error("Bearer abcsecret sk-secrettest")),
    /abcsecret|sk-secrettest/,
  );
});
