import test from "node:test";
import assert from "node:assert/strict";
import { normalizeModelError } from "../src/auth-errors";
test("model error adapter preserves status/retry metadata and redacts provider secrets", async () => {
  const response = await normalizeModelError(
    Response.json(
      {
        error: { message: "Limit for Bearer fixture-token sk-fixture-secret" },
      },
      { status: 429, headers: { "retry-after": "60" } },
    ),
  );
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "60");
  const body = await response.json();
  assert.match(body.error.message, /Limit/);
  assert.doesNotMatch(body.error.message, /fixture-token|sk-fixture-secret/);
});
test("successful SSE is passed through without reading or buffering", async () => {
  const response = new Response("data: fixture\n\n", {
    headers: { "content-type": "text/event-stream" },
  });
  assert.equal(await normalizeModelError(response), response);
  assert.equal(response.bodyUsed, false);
});
