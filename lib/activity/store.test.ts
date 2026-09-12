import test from "node:test";
import assert from "node:assert/strict";
import {
  ACTIVITY_LIMIT,
  createActivityStore,
  exportActivity,
  safeActivity,
} from "./store";
import { desktopActivityChanges } from "./tracker";
import type { useDesktop } from "@/lib/state/store";

test("session activity drops oldest records at the cap and exports in chronological order", () => {
  let time = 1000;
  const store = createActivityStore(() => time++);
  for (let i = 0; i < ACTIVITY_LIMIT + 7; i++)
    store.record({ kind: "filesystem-updated" });
  const snapshot = store.getSnapshot();
  assert.equal(snapshot.events.length, ACTIVITY_LIMIT);
  assert.equal(snapshot.discarded, 7);
  assert.equal(snapshot.events[0].id, 8);
  assert.ok(snapshot.events[0].time < snapshot.events.at(-1)!.time);
  const result = JSON.parse(exportActivity(snapshot));
  assert.equal(result.events.length, ACTIVITY_LIMIT);
  assert.equal(result.format, "oma-session-activity");
});
test("recording and export omit prompts, paths, keys, content and unknown app values", () => {
  const store = createActivityStore(() => 1000);
  store.record({
    kind: "app-opened",
    app: "notes",
    workspace: 2,
    prompt: "private prompt",
    apiKey: "private key",
    path: "/secret.txt",
    content: "private contents",
    title: "private title",
  });
  store.record({
    kind: "filesystem-updated",
    app: "notes",
    path: "/secret.txt",
    count: 123,
  });
  store.record({ kind: "app-opened", app: "secret-value" });
  const output = exportActivity(store.getSnapshot());
  assert.doesNotMatch(
    output,
    /private|secret|apiKey|prompt|content|path|title/,
  );
  assert.equal(store.getSnapshot().events[1].app, undefined);
  assert.equal(store.getSnapshot().events[1].count, undefined);
  assert.equal(store.getSnapshot().events[2].app, undefined);
});
test("unknown event kinds and invalid workspace metadata are rejected", () => {
  assert.equal(safeActivity({ kind: "provider-key", apiKey: "key" }), null);
  assert.equal(
    safeActivity({
      kind: "workspace-changed",
      workspace: 10,
      fromWorkspace: "secret",
    })?.workspace,
    undefined,
  );
  assert.equal(
    safeActivity({ kind: "app-opened", app: "toString" })?.app,
    undefined,
  );
});
test("clear resets visible history and notifies subscribers without persisting data", () => {
  const store = createActivityStore(() => 1000);
  let calls = 0;
  const stop = store.subscribe(() => calls++);
  store.record({ kind: "app-opened", app: "term", workspace: 1 });
  store.clear();
  assert.equal(calls, 2);
  assert.equal(store.getSnapshot().events.length, 0);
  stop();
  store.record({ kind: "filesystem-updated" });
  assert.equal(calls, 2);
});
test("desktop observer records actual state changes without leaking tile titles or file paths", () => {
  type State = ReturnType<typeof useDesktop.getState>;
  const before = {
    ready: true,
    tiles: { t: { app: "term", title: "private title" } },
    workspace: 1,
    workspaces: {
      1: { focus: "t", layout: { type: "leaf", id: "t" } },
      2: { focus: null, layout: null },
    },
    fsVersion: 0,
  } as unknown as State;
  const after = {
    ...before,
    tiles: {
      ...before.tiles,
      n: { app: "notes", title: "secret title", path: "/private.md" },
    },
    workspace: 2,
    workspaces: {
      ...before.workspaces,
      2: { focus: "n", layout: { type: "leaf", id: "n" } },
    },
    fsVersion: 1,
  } as unknown as State;
  const store = createActivityStore(() => 1000);
  desktopActivityChanges(after, before, store.record);
  assert.deepEqual(
    store.getSnapshot().events.map((event) => event.kind),
    ["app-opened", "workspace-changed", "window-focused", "filesystem-updated"],
  );
  assert.doesNotMatch(
    exportActivity(store.getSnapshot()),
    /private|secret|title|path/,
  );
  const count = store.getSnapshot().events.length;
  desktopActivityChanges(after, after, store.record);
  assert.equal(store.getSnapshot().events.length, count);
});
