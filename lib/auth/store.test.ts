import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  FileStore,
  RedisStore,
  redisCommand,
  type RedisCommand,
} from "./store";
import { authLockContext } from "./lock-context";
import { redisSessionLock } from "./session-lock";

test("file store isolates hashed keys, expires reads and preserves atomic replacement", async () => {
  const directory = await mkdtemp(join(tmpdir(), "oma-auth-test-"));
  try {
    const store = new FileStore<{ account: string }>(directory);
    await store.set("../a", { account: "a" });
    await store.set("b", { account: "b" });
    assert.deepEqual(await store.get("../a"), { account: "a" });
    assert.deepEqual(await store.get("b"), { account: "b" });
    const files = await readdir(directory);
    assert.equal(files.length, 2);
    assert.ok(files.every((path) => /^[a-f0-9]{64}\.json$/.test(path)));
    assert.equal((await stat(join(directory, files[0]))).mode & 0o777, 0o600);
    await store.set("expired", { account: "old" }, { ttlMs: -1 });
    assert.equal(await store.get("expired"), undefined);
    await store.set("expired", { account: "new" });
    assert.deepEqual(await store.get("expired"), { account: "new" });
    await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        store.set("race", { account: String(i) }),
      ),
    );
    assert.match((await store.get("race"))!.account, /^\d+$/);
    assert.equal(
      (await readdir(directory)).filter((name) => !name.endsWith(".json"))
        .length,
      0,
    );
    await store.delete("../a");
    assert.equal(await store.get("../a"), undefined);
    assert.deepEqual(await store.get("b"), { account: "b" });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

// Tiny deterministic Redis command model. Production Lua syntax requires the opt-in live Redis smoke test; this fake
// validates the surrounding ownership and concurrency logic only.
function redisFixture() {
  const values = new Map<string, string>();
  const calls: Array<(string | number)[]> = [];
  const command: RedisCommand = async (args) => {
    calls.push(args);
    const [op, ...rest] = args;
    if (op === "GET") return values.get(String(rest[0])) ?? null;
    if (op === "SET") {
      if (rest.includes("NX") && values.has(String(rest[0]))) return null;
      values.set(String(rest[0]), String(rest[1]));
      return "OK";
    }
    if (op === "DEL") return Number(values.delete(String(rest[0])));
    if (op === "EVAL") {
      const script = String(rest[0]),
        num = Number(rest[1]),
        keys = rest.slice(2, 2 + num).map(String),
        argv = rest.slice(2 + num).map(String);
      if (values.get(keys[0]) !== argv[0]) return 0;
      if (script.includes("PEXPIRE")) return 1;
      if (num === 2) {
        if (script.includes("'SET'")) values.set(keys[1], argv[1]);
        else values.delete(keys[1]);
        return 1;
      }
      return Number(values.delete(keys[0]));
    }
    throw new Error("Unknown fixture command");
  };
  return { values, calls, command };
}

test("distributed locks serialize instances but allow different users and isolate namespaces", async () => {
  const f = redisFixture();
  const first = redisSessionLock(f.command, {
      namespace: "project-a:",
      pollMs: 1,
    }),
    second = redisSessionLock(f.command, {
      namespace: "project-a:",
      pollMs: 1,
    });
  let active = 0,
    max = 0;
  const work = async () => {
    active++;
    max = Math.max(max, active);
    await new Promise((r) => setTimeout(r, 5));
    active--;
  };
  await Promise.all([first.run("same", work), second.run("same", work)]);
  assert.equal(max, 1);
  max = 0;
  await Promise.all([first.run("a", work), second.run("b", work)]);
  assert.equal(max, 2);
  assert.ok(
    f.calls
      .filter((c) => c[0] === "SET")
      .every((c) => String(c[1]).startsWith("project-a:lock:")),
  );
  assert.equal(f.values.size, 0);
});

test("lease loss fences session writes/deletes and cannot release a newer owner lock", async () => {
  const f = redisFixture(),
    lock = redisSessionLock(f.command, {
      namespace: "project:",
      leaseMs: 1000,
    });
  const store = new RedisStore<{ value: string }>(
    "https://redis.test",
    "test",
    "project:session:",
    f.command,
  );
  await lock.run("session", async () => {
    const context = authLockContext.getStore()!;
    await store.set("session", { value: "valid" }, { ttlMs: 5000 });
    f.values.set(context.key, "new-owner");
    await assert.rejects(
      () => store.set("session", { value: "stale" }),
      /lease expired/,
    );
    await assert.rejects(() => store.delete("session"), /lease expired/);
    assert.equal(
      f.values.get("project:session:session"),
      JSON.stringify({ value: "valid" }),
    );
  });
  assert.equal(
    [...f.values].find(([key]) => key.startsWith("project:lock:"))?.[1],
    "new-owner",
  );
});

test("lock wait is bounded and Redis transport rejects redirects and leaks no server error details", async () => {
  const lock = redisSessionLock(async () => null, { waitMs: 2, pollMs: 1 });
  await assert.rejects(() => lock.run("busy", async () => {}), /busy/);
  let init: RequestInit | undefined;
  const command = redisCommand(
    "https://redis.test",
    "test-only-token",
    async (_input, options) => {
      init = options;
      return Response.json({ error: "private backend credentials diagnostic" });
    },
  );
  await assert.rejects(
    () => command(["GET", "project:test"]),
    /^Error: Session store operation failed$/,
  );
  assert.equal(init?.redirect, "error");
  assert.equal(init?.cache, "no-store");
  assert.ok(init?.signal);
  assert.throws(() => redisCommand("http://redis.test", "test"), /HTTPS/);
});

test("lease renewal extends active ownership and aborts work after ownership loss", async () => {
  const f = redisFixture();
  const lock = redisSessionLock(f.command, {
    namespace: "renew:",
    leaseMs: 30,
  });
  await lock.run("session", async () => {
    await new Promise((r) => setTimeout(r, 35));
  });
  assert.ok(
    f.calls.some((c) => c[0] === "EVAL" && String(c[1]).includes("PEXPIRE")),
  );
  await assert.rejects(
    () =>
      lock.run("session", async () => {
        const ctx = authLockContext.getStore()!;
        f.values.set(ctx.key, "replacement");
        await new Promise<void>((resolve) =>
          ctx.signal.addEventListener("abort", () => resolve(), { once: true }),
        );
      }),
    /lease expired/,
  );
});
