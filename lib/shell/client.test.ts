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
