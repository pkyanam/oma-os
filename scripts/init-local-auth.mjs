import { randomBytes } from "node:crypto";
import { open, readFile, appendFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export async function initializeLocalAuth(directory = process.cwd()) {
  const target = resolve(directory, ".dev.vars");
  const lockPath = `${target}.init-lock`;
  const lock = await open(lockPath, "wx", 0o600);
  try {
    const existing = await readFile(target, "utf8").catch((error) => {
      if (error.code === "ENOENT") return "";
      throw error;
    });
    // Preserve even an explicitly empty value: never rotate an owner's secret.
    if (/^\s*(?:export\s+)?LWC_SECRET\s*=/m.test(existing)) return false;
    await appendFile(
      target,
      `${existing && !existing.endsWith("\n") ? "\n" : ""}LWC_SECRET=${randomBytes(32).toString("hex")}\n`,
      { mode: 0o600 },
    );
    return true;
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const created = await initializeLocalAuth();
    console.log(
      created
        ? "Created local authentication secret in .dev.vars (never upload this file)."
        : "Preserved existing local authentication secret.",
    );
  } catch (error) {
    console.error(
      `Local authentication initialization failed: ${error.message}`,
    );
    process.exitCode = 1;
  }
}
