import { defineCommand } from "just-bash";
import { gzipSync, Gunzip } from "fflate";

export const COMPRESSION_LIMIT = 16 * 1024 * 1024;
/** Streaming input bounds inflate's temporary allocation as well as retained output. */
export function decompressBounded(
  input: Uint8Array,
  limit = COMPRESSION_LIMIT,
) {
  if (
    input.length < 18 ||
    input[0] !== 0x1f ||
    input[1] !== 0x8b ||
    input[2] !== 8
  )
    throw new Error("not in gzip format");
  const chunks: Uint8Array[] = [];
  let length = 0,
    complete = false;
  const stream = new Gunzip((chunk, final) => {
    complete = final;
    length += chunk.length;
    if (length > limit)
      throw new Error(`decompressed output exceeds ${limit} bytes`);
    chunks.push(chunk);
  });
  for (let offset = 0; offset < input.length; offset += 1024)
    stream.push(
      input.subarray(offset, offset + 1024),
      offset + 1024 >= input.length,
    );
  if (!input.length) stream.push(input, true);
  if (!complete) throw new Error("incomplete gzip stream");
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}
function binaryString(bytes: Uint8Array) {
  let value = "";
  for (let offset = 0; offset < bytes.length; offset += 8192)
    value += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return value;
}
export function compressionCommands() {
  return ["gzip", "gunzip", "zcat"].map((name) =>
    defineCommand(name, async (args, ctx) => {
      try {
        let decompress = name !== "gzip",
          stdout = name === "zcat",
          options = true;
        const files: string[] = [];
        for (const arg of args) {
          if (options && arg === "--") {
            options = false;
            continue;
          }
          if (options && (arg === "--help" || arg === "-h"))
            return {
              stdout: `${name}: browser compression. Supports stdin or one file, -c/--stdout and -d/--decompress. File input requires -c; use redirection to save. Source files are never removed. 16 MiB input/output limit.\n`,
              stderr: "",
              exitCode: 0,
            };
          if (options && arg === "--stdout") {
            stdout = true;
            continue;
          }
          if (options && arg === "--decompress") {
            decompress = true;
            continue;
          }
          if (options && /^-[cd]+$/.test(arg)) {
            stdout ||= arg.includes("c");
            decompress ||= arg.includes("d");
            continue;
          }
          if (options && arg.startsWith("-") && arg !== "-")
            throw new Error(`unsupported option ${arg}; see ${name} --help`);
          files.push(arg);
        }
        if (files.length > 1)
          throw new Error("only one input file is supported");
        const file = files[0];
        if (file && file !== "-" && !stdout)
          throw new Error(
            "file input requires -c; use shell redirection to save output",
          );
        let input: Uint8Array;
        if (file && file !== "-") {
          const path = ctx.fs.resolvePath(ctx.cwd, file);
          if ((await ctx.fs.stat(path)).size > COMPRESSION_LIMIT)
            throw new Error("input exceeds 16 MiB");
          input = await ctx.fs.readFileBuffer(path);
        } else {
          const stdin = ctx.stdin as unknown as string;
          if (stdin.length > COMPRESSION_LIMIT)
            throw new Error("input exceeds 16 MiB");
          input = Uint8Array.from(stdin, (char) => char.charCodeAt(0));
        }
        if (input.length > COMPRESSION_LIMIT)
          throw new Error("input exceeds 16 MiB");
        const output = decompress ? decompressBounded(input) : gzipSync(input);
        if (output.length > COMPRESSION_LIMIT)
          throw new Error("output exceeds 16 MiB");
        return {
          stdout: binaryString(output),
          stdoutEncoding: "binary" as const,
          stderr: "",
          exitCode: 0,
        };
      } catch (error) {
        return {
          stdout: "",
          stderr: `${name}: ${error instanceof Error ? error.message : String(error)}\n`,
          exitCode: 1,
        };
      }
    }),
  );
}
