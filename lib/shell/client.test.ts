import test from "node:test";
import assert from "node:assert/strict";
import { createShellSession, desktopCommand } from "./client";
import { normalize } from "@/lib/fs/opfs";
import type { BusContext } from "@/lib/oma/bus";
function fixture() {
  const calls: unknown[] = [];
  const tiles: Record<string, { app: string }> = {
    "origin-terminal": { app: "term" },
    "other-window": { app: "editor" },
  };
  const state = {
    workspace: 1,
    workspaces: { 1: { focus: "other-window" } },
    tiles,
    dirty: {} as Record<string, boolean>,
    refreshFs() {},
    launch: (...args: unknown[]) => calls.push(["launch", ...args]),
    closeTile: (id: string) => {
      calls.push(["close", id]);
      delete tiles[id];
    },
  };
  const ctx = {
    tileId: "origin-terminal",
    store: { getState: () => state },
    fs: {
      normalize,
      read: async () => "hello",
      exists: async (path: string) => path.endsWith("picture.png"),
      stat: async (path: string) => ({
        path,
        name: path.split("/").pop(),
        kind: "file",
      }),
    },
  } as unknown as BusContext;
  return { ctx, calls, state };
}
for (const name of ["exit", "quit", "close", "oma close"])
  test(`${name} closes its originating terminal without creating a worker`, async () => {
    const { ctx, calls, state } = fixture();
    const session = createShellSession(ctx);
    const result = await session.execute(name);
    assert.equal(result.exitCode, 0);
    assert.deepEqual(calls, [["close", "origin-terminal"]]);
    assert.equal(state.tiles["origin-terminal"], undefined);
    assert.ok(state.tiles["other-window"]);
    session.dispose();
  });
test("worker command bridge closes the originating tile and respects a blocked close", async () => {
  const { ctx, calls, state } = fixture();
  state.dirty["origin-terminal"] = true;
  assert.equal(
    (await desktopCommand(ctx, "close", [], "/home/guest", "")).exitCode,
    1,
  );
  assert.deepEqual(calls, []);
  state.dirty["origin-terminal"] = false;
  assert.equal(
    (await desktopCommand(ctx, "quit", [], "/home/guest", "")).exitCode,
    0,
  );
  assert.deepEqual(calls, [["close", "origin-terminal"]]);
});
test("open sends files to their app and URLs to the internal browser", async () => {
  const { ctx, calls } = fixture();
  assert.equal(
    (
      await desktopCommand(
        ctx,
        "open",
        ["picture.png"],
        "/home/guest/Photos",
        "",
      )
    ).exitCode,
    0,
  );
  assert.deepEqual(calls[0], [
    "launch",
    "media",
    "/home/guest/Photos/picture.png",
  ]);
  assert.equal(
    (
      await desktopCommand(
        ctx,
        "open",
        ["https://example.com"],
        "/home/guest",
        "",
      )
    ).exitCode,
    0,
  );
  assert.deepEqual(calls[1], ["launch", "browser", "https://example.com/"]);
});

test("worker construction failure settles and a later attempt can retry", async () => {
  const prior = globalThis.Worker;
  try {
    globalThis.Worker = class {
      constructor() {
        throw new Error("blocked");
      }
    } as unknown as typeof Worker;
    const session = createShellSession(fixture().ctx);
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await session.execute("echo hello");
      assert.equal(result.exitCode, 1);
      assert.match(result.stderr, /could not start/);
    }
    session.dispose();
  } finally {
    globalThis.Worker = prior;
  }
});

test("worker transport failures and cancellation settle all pending work and allow replacement", async () => {
  const prior = globalThis.Worker;
  const workers: FakeWorker[] = [];
  class FakeWorker {
    onmessage: ((event: { data: unknown }) => void) | null = null;
    onerror: (() => void) | null = null;
    onmessageerror: (() => void) | null = null;
    terminated = false;
    failSend = false;
    constructor() {
      workers.push(this);
    }
    postMessage() {
      if (this.failSend) throw new Error("disconnected");
    }
    terminate() {
      this.terminated = true;
    }
  }
  try {
    globalThis.Worker = FakeWorker as unknown as typeof Worker;
    const session = createShellSession(fixture().ctx);
    const first = session.execute("echo first");
    workers[0].onmessageerror?.();
    assert.equal((await first).exitCode, 1);
    assert.equal(workers[0].terminated, true);
    const second = session.execute("echo second");
    // An error queued by the previous worker must not kill the replacement.
    workers[0].onerror?.();
    assert.equal(workers[1].terminated, false);
    session.cancel();
    assert.equal((await second).exitCode, 130);
    const third = session.execute("echo third");
    workers[2].onmessage?.({
      data: {
        type: "result",
        result: {
          stdout: "third",
          stderr: "",
          exitCode: 0,
          cwd: "/home/guest",
        },
      },
    });
    assert.equal((await third).stdout, "third");
    workers[2].failSend = true;
    assert.equal((await session.execute("echo disconnected")).exitCode, 1);
    const fourth = session.execute("echo disposed");
    session.dispose();
    assert.equal((await fourth).exitCode, 130);
  } finally {
    globalThis.Worker = prior;
  }
});
