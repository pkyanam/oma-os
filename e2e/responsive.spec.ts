import { test, expect } from "@playwright/test";
import { boot } from "./helpers";
for (const width of [390, 800, 1280])
  test(`desktop navigation stays usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await boot(page);
    const bar = page.locator(".bar");
    const box = await bar.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeLessThanOrEqual(width);
    const overlaps = await bar.evaluate((element) => {
      const clock = element.querySelector("time")!.getBoundingClientRect();
      return Array.from(element.querySelectorAll(".bar-left button"))
        .filter((button) => {
          const r = button.getBoundingClientRect();
          const clip = button.closest("nav")?.getBoundingClientRect();
          const left = clip ? Math.max(r.left, clip.left) : r.left;
          const right = clip ? Math.min(r.right, clip.right) : r.right;
          return (
            right > left &&
            r.height > 0 &&
            left < clock.right &&
            right > clock.left
          );
        })
        .map(
          (button) => button.getAttribute("aria-label") || button.textContent,
        );
    });
    expect(overlaps).toEqual([]);
    if (width <= 900) {
      const dock = page.getByRole("navigation", {
        name: "Desktop window switcher",
      });
      await expect(dock).toBeVisible();
      await dock.getByRole("button", { name: "Files", exact: true }).click();
      await expect(
        page.getByRole("region", { name: "Files window", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("region", { name: "Terminal window", exact: true }),
      ).toBeHidden();
      await dock.getByRole("button", { name: "Terminal", exact: true }).click();
      await expect(
        page.getByRole("region", { name: "Terminal window", exact: true }),
      ).toBeVisible();
      const bounds = await dock.boundingBox();
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(845);
    } else {
      await expect(
        page.getByRole("region", { name: "Files window", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("region", { name: "Terminal window", exact: true }),
      ).toBeVisible();
    }
    await page
      .getByRole("banner")
      .getByRole("button", { name: "Open launcher", exact: true })
      .click();
    const launcher = page.getByRole("dialog", {
      name: "Launcher",
      exact: true,
    });
    await expect(launcher).toBeVisible();
    const bounds = await launcher.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    await launcher.getByRole("button", { name: "Close dialog" }).click();
    await expect(launcher).toHaveCount(0);
  });

test.describe("touch input", () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
  test("coarse pointer controls remain reachable and switch windows", async ({
    page,
  }) => {
    await boot(page);
    const bar = await page.locator(".bar").boundingBox();
    expect(bar!.height).toBeGreaterThanOrEqual(44);
    const dock = page.getByRole("navigation", {
      name: "Desktop window switcher",
    });
    const apps = dock.getByRole("button", {
      name: "Show all apps",
      exact: true,
    });
    const target = await apps.boundingBox();
    expect(target!.height).toBeGreaterThanOrEqual(44);
    expect(target!.width).toBeGreaterThanOrEqual(44);
    await dock.getByRole("button", { name: "Files", exact: true }).tap();
    await expect(
      page.getByRole("region", { name: "Files window", exact: true }),
    ).toBeVisible();
    await apps.tap();
    await expect(page.getByRole("dialog", { name: "Launcher" })).toBeVisible();
    await page.getByRole("button", { name: "Close dialog" }).tap();
    const bounds = await dock.boundingBox();
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(845);
  });
});
