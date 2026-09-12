import { Bash, type IFileSystem } from "just-bash";
import { ReadOnlyAgentFs } from "./read-only-fs";
import { SHELL_LIMITS } from "../shell/engine";
export function createAgentShell(source: IFileSystem) {
  return new Bash({
    fs: new ReadOnlyAgentFs(source),
    cwd: "/home/guest",
    env: { HOME: "/home/guest", USER: "guest", LANG: "C.UTF-8" },
    executionLimitProfile: "hardened",
    executionLimits: {
      ...SHELL_LIMITS,
      maxOutputSize: 64000,
      maxSourceBytes: 16000,
      maxInputBytes: 4 * 1024 * 1024,
    },
    // Deliberately omit network, JS/Python execution and all desktop custom commands.
  });
}
