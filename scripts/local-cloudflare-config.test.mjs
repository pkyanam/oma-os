import test from "node:test";
import assert from "node:assert/strict";
import { disableUnrequestedRemoteAI } from "./local-cloudflare-config.mjs";
test("development removes remote AI unless explicitly opted in, retaining local auth and quota bindings", () => {
  for (const option of [undefined, "", "0", "true"]) {
    const config = {
      ai: { binding: "AI" },
      durable_objects: {
        bindings: [{ name: "AUTH_SESSIONS" }, { name: "AI_QUOTA" }],
      },
    };
    disableUnrequestedRemoteAI(config, option);
    assert.equal("ai" in config, false);
    assert.equal(config.durable_objects.bindings.length, 2);
  }
  const opted = { ai: { binding: "AI" } };
  disableUnrequestedRemoteAI(opted, "1");
  assert.deepEqual(opted, { ai: { binding: "AI" } });
});
