import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { boot, launch, shell } from "./helpers";

test("Activity reports session operations, filters, exports safe metadata and clears", async ({
  page,
}, testInfo) => {
  await boot(page);
  const activity = await launch(page, "Activity");
  const terminal = await launch(page, "Terminal");
  await shell(
    terminal,
    'oma fs write Documents/private-activity-check.txt "never include these contents"',
    "saved /home/guest/Documents/private-activity-check.txt",
  );
  await terminal
    .getByRole("textbox", { name: "Terminal input" })
    .pressSequentially("quit");
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("region", { name: "Terminal window", exact: true }),
  ).toHaveCount(0);
  await activity.getByText("Session activity", { exact: true }).click();
  await page.keyboard.press("Alt+f");
  await expect(activity).toContainText("Opened Terminal");
  await expect(activity).toContainText("Closed Terminal");
  await expect(activity).toContainText("Filesystem updated");
  await activity
    .getByRole("navigation", { name: "Activity filters" })
    .getByRole("button", { name: "Files", exact: true })
    .click();
  await expect(activity.locator(".activity-events")).toContainText(
    "Filesystem updated",
  );
  await expect(activity.locator(".activity-events")).not.toContainText(
    "Opened Terminal",
  );
  const downloaded = page.waitForEvent("download");
  await activity
    .getByRole("button", { name: "Export session activity" })
    .click();
  const download = await downloaded;
  const path = testInfo.outputPath("session-activity.json");
  await download.saveAs(path);
  const text = await readFile(path, "utf8"),
    report = JSON.parse(text);
  expect(report.format).toBe("oma-session-activity");
  expect(
    report.events.some(
      (event: { kind: string }) => event.kind === "app-opened",
    ),
  ).toBe(true);
  expect(text).not.toMatch(
    /private-activity-check|never include these contents|apiKey|prompt|fileContents/,
  );
  for (const event of report.events)
    expect(
      Object.keys(event).every((key) =>
        ["time", "kind", "app", "workspace", "fromWorkspace", "count"].includes(
          key,
        ),
      ),
    ).toBe(true);
  await activity
    .getByRole("button", { name: "Clear session activity" })
    .click();
  await activity.getByRole("button", { name: "Clear", exact: true }).click();
  await activity
    .getByRole("navigation", { name: "Activity filters" })
    .getByRole("button", { name: "All", exact: true })
    .click();
  await expect(activity).toContainText("A fresh timeline.");
  await expect(
    activity.getByRole("button", { name: "Export session activity" }),
  ).toBeDisabled();
});

test("Applications diagnostics report real local capability without model calls", async ({
  page,
}) => {
  let paidRequests = 0;
  page.on("request", (request) => {
    if (
      /\/api\/chatgpt\/(?:proxy|responses|chat\/completions)/.test(
        request.url(),
      )
    )
      paidRequests++;
  });
  await boot(page);
  const applications = await launch(page, "Applications");
  await page.keyboard.press("Alt+f");
  await applications
    .getByRole("button", { name: "Help & diagnostics" })
    .click();
  await expect(
    applications.getByRole("heading", { name: "Diagnostics" }),
  ).toBeVisible();
  await expect(
    applications.getByRole("button", { name: "Run checks", exact: true }),
  ).toBeEnabled();
  await expect(
    applications
      .locator(".application-diagnostic")
      .filter({ hasText: "Filesystem" }),
  ).toContainText("Readable");
  await expect(
    applications
      .locator(".application-diagnostic")
      .filter({ hasText: "Application backend" }),
  ).toContainText("Reachable");
  await applications
    .getByText("View report for manual copy", { exact: true })
    .click();
  const text = await applications
    .locator(".application-report pre")
    .innerText();
  const report = JSON.parse(text);
  expect(report.checks.length).toBeGreaterThanOrEqual(5);
  expect(
    report.checks.find(
      (check: { label: string }) => check.label === "Filesystem",
    ).status,
  ).toBe("ok");
  expect(paidRequests).toBe(0);
});
