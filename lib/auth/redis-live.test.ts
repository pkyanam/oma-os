import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { RedisStore, redisCommand } from "./store";
import { redisSessionLock } from "./session-lock";
import { authLockContext } from "./lock-context";
// Explicit opt-in. Touches random temporary keys only; never scans or flushes.
test(
  "live Redis lease and fenced writes isolate sessions and reject an expired owner",
  { skip: process.env.OMA_AUTH_TEST_REDIS !== "1" },
  async () => {
    const url =
      process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
    const token =
      process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
    assert.ok(url && token, "Redis REST configuration required");
    const namespace =
      (process.env.OMA_AUTH_NAMESPACE || "oma-os:") +
      "verify:" +
      randomUUID() +
      ":";
    const command = redisCommand(url, token),
      store = new RedisStore<{ account: string }>(
        url,
        token,
        namespace + "session:",
        command,
      );
    const lock = redisSessionLock(command, { namespace, leaseMs: 10000 });
    const keys = new Set<string>([
      namespace + "session:a",
      namespace + "session:b",
    ]);
    try {
      await Promise.all(
        ["a", "b"].map((id) =>
          lock.run(id, async () => {
            keys.add(authLockContext.getStore()!.key);
            await store.set(id, { account: id }, { ttlMs: 60000 });
            assert.deepEqual(await store.get(id), { account: id });
          }),
        ),
      );
      await lock.run("a", async () => {
        const context = authLockContext.getStore()!;
        keys.add(context.key);
        await command(["SET", context.key, "new-owner", "PX", 60000]);
        await assert.rejects(
          () => store.set("a", { account: "wrong" }),
          /lease expired/,
        );
        await assert.rejects(() => store.delete("a"), /lease expired/);
      });
      assert.deepEqual(await store.get("a"), { account: "a" });
      assert.deepEqual(await store.get("b"), { account: "b" });
      await lock.run("b", () => store.delete("b"));
      assert.equal(await store.get("b"), undefined);
      assert.deepEqual(await store.get("a"), { account: "a" });
    } finally {
      for (const key of keys) await command(["DEL", key]);
    }
  },
);
