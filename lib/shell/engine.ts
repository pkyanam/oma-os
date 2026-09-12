import {
  Bash,
  defineCommand,
  type IFileSystem,
  type ExecResult,
} from "just-bash";

export type DesktopCommand = (
  name: string,
  args: string[],
  cwd: string,
  stdin: string,
) => Promise<ExecResult>;
export type ShellResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
  cwd: string;
};
export const SHELL_HELP = `Just Bash · browser shell, shared desktop files

Pipelines, redirection, variables, loops and scripts work:
  find . -name '*.md' | head
  cat data.json | jq '.items[] | .name'
  grep -rn TODO Projects | sort
  printf 'one\\ntwo\\n' | sed 's/two/three/'

oma help     desktop commands
edit PATH    open a file in Editor
open URL     open inside Browser
run PATH     run a local HTML app
clear        clear terminal
quit / exit  close this terminal (standalone command)
close        close this terminal

Network is disabled. No native binaries, Node.js, Python or Linux kernel.
Files persist in OPFS; environment/cwd live until this terminal closes.
Functions and aliases are scoped to each submitted script.
Ctrl+C stops execution. Limits: 15s, 10,000 commands, 1 MiB output.
`;
const unavailable = ["curl", "wget"];
export const SHELL_LIMITS = {
  maxExecutionTimeMs: 15_000,
  maxCommandCount: 10_000,
  maxLoopIterations: 10_000,
  maxOutputSize: 1024 * 1024,
  maxSourceBytes: 128 * 1024,
  maxCallDepth: 32,
  maxTraversalEntries: 10_000,
  maxTraversalDepth: 32,
  maxInputBytes: 32 * 1024 * 1024,
  maxLiveBytes: 64 * 1024 * 1024,
  maxFileSystemBytes: 32 * 1024 * 1024,
  maxArchiveBytes: 16 * 1024 * 1024,
  maxArchiveCompressedBytes: 16 * 1024 * 1024,
  maxArchiveEntryBytes: 16 * 1024 * 1024,
  maxArchiveEntries: 1000,
  maxStringLength: 4 * 1024 * 1024,
  maxArrayElements: 100_000,
  maxHeredocSize: 128 * 1024,
};
export function createShellEngine(
  filesystem: IFileSystem,
  desktop: DesktopCommand,
) {
  let cwd = "/home/guest",
    env: Record<string, string> = {
      HOME: "/home/guest",
      USER: "guest",
      LOGNAME: "guest",
      SHELL: "/bin/bash",
      TERM: "xterm-256color",
      PATH: "/bin:/usr/bin",
    };
  const shell = new Bash({
    fs: filesystem,
    cwd,
    env,
    executionLimitProfile: "hardened",
    executionLimits: SHELL_LIMITS,
    // No network, Python or JS execution options are provided.
    customCommands: [
      ...[
        "oma",
        "edit",
        "open",
        "run",
        "theme",
        "ws",
        "launch",
        "close",
        "quit",
      ].map((name) =>
        defineCommand(name, (args, ctx) =>
          desktop(
            name,
            args,
            ctx.cwd,
            new TextDecoder().decode(
              Uint8Array.from(ctx.stdin as unknown as string, (char) =>
                char.charCodeAt(0),
              ),
            ),
          ),
        ),
      ),
      defineCommand("help", async () => ({
        stdout: SHELL_HELP,
        stderr: "",
        exitCode: 0,
      })),
      defineCommand("uname", async () => ({
        stdout: "oma.os (browser · Just Bash; no Linux kernel)\n",
        stderr: "",
        exitCode: 0,
      })),
      ...unavailable.map((name) =>
        defineCommand(name, async () => ({
          stdout: "",
          stderr: `${name}: network access is disabled in this shell\n`,
          exitCode: 126,
        })),
      ),
    ],
  });
  return {
    get cwd() {
      return cwd;
    },
    async execute(script: string, signal?: AbortSignal): Promise<ShellResult> {
      if (/^\s*help\s*;?\s*$/.test(script)) {
        const commands = await desktop("oma", ["help"], cwd, "");
        return {
          stdout:
            SHELL_HELP + "\nDesktop command reference\n" + commands.stdout,
          stderr: commands.stderr,
          exitCode: commands.exitCode,
          cwd,
        };
      }
      const result = await shell.exec(script, {
        cwd,
        env,
        rawScript: true,
        signal,
      });
      env = { ...result.env };
      if (
        env.PWD &&
        (await filesystem.stat(env.PWD).catch(() => null))?.isDirectory
      )
        cwd = env.PWD;
      return {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        cwd,
      };
    },
  };
}
