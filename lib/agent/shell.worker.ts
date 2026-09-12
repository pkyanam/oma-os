import { OpfsShellFs } from "../shell/opfs-adapter";
import { createAgentShell } from "./shell-engine";
const worker = globalThis as unknown as {
  onmessage: (event: MessageEvent) => void;
  postMessage: (message: unknown) => void;
};
worker.onmessage = (event) => {
  if (event.data?.type !== "execute" || typeof event.data.script !== "string")
    return;
  const shell = createAgentShell(new OpfsShellFs());
  void shell.exec(event.data.script, { rawScript: true }).then(
    (result) =>
      worker.postMessage({
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
      }),
    (error) =>
      worker.postMessage({
        stdout: "",
        stderr: error instanceof Error ? error.message : String(error),
        exitCode: 1,
      }),
  );
};
