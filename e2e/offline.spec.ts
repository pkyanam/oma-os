import { test, expect } from "@playwright/test";
import { boot, launch } from "./helpers";
test.skip(
  !process.env.OMA_OFFLINE_TEST_URL,
  "Requires the built Cloudflare static desktop",
);
test("explicit offline download preserves Notes and excludes private traffic", async ({
  page,
  context,
}) => {
  await boot(page, process.env.OMA_OFFLINE_TEST_URL, {
    workspace: "applications",
  });
  expect(
    await page.evaluate(() =>
      navigator.serviceWorker.getRegistrations().then((x) => x.length),
    ),
  ).toBe(0);
  const settings = await launch(page, "Settings");
  await settings
    .getByRole("button", { name: "Enable offline access", exact: true })
    .click();
  await expect(settings).toContainText("Offline files are ready.", {
    timeout: 60000,
  });
  await page.reload();
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(
    true,
  );
  // Fetching an API response does not put it in any offline asset cache.
  await page.evaluate(() => fetch("/api/agent-config").catch(() => null));
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("region", { name: "Applications window", exact: true }),
  ).toBeVisible();
  const notes = await launch(page, "Notes");
  await notes.getByRole("button", { name: "New note", exact: true }).click();
  await notes
    .getByRole("textbox", { name: "Note title" })
    .fill("Offline persistence");
  await notes
    .getByRole("textbox", { name: "Note body" })
    .fill("Written with the network disconnected.");
  await page.keyboard.press("Control+s");
  await expect(notes).toContainText("Saved");
  await page.reload();
  const restored = page.getByRole("region", {
    name: "Notes window",
    exact: true,
  });
  await expect(
    restored.getByRole("textbox", { name: "Note body" }),
  ).toHaveValue("Written with the network disconnected.");
  const keys = await page.evaluate(async () => {
    const out: string[] = [];
    for (const name of await caches.keys())
      for (const key of await (await caches.open(name)).keys())
        out.push(key.url);
    return out;
  });
  expect(keys.some((url) => url.includes("/api/"))).toBe(false);
  expect(
    keys.some(
      (url) => url.includes("/runtime/pyodide/") || url.includes("/monaco/"),
    ),
  ).toBe(false);
  const uncached = await launch(page, "Terminal");
  await expect(uncached).toContainText(
    /encountered an error|not available offline|could not load/i,
  );
  await page.keyboard.press("Alt+q");
  await expect(
    restored.getByRole("textbox", { name: "Note body" }),
  ).toHaveValue("Written with the network disconnected.");
  await context.setOffline(false);
  const controls = await launch(page, "Settings");
  await controls
    .getByRole("button", { name: "Disable offline access", exact: true })
    .click();
  await expect(controls).toContainText(
    "Offline cache removed. Local files are unchanged.",
  );
  expect(
    await page.evaluate(async () =>
      (await caches.keys()).filter(
        (name) =>
          name.startsWith("oma-offline-") && name !== "oma-offline-control",
      ),
    ),
  ).toEqual([]);
  await launch(page, "Activity");
  expect(
    await page.evaluate(async () =>
      (await caches.keys()).filter(
        (name) =>
          name.startsWith("oma-offline-") && name !== "oma-offline-control",
      ),
    ),
  ).toEqual([]);
});

test("failed offline setup is retryable and updates wait without reloading the session", async ({
  page,
  request,
}) => {
  test.skip(
    !process.env.OMA_OFFLINE_FIXTURE,
    "Requires isolated mutable static fixture",
  );
  const origin = process.env.OMA_OFFLINE_TEST_URL!;
  try {
    await request.post(origin + "/__offline_fixture/state", {
      data: { suffix: "", failCore: true },
    });
    await boot(page, origin, { workspace: "applications" });
    const settings = await launch(page, "Settings");
    await settings
      .getByRole("button", { name: "Enable offline access", exact: true })
      .click();
    await expect(settings.getByRole("alert")).toContainText(/failed/i, {
      timeout: 30000,
    });
    expect(
      await page.evaluate(async () =>
        (await caches.keys()).filter(
          (name) =>
            name.startsWith("oma-offline-") && name !== "oma-offline-control",
        ),
      ),
    ).toEqual([]);
    await request.post(origin + "/__offline_fixture/state", {
      data: { suffix: "", failCore: false },
    });
    await settings
      .getByRole("button", { name: "Retry offline download", exact: true })
      .click();
    await expect(settings).toContainText("Offline files are ready.", {
      timeout: 30000,
    });
    await page.reload();
    await page.evaluate(() => {
      (window as unknown as { offlineSentinel: string }).offlineSentinel =
        "keep-session";
    });
    await request.post(origin + "/__offline_fixture/state", {
      data: { suffix: "updated", failCore: false },
    });
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration("/");
      await registration!.update();
    });
    await expect
      .poll(() =>
        page.evaluate(
          async () =>
            !!(await navigator.serviceWorker.getRegistration("/"))?.waiting,
        ),
      )
      .toBe(true);
    expect(
      await page.evaluate(
        () =>
          (window as unknown as { offlineSentinel: string }).offlineSentinel,
      ),
    ).toBe("keep-session");
    expect(
      await page.evaluate(async () => {
        const item = await navigator.serviceWorker.getRegistration("/");
        return item?.active?.state;
      }),
    ).toBe("activated");
    expect(
      (
        await page.evaluate(async () =>
          (await caches.keys()).filter(
            (name) =>
              name.startsWith("oma-offline-") && name !== "oma-offline-control",
          ),
        )
      ).length,
    ).toBe(2);
  } finally {
    await request.post(origin + "/__offline_fixture/state", {
      data: { suffix: "", failCore: false },
    });
  }
});
