import { test, expect } from "@playwright/test";
import { boot, launch } from "./helpers";

test("real Google and MDN stay inside the OS browser", async ({
  page,
  context,
}) => {
  test.skip(
    process.env.OMA_TEST_NETWORK !== "1",
    "Opt-in live websites depend on internet and third-party policies.",
  );
  test.setTimeout(120_000);
  await boot(page);
  const app = await launch(page, "Browser");
  const address = app.getByRole("textbox", { name: "Browser address" });
  const image = app.getByRole("img", {
    name: "Live webpage rendered by Chromium",
  });
  for (const url of [
    "https://www.google.com/",
    "https://developer.mozilla.org/en-US/",
  ]) {
    await address.fill(url);
    const rendered = page.waitForResponse(
      (response) =>
        response.url().includes("/api/browser-runtime?") &&
        decodeURIComponent(
          response.headers()["x-browser-url"] ?? "",
        ).startsWith(url) &&
        response.headers()["x-browser-loading"] === "false",
      { timeout: 45_000 },
    );
    await address.press("Enter");
    await rendered;
    await expect(image).toBeVisible({ timeout: 45_000 });
    await expect(image).toHaveAttribute("data-page-url", url, {
      timeout: 45_000,
    });
    await expect(image).toHaveAttribute("data-page-loading", "false", {
      timeout: 45_000,
    });
    await expect
      .poll(
        () =>
          image.evaluate(
            (element: HTMLImageElement) =>
              element.complete && element.naturalWidth > 100,
          ),
        { timeout: 30_000 },
      )
      .toBe(true);
    await expect(app.locator(".remote-browser-failure")).toHaveCount(0);
    await expect(app).not.toContainText("Loading…");
    expect(context.pages()).toHaveLength(1);
    await page.screenshot({
      path: `/tmp/oma-live-${url.includes("google") ? "google" : "mdn"}.png`,
    });
  }
});
