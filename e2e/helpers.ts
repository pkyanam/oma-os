import { expect, type Page, type Locator } from "@playwright/test";
export async function boot(
  page: Page,
  url = "/",
  options: { workspace?: "tools" | "applications" } = {},
) {
  const rate = Number(process.env.OMA_E2E_CPU_RATE);
  if (Number.isFinite(rate) && rate > 1) {
    const session = await page.context().newCDPSession(page);
    await session.send("Emulation.setCPUThrottlingRate", { rate });
  }
  await page.goto(url);
  const welcome = page.getByRole("button", { name: "Enter the desktop ↵" });
  await expect(welcome).toBeVisible();
  await welcome.click();
  await expect(
    page.getByRole("dialog", { name: "Welcome to oma.os" }),
  ).toHaveCount(0);
  if (options.workspace !== "applications") {
    // Tests that exercise tools explicitly create their workspace through UI.
    // Real first boot stays lightweight and opens only Applications.
    await page.keyboard.press("Alt+q");
    await launch(page, "Terminal");
    await launch(page, "Editor");
    await launch(page, "Files");
    await page.keyboard.press("Alt+ArrowLeft");
  }
}
export async function launch(page: Page, title: string) {
  await page.keyboard.press("Control+Space");
  const search = page.getByRole("combobox", {
    name: "Search apps, commands, files",
  });
  await search.fill(title);
  const dialog = page.getByRole("dialog", { name: "Launcher" });
  await dialog.getByRole("button", { name: "Apps", exact: true }).click();
  await search.press("Enter");
  await expect(dialog).toHaveCount(0);
  const app = page
    .getByRole("region", { name: `${title} window`, exact: true })
    .last();
  await expect(app).toBeVisible();
  return app;
}
export async function shell(
  region: Locator,
  script: string,
  output: string | RegExp,
) {
  const execution = region.locator(".terminal-shell");
  await expect(execution).toHaveAttribute("aria-busy", "false", {
    timeout: 25_000,
  });
  const input = region.getByRole("textbox", { name: "Terminal input" });
  await input.pressSequentially(script);
  await input.press("Enter");
  await expect(execution).toHaveAttribute("aria-busy", "false", {
    timeout: 25_000,
  });
  await expect(region).toContainText(output, { timeout: 25_000 });
}
