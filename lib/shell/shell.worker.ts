import { InMemoryFs, MountableFs, type ExecResult } from "just-bash/browser";
import { OpfsShellFs } from "./opfs-adapter";
import { createShellEngine } from "./engine";

const worker = globalThis as unknown as {
  postMessage: (value: unknown) => void;
  onmessage: (event: MessageEvent) => void;
};
const calls = new Map<number, (result: ExecResult) => void>();
let serial = 0,
  dirty = false;
const filesystem = new MountableFs({
  base: new OpfsShellFs(undefined, () => {
    dirty = true;
  }),
  mounts: [{ mountPoint: "/tmp", filesystem: new InMemoryFs() }],
});
const engine = createShellEngine(
  filesystem,
  (name, args, cwd, stdin) =>
    new Promise((resolve) => {
      const callId = ++serial;
      calls.set(callId, resolve);
      worker.postMessage({ type: "desktop", callId, name, args, cwd, stdin });
    }),
);
worker.onmessage = (event) => {
  const message = event.data;
  if (message.type === "desktop-result") {
    calls.get(message.callId)?.(message.result);
    calls.delete(message.callId);
    return;
  }
  if (message.type !== "execute") return;
  dirty = false;
  void engine
    .execute(message.script)
    .then((result) => worker.postMessage({ type: "result", result, dirty }))
    .catch((error) =>
      worker.postMessage({
        type: "result",
        result: {
          stdout: "",
          stderr: error instanceof Error ? error.message : String(error),
          exitCode: 1,
          cwd: engine.cwd,
        },
        dirty,
      }),
    );
};
