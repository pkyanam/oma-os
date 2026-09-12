import test from "node:test";
import assert from "node:assert/strict";
import { publicPreferences, providerURL } from "./settings";
test("preferences never persist or rehydrate keys and authentication claims", () => {
  assert.deepEqual(
    publicPreferences({
      mode: "direct",
      baseURL: "https://provider.example/v1/",
      model: "model-id",
      tools: false,
      apiKey: "secret",
      authenticated: true,
    }),
    {
      mode: "direct",
      baseURL: "https://provider.example/v1",
      model: "model-id",
      tools: false,
    },
  );
});
test("rejects credential-bearing endpoints and malformed stored preferences", () => {
  assert.deepEqual(
    publicPreferences({
      mode: "invalid",
      baseURL: "https://user:secret@example.com",
      model: {},
      tools: "yes",
    }),
    {},
  );
  assert.throws(() =>
    providerURL("https://provider.example/v1?api_key=secret"),
  );
  assert.throws(() => providerURL("http://provider.example/v1"));
  assert.equal(
    providerURL("http://localhost:11434/v1"),
    "http://localhost:11434/v1",
  );
});

test("switching connections retains each model, including a rehydrated selection", async () => {
  const { useAgentConfig, selectAgentMode, selectAgentModel } =
    await import("./settings");
  useAgentConfig.setState({
    mode: "chatgpt",
    model: "gpt-5.6-luna",
    modelsByMode: {},
  });
  selectAgentMode("direct");
  selectAgentModel("provider-model");
  selectAgentMode("workers-ai", "hosted-model");
  selectAgentMode("chatgpt");
  assert.equal(useAgentConfig.getState().model, "gpt-5.6-luna");
  selectAgentMode("direct");
  assert.equal(useAgentConfig.getState().model, "provider-model");
  const preferences = publicPreferences(useAgentConfig.getState());
  assert.equal(preferences.modelsByMode?.chatgpt, "gpt-5.6-luna");
  assert.equal("apiKey" in preferences, false);
});
