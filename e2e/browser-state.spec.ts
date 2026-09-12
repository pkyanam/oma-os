import { test, expect } from "@playwright/test";
import { boot, launch } from "./helpers";
test("asynchronous browser capability discovery preserves an address being typed", async ({
  page,
}) => {
  let release!: () => void;
  const delayed = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requestedURL = "";
  await page.route(/\/api\/browser-runtime\?capabilities=1$/, async (route) => {
    await delayed;
    await route.fulfill({ json: { available: true } });
  });
  await page.route(/\/api\/browser-runtime$/, async (route) => {
    requestedURL = route.request().postDataJSON().url || "";
    await route.fulfill({
      status: 503,
      json: { error: "Isolated transport fixture" },
    });
  });
  await boot(page);
  const app = await launch(page, "Browser");
  const address = app.getByRole("textbox", { name: "Browser address" });
  await address.fill("https://www.google.com/");
  release();
  await expect(app.locator(".oma-browser")).toHaveAttribute(
    "data-runtime",
    "chromium",
  );
  await expect(address).toHaveValue("https://www.google.com/");
  await address.press("Enter");
  await expect.poll(() => requestedURL).toBe("https://www.google.com/");
});
