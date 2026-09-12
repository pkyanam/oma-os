import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, stat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initializeLocalAuth } from "./init-local-auth.mjs";
test("local auth creation is private and never replaces existing secrets or settings", async () => {
  const dir = await mkdtemp(join(tmpdir(), "oma-auth-init-"));
  try {
    assert.equal(await initializeLocalAuth(dir), true);
    const file = join(dir, ".dev.vars"),
      original = await readFile(file, "utf8");
    assert.match(original, /^LWC_SECRET=[a-f0-9]{64}\n$/);
    assert.equal((await stat(file)).mode & 0o777, 0o600);
    assert.equal(await initializeLocalAuth(dir), false);
    assert.equal(await readFile(file, "utf8"), original);
    await writeFile(file, "OTHER_SETTING=yes");
    assert.equal(await initializeLocalAuth(dir), true);
    assert.match(
      await readFile(file, "utf8"),
      /^OTHER_SETTING=yes\nLWC_SECRET=/,
    );
    await writeFile(file, "LWC_SECRET=\n");
    assert.equal(await initializeLocalAuth(dir), false);
    assert.equal(await readFile(file, "utf8"), "LWC_SECRET=\n");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
