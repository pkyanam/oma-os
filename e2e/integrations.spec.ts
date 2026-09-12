import { test, expect } from "@playwright/test";
import { boot, launch } from "./helpers";

test("PGlite worker executes SQL and persists database across reload", async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await boot(page);
  await page.keyboard.press("Alt+2");
  const app = await launch(page, "SQL Workbench");
  await expect(
    app.getByText("Ready · saved locally", { exact: true }),
  ).toBeVisible({ timeout: 90000 });
  await app.getByRole("button", { name: "Run SQL", exact: true }).click();
  await expect(
    app.locator("td").filter({ hasText: "Engineering" }),
  ).toBeVisible({ timeout: 30000 });
  await expect(
    app.getByText("Ready · saved locally", { exact: true }),
  ).toBeVisible();
  await app.getByRole("button", { name: "Import CSV", exact: true }).click();
  await app.locator("input[type=file]").setInputFiles({
    name: "integration.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("name,value\nalpha,12\nbeta,34"),
  });
  await expect(app.locator("td").filter({ hasText: "alpha" })).toBeVisible({
    timeout: 30000,
  });
  await expect(
    app.getByText("Ready · saved locally", { exact: true }),
  ).toBeVisible();
  await page.reload();
  const restored = page.getByRole("region", {
    name: "SQL Workbench window",
    exact: true,
  });
  await expect(
    restored.getByText("Ready · saved locally", { exact: true }),
  ).toBeVisible({ timeout: 90000 });
  await restored
    .getByRole("textbox", { name: "SQL editor", exact: true })
    .fill(
      "SELECT name, value::int * 2 AS doubled FROM integration ORDER BY name;",
    );
  await restored.getByRole("button", { name: "Run SQL", exact: true }).click();
  await expect(
    restored.getByRole("cell", { name: "68", exact: true }),
  ).toBeVisible({ timeout: 30000 });
  await expect(
    restored.getByRole("cell", { name: "alpha", exact: true }),
  ).toBeVisible();
  await expect(
    restored.getByText("Ready · saved locally", { exact: true }),
  ).toBeVisible();
  await restored
    .getByRole("textbox", { name: "SQL editor", exact: true })
    .fill("SELECT pg_sleep(60)");
  await restored.getByRole("button", { name: "Run SQL", exact: true }).click();
  await restored.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(
    restored.getByRole("button", { name: "Reconnect", exact: true }),
  ).toBeEnabled();
  await restored
    .getByRole("button", { name: "Reconnect", exact: true })
    .click();
  await expect(
    restored.getByText("Ready · saved locally", { exact: true }),
  ).toBeVisible({ timeout: 90000 });
  await restored
    .getByRole("textbox", { name: "SQL editor", exact: true })
    .fill("SELECT count(*)::int AS preserved FROM integration");
  await restored.getByRole("button", { name: "Run SQL", exact: true }).click();
  await expect(
    restored.getByRole("cell", { name: "2", exact: true }),
  ).toBeVisible({ timeout: 30000 });
  expect(errors).toEqual([]);
});

test("Excalidraw imports native images, persists scenes and exports portable drawing", async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await boot(page);
  await page.keyboard.press("Alt+2");
  const app = await launch(page, "Excalidraw");
  await expect(app.locator(".excalidraw")).toBeVisible({ timeout: 60000 });
  const dataURL =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aPyoAAAAASUVORK5CYII=";
  const drawing = {
    type: "excalidraw",
    version: 2,
    source: "test",
    elements: [
      {
        id: "test-image",
        type: "image",
        x: 100,
        y: 100,
        width: 100,
        height: 100,
        angle: 0,
        strokeColor: "transparent",
        backgroundColor: "transparent",
        fillStyle: "solid",
        strokeWidth: 1,
        strokeStyle: "solid",
        roughness: 0,
        opacity: 100,
        groupIds: [],
        frameId: null,
        roundness: null,
        seed: 1,
        version: 1,
        versionNonce: 1,
        isDeleted: false,
        boundElements: null,
        updated: 1,
        link: null,
        locked: false,
        status: "saved",
        fileId: "pixel",
        scale: [1, 1],
        crop: null,
      },
    ],
    appState: { viewBackgroundColor: "#1a1b26" },
    files: {
      pixel: {
        id: "pixel",
        dataURL,
        mimeType: "image/png",
        created: 1,
        lastRetrieved: 1,
      },
    },
  };
  await app
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "imported.excalidraw",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(drawing)),
    });
  await expect(app.getByText("Saved locally", { exact: true })).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await app.getByRole("button", { name: ".excalidraw", exact: true }).click();
  const download = await downloadPromise;
  const file = await download.path();
  const fs = await import("node:fs/promises");
  const exported = JSON.parse(await fs.readFile(file!, "utf8"));
  expect(
    exported.elements.some((e: { type: string }) => e.type === "image"),
  ).toBe(true);
  expect(exported.files.pixel.dataURL).toBe(dataURL);
  await page.reload();
  const restored = page.getByRole("region", {
    name: "Excalidraw window",
    exact: true,
  });
  await expect(restored.locator(".excalidraw")).toBeVisible({ timeout: 60000 });
  const nextDownload = page.waitForEvent("download");
  await restored
    .getByRole("button", { name: ".excalidraw", exact: true })
    .click();
  const saved = await nextDownload;
  const savedScene = JSON.parse(
    await fs.readFile((await saved.path())!, "utf8"),
  );
  expect(savedScene.files.pixel.dataURL).toBe(dataURL);
  expect(errors).toEqual([]);
});

test.describe("touch integrations", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  test("drawing and SQL controls remain inside a narrow touch window", async ({
    page,
  }) => {
    test.setTimeout(120000);
    await boot(page);
    const draw = await launch(page, "Excalidraw");
    await expect(draw.locator(".excalidraw")).toBeVisible({ timeout: 60000 });
    const bounds = await draw.locator(".integration-toolbar").boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
    await expect(
      draw.getByRole("button", { name: "PNG", exact: true }),
    ).toBeVisible();
    await page.screenshot({ path: "/tmp/oma-draw-mobile.png" });
    const db = await launch(page, "SQL Workbench");
    await expect(
      db.getByText("Ready · saved locally", { exact: true }),
    ).toBeVisible({ timeout: 90000 });
    await db.getByRole("button", { name: "Run SQL", exact: true }).tap();
    await expect(
      db.getByText("Ready · saved locally", { exact: true }),
    ).toBeVisible();
    await expect(
      db.getByRole("cell", { name: "Engineering", exact: true }),
    ).toBeVisible();
    await page.screenshot({ path: "/tmp/oma-database-mobile.png" });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
});
