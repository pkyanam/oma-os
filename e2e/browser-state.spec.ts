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

test("Cloudflare browser stays embedded and closes its managed session", async ({
  page,
}) => {
  const actions: string[] = [];
  await page.route(/\/api\/browser-runtime\?capabilities=1$/, (route) =>
    route.fulfill({
      json: { available: true, provider: "cloudflare", transport: "live-view" },
    }),
  );
  await page.route("https://live.browser.run/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<html><body>Managed browser fixture</body></html>",
    }),
  );
  await page.route(/\/api\/browser-runtime$/, async (route) => {
    const input = route.request().postDataJSON();
    actions.push(input.action);
    await route.fulfill({
      json:
        input.action === "close"
          ? { closed: true }
          : {
              sessionId: "test-cloud-page",
              viewerUrl: "https://live.browser.run/fixture",
              url: input.url || "https://www.google.com/",
              title: "Google",
              expiresAt: Date.now() + 900000,
            },
    });
  });
  await boot(page);
  const app = await launch(page, "Browser");
  await expect(app.locator(".oma-browser")).toHaveAttribute(
    "data-runtime",
    "cloudflare",
  );
  const address = app.getByRole("textbox", { name: "Browser address" });
  await address.fill("https://www.google.com/");
  await address.press("Enter");
  await expect(
    app.locator('iframe[title="Cloudflare live browser"]'),
  ).toBeVisible();
  expect(page.context().pages()).toHaveLength(1);
  await app.getByRole("button", { name: "End session", exact: true }).click();
  await expect(
    app.getByRole("heading", { name: "Cloud browser stopped" }),
  ).toBeVisible();
  await expect.poll(() => actions.includes("close")).toBe(true);
});

test("Cloudflare sign-in requirement is actionable inside Browser", async ({
  page,
}) => {
  await page.route(/\/api\/browser-runtime\?capabilities=1$/, (route) =>
    route.fulfill({
      json: {
        available: false,
        provider: "cloudflare",
        transport: "live-view",
        requiresAuthentication: true,
      },
    }),
  );
  await page.route(/\/api\/browser-runtime$/, (route) =>
    route.fulfill({
      status: 401,
      json: {
        error:
          "Sign in with ChatGPT in Agent settings before starting a cloud browser.",
      },
    }),
  );
  await boot(page);
  const app = await launch(page, "Browser");
  await expect(app.locator(".oma-browser")).toHaveAttribute(
    "data-runtime",
    "cloudflare",
  );
  const address = app.getByRole("textbox", { name: "Browser address" });
  await address.fill("https://www.google.com/");
  await address.press("Enter");
  await expect(
    app.getByRole("button", { name: "Open Agent to sign in" }),
  ).toBeVisible();
  await expect(
    app.locator('iframe[title="Cloudflare live browser"]'),
  ).toHaveCount(0);
});
