import test from "node:test";
import assert from "node:assert/strict";
import { executeAgentShell } from "./shell-client";
class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  terminated = false;
  posted: unknown;
  constructor() {
    FakeWorker.instances.push(this);
  }
  postMessage(value: unknown) {
    this.posted = value;
  }
  terminate() {
    this.terminated = true;
  }
}
async function withWorker(run: () => Promise<void>) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "Worker");
  Object.defineProperty(globalThis, "Worker", {
    configurable: true,
    value: FakeWorker,
  });
  FakeWorker.instances = [];
  try {
    await run();
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "Worker", descriptor);
    else Reflect.deleteProperty(globalThis, "Worker");
  }
}
test("agent shell completion terminates its worker and bounds returned output", async () => {
  await withWorker(async () => {
    const result = executeAgentShell("pwd", new AbortController().signal);
    const worker = FakeWorker.instances[0];
    assert.deepEqual(worker.posted, { type: "execute", script: "pwd" });
    worker.onmessage?.({
      data: { stdout: "x".repeat(65000), stderr: "", exitCode: 0 },
    });
    assert.equal((await result).stdout.length, 64000);
    assert.equal(worker.terminated, true);
  });
});
test("agent shell cancellation terminates computation and rejects with AbortError", async () => {
  await withWorker(async () => {
    const abort = new AbortController(),
      result = executeAgentShell("sleep 15", abort.signal);
    const rejected = assert.rejects(result, { name: "AbortError" });
    abort.abort();
    await rejected;
    assert.equal(FakeWorker.instances[0].terminated, true);
  });
});
test("agent shell has an enforced worker deadline even if interpreter does not respond", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  await withWorker(async () => {
    const result = executeAgentShell(
      "while true; do :; done",
      new AbortController().signal,
    );
    t.mock.timers.tick(20000);
    assert.equal((await result).exitCode, 124);
    assert.equal(FakeWorker.instances[0].terminated, true);
  });
});
test("pre-aborted and oversized scripts never start a worker", async () => {
  await withWorker(async () => {
    const abort = new AbortController();
    abort.abort();
    assert.throws(() => executeAgentShell("pwd", abort.signal), {
      name: "AbortError",
    });
    assert.throws(
      () => executeAgentShell("x".repeat(16001), new AbortController().signal),
      /16,000/,
    );
    assert.equal(FakeWorker.instances.length, 0);
  });
});
