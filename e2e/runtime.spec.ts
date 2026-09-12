import { test, expect } from "@playwright/test";
import { boot, launch, shell } from "./helpers";
test("Python source creation, real execution, export collisions, stop and discard close", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await boot(page);
  const lab = await launch(page, "Python Lab");
  await page.keyboard.press("Alt+f");
  const source = lab.getByRole("textbox", {
    name: "Python source",
    exact: true,
  });
  const path = lab.getByRole("textbox", {
    name: "Python source path",
    exact: true,
  });
  await path.fill("/home/guest/Projects/runtime-e2e.py");
  await source.fill(
    'import csv\nprint("runtime-export-ready")\nwith open("runtime-report.csv", "w") as file:\n    file.write("name,value\\nAda,42\\n")\n',
  );
  await lab.getByRole("button", { name: "Save", exact: true }).click();
  await expect(lab.getByRole("status")).toHaveText(
    "Saved /home/guest/Projects/runtime-e2e.py",
  );
  await lab.getByRole("button", { name: "Run", exact: true }).click();
  await expect(lab.getByRole("log")).toContainText("runtime-export-ready", {
    timeout: 120_000,
  });
  await expect(lab.getByRole("status")).toContainText("Finished", {
    timeout: 20_000,
  });
  const exportFile = lab.getByRole("button", { name: /runtime-report.csv/ });
  await exportFile.click();
  await expect(lab.getByRole("status")).toHaveText(
    "Exported /home/guest/Documents/runtime-report.csv",
  );
  await exportFile.click();
  await expect(lab.getByRole("status")).toContainText("Export would replace");
  await expect(exportFile).toBeEnabled();
  // Verify persisted data through the real shell and Data app rather than page storage access.
  await page.keyboard.press("Alt+f");
  const terminal = page
    .getByRole("region", { name: "Terminal window", exact: true })
    .first();
  await shell(
    terminal,
    "cat Documents/runtime-report.csv",
    /name,value\s+Ada,42/,
  );
  await shell(
    terminal,
    "open Documents/runtime-report.csv",
    "opened /home/guest/Documents/runtime-report.csv",
  );
  const data = page.locator('[data-app="data"]').last();
  await expect(
    data.getByRole("textbox", { name: "Row 1, name", exact: true }),
  ).toHaveValue("Ada");
  await expect(
    data.getByRole("textbox", { name: "Row 1, value", exact: true }),
  ).toHaveValue("42");
  await source.click();
  await page.keyboard.press("Alt+f");
  await source.fill("while True:\n    pass\n");
  await lab.getByRole("button", { name: "Run", exact: true }).click();
  await expect(lab.getByRole("status")).toHaveText("Running…", {
    timeout: 20_000,
  });
  await lab.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(lab.getByRole("status")).toContainText(
    "Stopped. Python memory reset",
  );
  await expect(
    lab.getByRole("button", { name: "Run", exact: true }),
  ).toBeEnabled();
  await lab.getByRole("button", { name: "Close", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Keep open", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Keep open", exact: true }).click();
  await expect(source).toHaveValue("while True:\n    pass\n");
  await lab.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Close anyway", exact: true }).click();
  await expect(page.locator('[data-app="lab"]')).toHaveCount(0);
});
test("Untouched Python starter can close without being trapped as unsaved", async ({
  page,
}) => {
  await boot(page);
  const lab = await launch(page, "Python Lab");
  await expect(
    lab.getByRole("textbox", { name: "Python source", exact: true }),
  ).toBeVisible();
  await lab.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.locator('[data-app="lab"]')).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Close anyway", exact: true }),
  ).toHaveCount(0);
});
