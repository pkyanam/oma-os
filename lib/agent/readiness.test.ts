import test from "node:test";
import assert from "node:assert/strict";
import { modelConnectionIssue } from "./readiness";
import { describeModel } from "../apps/diagnostics";
const config = { model: "selected-model", baseURL: "", apiKey: "", tools: true, authenticated: false };
test("Workers AI is ready without a ChatGPT account or a provider key", () => {
  assert.equal(modelConnectionIssue({ ...config, mode: "workers-ai" }), null);
  assert.equal(describeModel({ ...config, mode: "workers-ai", status: "idle" }).status, "ok");
});
test("each missing connection requirement gets a specific actionable explanation", () => {
  assert.match(modelConnectionIssue({ ...config, mode: "workers-ai", model: " " })!, /Choose a model/);
  assert.match(modelConnectionIssue({ ...config, mode: "chatgpt" })!, /Sign in to ChatGPT/);
  assert.match(modelConnectionIssue({ ...config, mode: "direct" })!, /provider key/);
  assert.equal(modelConnectionIssue({ ...config, mode: "chatgpt", authenticated: true }), null);
  assert.equal(modelConnectionIssue({ ...config, mode: "direct", apiKey: "fixture-key" }), null);
});
