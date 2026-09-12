import { test, expect } from "@playwright/test";
import { boot, launch, shell } from "./helpers";
test("browser gzip pipelines round trip without Node zlib", async ({
  page,
}) => {
  await boot(page, "/", { workspace: "applications" });
  const terminal = await launch(page, "Terminal");
  await shell(terminal, "echo shell-ready", "shell-ready");
  await shell(
    terminal,
    "printf 'gzip-roundtrip\\n' | gzip | gunzip; echo compression-status:$?",
    "compression-status:",
  );
  await expect(terminal).toContainText(/gzip-roundtrip\s+compression-status:0/);
});
