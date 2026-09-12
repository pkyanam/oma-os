import { test } from "node:test";
import assert from "node:assert/strict";
import { BrowserInputQueue, BrowserInput } from "./input-queue";
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
test("input queue coalesces pointer movement while preserving click and key ordering", async () => {
  const seen: BrowserInput[] = [];
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queue = new BrowserInputQueue(async (input) => {
    seen.push(input);
    if (seen.length === 1) await pending;
  });
  queue.enqueue({ sessionId: "a", action: "pointer", phase: "down", x: 1 });
  for (let i = 0; i < 100; i++)
    queue.enqueue({ sessionId: "a", action: "pointer", phase: "move", x: i });
  queue.enqueue({ sessionId: "a", action: "pointer", phase: "up", x: 99 });
  queue.enqueue({ sessionId: "a", action: "key", key: "Enter" });
  release();
  await tick();
  assert.equal(seen.length, 4);
  assert.equal(seen[1].x, 99);
  assert.equal(seen[2].phase, "up");
  assert.equal(seen[3].key, "Enter");
});
test("typing and wheel events retain data when coalesced behind navigation", async () => {
  const seen: BrowserInput[] = [];
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queue = new BrowserInputQueue(async (input) => {
    seen.push(input);
    if (seen.length === 1) await pending;
  });
  queue.enqueue({ sessionId: "a", action: "navigate" });
  queue.enqueue({ sessionId: "a", action: "type", text: "hello " });
  queue.enqueue({ sessionId: "a", action: "type", text: "world" });
  queue.enqueue({ sessionId: "a", action: "scroll", deltaY: 25 });
  queue.enqueue({ sessionId: "a", action: "scroll", deltaY: 30 });
  release();
  await tick();
  assert.equal(seen.length, 3);
  assert.equal(seen[1].text, "hello world");
  assert.equal(seen[2].deltaY, 55);
});
test("clearing a session discards pending input instead of replaying it into a replacement", async () => {
  const seen: BrowserInput[] = [];
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queue = new BrowserInputQueue(async (input) => {
    seen.push(input);
    if (input.sessionId === "old") await pending;
  });
  queue.enqueue({ sessionId: "old", action: "navigate" });
  queue.enqueue({ sessionId: "old", action: "type", text: "discard" });
  queue.clear();
  queue.enqueue({ sessionId: "new", action: "type", text: "keep" });
  release();
  await tick();
  assert.equal(seen.length, 2);
  assert.equal(seen[1].text, "keep");
});
