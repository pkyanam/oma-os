import { test, expect } from "@playwright/test";
import { boot, launch } from "./helpers";

test("first launch loads Applications without eager heavyweight runtimes", async ({
  page,
}) => {
  const requested: string[] = [];
  page.on("request", (request) => requested.push(request.url()));
  await boot(page, "/", { workspace: "applications" });
  await expect(
    page.getByRole("region", { name: "Applications window", exact: true }),
  ).toBeVisible();
  await expect(page.locator("[data-app]")).toHaveCount(1);
  const heavy =
    /(?:monaco|editor\.worker|shell\.worker|python-worker|pyodide|pglite|excalidraw)/i;
  expect(requested.filter((url) => heavy.test(url))).toEqual([]);
  await launch(page, "Terminal");
  await expect(
    page.getByRole("region", { name: "Terminal window", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("region", { name: "Applications window", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Terminal window", exact: true }),
  ).toBeVisible();
});
