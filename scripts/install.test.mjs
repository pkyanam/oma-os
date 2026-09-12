import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
const installer = fileURLToPath(new URL("./install.sh", import.meta.url));
test("installer selects Cloudflare by default and explicitly supports local Node", async () => {
  const dir = await mkdtemp(join(tmpdir(), "oma-install-test-"));
  try {
    const bin = join(dir, "bin"),
      log = join(dir, "calls");
    await mkdir(bin);
    await writeFile(join(bin, "node"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    await writeFile(join(bin, "git"), '#!/bin/sh\nmkdir "$3"\n', {
      mode: 0o755,
    });
    await writeFile(
      join(bin, "npm"),
      '#!/bin/sh\necho "$*" >> "$OMA_TEST_CALLS"\n',
      { mode: 0o755 },
    );
    const run = (profile, target, extra = {}) =>
      spawnSync("sh", [installer], {
        cwd: dir,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          OMA_RUNTIME: profile,
          OMA_INSTALL_DIR: target,
          OMA_TEST_CALLS: log,
          ...extra,
        },
      });
    assert.equal(run("", "cloudflare").status, 0);
    assert.equal(await readFile(log, "utf8"), "ci\nrun dev:cloudflare\n");
    await writeFile(log, "");
    assert.equal(run("node", "node").status, 0);
    assert.equal(
      await readFile(log, "utf8"),
      "ci\nrun setup:browser\nrun dev\n",
    );
    await writeFile(log, "");
    assert.equal(run("node", "node-skip", { OMA_SKIP_BROWSER: "1" }).status, 0);
    assert.equal(await readFile(log, "utf8"), "ci\nrun dev\n");
    assert.notEqual(run("unknown", "invalid").status, 0);
    assert.notEqual(run("node", "node").status, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
