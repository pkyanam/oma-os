import { test, expect } from "@playwright/test";
import { archiveEntries } from "../lib/files/archive";
import { boot, launch, shell } from "./helpers";
async function backup(fileCount = 1) {
  const content = new TextEncoder().encode("backup-value\n");
  return Buffer.from(
    await archiveEntries({
      "home/guest/Documents/restore-check.txt": content,
      "oma-backup.json": new TextEncoder().encode(
        JSON.stringify({
          format: "oma.os.backup",
          version: 1,
          createdAt: "2026-09-12T12:00:00.000Z",
          files: fileCount,
          bytes: content.length,
          directories: ["/home/guest", "/home/guest/Documents", "/.oma"],
        }),
      ),
    }),
  );
}
test("Settings rejects mismatched backup counts and protects files changed after preview", async ({
  page,
}) => {
  await boot(page);
  const terminal = page
    .getByRole("region", { name: "Terminal window", exact: true })
    .first();
  await shell(
    terminal,
    "printf 'original-value\\n' > Documents/restore-check.txt; cat Documents/restore-check.txt",
    "original-value",
  );
  const settings = await launch(page, "Settings");
  await page.keyboard.press("Alt+f");
  await settings
    .getByRole("button", { name: "Storage & backup", exact: true })
    .click();
  const upload = settings.locator('input[type="file"]');
  await upload.setInputFiles({
    name: "bad.zip",
    mimeType: "application/zip",
    buffer: await backup(2),
  });
  await expect(settings.getByRole("alert")).toContainText("does not match");
  const valid = {
    name: "backup.zip",
    mimeType: "application/zip",
    buffer: await backup(),
  };
  await upload.setInputFiles(valid);
  await expect(
    settings.getByRole("heading", { name: "Review backup import" }),
  ).toBeVisible();
  await expect(settings).toContainText("1 files already exist");
  await page.keyboard.press("Alt+f");
  await shell(
    terminal,
    "printf 'changed-after-preview\\n' > Documents/restore-check.txt; cat Documents/restore-check.txt",
    "changed-after-preview",
  );
  await settings.click();
  await page.keyboard.press("Alt+f");
  await settings
    .getByRole("checkbox", { name: "Replace 1 existing files" })
    .check();
  await settings
    .getByRole("button", { name: "Restore files", exact: true })
    .click();
  await expect(
    settings.getByRole("button", { name: "Export backup", exact: true }),
  ).toBeEnabled();
  await expect(settings.getByRole("status")).toHaveCount(1);
  await expect(settings.getByRole("status")).toContainText("Restored 0 files");
  await expect(settings.getByRole("alert")).toContainText(
    "File changed on disk. Reload it before replacing it.",
  );
  await upload.setInputFiles(valid);
  await settings
    .getByRole("checkbox", { name: "Replace 1 existing files" })
    .check();
  await settings
    .getByRole("button", { name: "Restore files", exact: true })
    .click();
  await expect(
    settings.getByRole("button", { name: "Export backup", exact: true }),
  ).toBeEnabled();
  await expect(settings.getByRole("status")).toHaveCount(1);
  await expect(settings.getByRole("status")).toContainText("Restored 1 files");
  await page.keyboard.press("Alt+f");
  await shell(
    terminal,
    "cat Documents/restore-check.txt",
    /backup-value\s+oma.os/,
  );
});
