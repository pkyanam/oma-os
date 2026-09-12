import { test, expect } from "@playwright/test";
import { boot, launch } from "./helpers";
test("Python core and NumPy load lazily through the same-origin pinned gateway", async ({
  page,
  context,
}) => {
  test.setTimeout(180_000);
  const requests: string[] = [];
  context.on("request", (request) => requests.push(request.url()));
  await context.route("https://cdn.jsdelivr.net/pyodide/**", (route) =>
    route.abort(),
  );
  await boot(page);
  expect(
    requests.filter((url) => url.includes("/runtime/pyodide/")),
  ).toHaveLength(0);
  const lab = await launch(page, "Python Lab");
  await page.keyboard.press("Alt+f");
  await lab
    .getByRole("textbox", { name: "Python source", exact: true })
    .fill(
      'import numpy as np\nprint("numpy-gateway:", int(np.arange(10).sum()))\n',
    );
  await lab.getByRole("button", { name: "Run", exact: true }).click();
  await expect(lab.getByRole("log")).toContainText("numpy-gateway: 45", {
    timeout: 120_000,
  });
  await expect(lab.getByRole("status")).toContainText("Finished");
  const assets = requests.filter((url) =>
    url.includes("/runtime/pyodide/v314.0.6/"),
  );
  for (const name of [
    "pyodide.mjs",
    "pyodide.asm.mjs",
    "pyodide.asm.wasm",
    "python_stdlib.zip",
    "pyodide-lock.json",
    "numpy-2.4.6-cp314-cp314-pyemscripten_2026_0_wasm32.whl",
  ])
    expect(
      assets.some((url) => url.endsWith("/" + name)),
      name,
    ).toBe(true);
  expect(
    requests.filter((url) =>
      url.startsWith("https://cdn.jsdelivr.net/pyodide/"),
    ),
  ).toHaveLength(0);
});
