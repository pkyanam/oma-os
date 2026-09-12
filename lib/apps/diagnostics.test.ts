import test from "node:test";
import assert from "node:assert/strict";
import { describeModel, probeJSON } from "./diagnostics";
test("unconfigured agent is an informational state, separate from an error", () => {
  const row = describeModel({
    mode: "direct",
    model: "",
    authenticated: false,
    status: "offline",
  });
  assert.equal(row.status, "info");
  assert.match(row.value, /Desktop ready/);
  assert.equal(
    describeModel({
      mode: "chatgpt",
      model: "model",
      authenticated: false,
      status: "err",
    }).status,
    "error",
  );
});
test("model diagnostics project only public configuration fields", () => {
  const input = {
    mode: "direct" as const,
    model: "model",
    authenticated: false,
    status: "idle" as const,
    apiKey: "never-print-this",
    token: "also-secret",
  };
  assert.equal(describeModel(input).status, "ok");
  assert.ok(!JSON.stringify(describeModel(input)).includes("never-print-this"));
  assert.ok(!JSON.stringify(describeModel(input)).includes("also-secret"));
});
test("read-only endpoint probes distinguish server refusal, network failure and success", async () => {
  const ok = await probeJSON(
    "/health",
    async () => new Response('{"ok":true}'),
  );
  assert.equal(ok.ok, true);
  assert.equal(ok.data.ok, true);
  const denied = await probeJSON(
    "/health",
    async () => new Response("denied", { status: 403 }),
  );
  assert.equal(denied.status, 403);
  assert.equal(denied.ok, false);
  const unavailable = await probeJSON("/health", async () => {
    throw new Error("network");
  });
  assert.equal(unavailable.status, null);
  assert.equal(unavailable.ok, false);
});
