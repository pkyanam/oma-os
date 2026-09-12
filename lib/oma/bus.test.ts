import { test } from "node:test";
import assert from "node:assert/strict";
import { oma, type BusContext } from "./bus";
function context() {
  const calls: unknown[] = [];
  const state = {
    workspace: 1,
    workspaces: { 1: { focus: "term-1" } },
    dirty: {},
    notify: (...args: unknown[]) => calls.push(["notify", ...args]),
    gotoWs: (...args: unknown[]) => calls.push(["ws", ...args]),
    launch: (...args: unknown[]) => calls.push(["launch", ...args]),
    focusDir: (...args: unknown[]) => calls.push(["focus", ...args]),
    closeTile: (...args: unknown[]) => calls.push(["close", ...args]),
    refreshFs: () => calls.push(["refresh"]),
  };
  const ctx = {
    store: { getState: () => state },
    fs: {
      ls: async () => [{ name: "Projects", kind: "directory" }],
      read: async () => "content",
      write: async (...args: unknown[]) => calls.push(["write", ...args]),
    },
  } as unknown as BusContext;
  return { ctx, calls };
}
test("version is stable", async () =>
  assert.deepEqual(await oma(["version"], context().ctx), {
    ok: true,
    message: "oma.os 0.1.0",
    data: undefined,
  }));
test("invalid workspace cannot mutate state", async () => {
  const { ctx, calls } = context();
  for (const n of ["0", "10", "1.5", "2x"])
    assert.equal((await oma(["ws", n], ctx)).ok, false);
  assert.deepEqual(calls, []);
});
test("valid workspace is routed", async () => {
  const { ctx, calls } = context();
  await oma(["ws", "9"], ctx);
  assert.deepEqual(calls, [["ws", 9]]);
});
test("prototype keys are not applications", async () =>
  assert.equal((await oma(["launch", "toString"], context().ctx)).ok, false));
test("reset requires an explicit flag", async () =>
  assert.equal((await oma(["reset"], context().ctx)).ok, false));
test("filesystem writes use stdin without losing newlines", async () => {
  const { ctx, calls } = context();
  ctx.stdin = "hello\nworld";
  await oma(["fs", "write", "/home/guest/test"], ctx);
  assert.deepEqual(calls, [
    ["write", "/home/guest/test", "hello\nworld"],
    ["refresh"],
  ]);
});
test("filesystem failures are reported", async () => {
  const { ctx } = context();
  ctx.fs.read = async () => {
    throw new Error("denied");
  };
  assert.deepEqual(await oma(["fs", "read", "test"], ctx), {
    ok: false,
    message: "denied",
  });
});
test("unknown theme does not mutate state", async () => {
  const { ctx, calls } = context();
  assert.equal((await oma(["theme", "set", "nord"], ctx)).ok, false);
  assert.deepEqual(calls, []);
});
