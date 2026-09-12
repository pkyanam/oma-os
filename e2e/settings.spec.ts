import { test, expect } from "@playwright/test";
import { boot, launch } from "./helpers";
test("Settings has direct labels and never enables offline caching on mount or tab changes", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const state = window as Window & { offlineRegistrations?: number };
    state.offlineRegistrations = 0;
    if (!("serviceWorker" in navigator)) return;
    const original = ServiceWorkerContainer.prototype.register;
    ServiceWorkerContainer.prototype.register = function (...args) {
      state.offlineRegistrations!++;
      return original.apply(this, args);
    };
  });
  await boot(page);
  const settings = await launch(page, "Settings");
  await expect(
    settings.getByRole("heading", { name: "Settings", exact: true }),
  ).toBeVisible();
  await expect(settings.getByText("YOUR DESKTOP", { exact: true })).toHaveCount(
    0,
  );
  await expect(
    settings.getByRole("heading", { name: "Offline access", exact: true }),
  ).toBeVisible();
  await expect(settings).not.toContainText("Checking offline support…");
  if (
    (await page
      .locator('meta[name="oma-offline"][content="available"]')
      .count()) === 0
  ) {
    await expect(settings).toContainText(
      "Offline downloads are available in the production Cloudflare build",
    );
    await expect(
      settings.getByRole("button", {
        name: "Enable offline access",
        exact: true,
      }),
    ).toHaveCount(0);
  }
  await settings
    .getByRole("button", { name: "Storage & backup", exact: true })
    .click();
  await settings.getByRole("button", { name: "Desktop", exact: true }).click();
  await expect(
    settings.getByRole("heading", { name: "Offline access", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        (window as Window & { offlineRegistrations?: number })
          .offlineRegistrations,
    ),
  ).toBe(0);
});
