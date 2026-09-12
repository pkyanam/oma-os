import { test, expect, type Download } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { boot, launch } from './helpers';
async function bytes(download: Download) {
  const path = await download.path();
  expect(path).toBeTruthy();
  return readFile(path!);
}

test('Canvas draws a shape, persists edits and exports editable geometry', async ({ page }) => {
  await boot(page, '/', { workspace: 'applications' });
  await page.keyboard.press('Alt+2');
  let app = await launch(page, 'Canvas');
  await app.getByRole('textbox', { name: 'Board title' }).fill('Persistent geometry');
  await app.getByRole('button', { name: 'Rectangle', exact: true }).click();
  const surface = app.getByRole('application', { name: 'Drawing canvas' });
  const box = await surface.boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.move(box!.x + box!.width * .3, box!.y + box!.height * .3);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width * .6, box!.y + box!.height * .6, { steps: 8 });
  await page.mouse.up();
  await expect(app).toContainText('1 objects');
  await expect(app.getByText('Saved locally', { exact: true })).toBeVisible();
  await page.reload();
  app = page.getByRole('region', { name: 'Canvas window', exact: true });
  await expect(app.getByRole('textbox', { name: 'Board title' })).toHaveValue('Persistent geometry');
  await expect(app).toContainText('1 objects');
  await app.getByRole('button', { name: 'Export canvas' }).click();
  const pending = page.waitForEvent('download');
  await app.getByRole('button', { name: 'Editable JSON' }).click();
  const board = JSON.parse((await bytes(await pending)).toString());
  expect(board.title).toBe('Persistent geometry');
  expect(board.shapes).toHaveLength(1);
  expect(board.shapes[0].kind).toBe('rect');
});

test('Data imports quoted CSV, saves edits and exports a roundtrip document', async ({ page }) => {
  await boot(page, '/', { workspace: 'applications' });
  await page.keyboard.press('Alt+2');
  let app = await launch(page, 'Data');
  await app.locator('input[type=file]').setInputFiles({ name:'roundtrip.csv', mimeType:'text/csv', buffer:Buffer.from('name,value\n"Alpha, Inc",12\nBeta,34\n') });
  await expect(app.getByRole('textbox', { name:'Row 1, name', exact:true })).toHaveValue('Alpha, Inc');
  await app.getByRole('textbox', { name:'Row 2, value', exact:true }).fill('68');
  await app.getByRole('button', { name:'Save', exact:true }).click();
  await expect(app).toContainText('Saved /home/guest/Documents/roundtrip.csv');
  await page.reload();
  app = page.getByRole('region', { name:'Data window', exact:true });
  await app.getByRole('textbox', { name:'CSV file path' }).fill('/home/guest/Documents/roundtrip.csv');
  await app.getByRole('button', { name:'Open', exact:true }).click();
  await expect(app.getByRole('textbox', { name:'Row 2, value', exact:true })).toHaveValue('68');
  const pending = page.waitForEvent('download');
  await app.getByRole('button', { name:'Export', exact:true }).click();
  const exported = await bytes(await pending);
  expect(exported.toString()).toContain('"Alpha, Inc"');
  await app.locator('input[type=file]').setInputFiles({ name:'again.csv', mimeType:'text/csv', buffer:exported });
  await expect(app.getByRole('textbox', { name:'Row 1, name', exact:true })).toHaveValue('Alpha, Inc');
  await expect(app.getByRole('textbox', { name:'Row 2, value', exact:true })).toHaveValue('68');
});

test('Media decodes a real imported image and downloads identical original bytes', async ({ page }) => {
  await boot(page, '/', { workspace:'applications' });
  await page.keyboard.press('Alt+2');
  const app = await launch(page, 'Media');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aPyoAAAAASUVORK5CYII=', 'base64');
  await app.locator('input[type=file]').setInputFiles({ name:'actual-image.png', mimeType:'image/png', buffer:png });
  const img = app.locator('img');
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(1);
  await app.getByRole('button', { name:'Rotate image' }).click();
  await app.getByRole('button', { name:'Zoom in' }).click();
  const pending = page.waitForEvent('download');
  await app.getByRole('button', { name:'Download file' }).click();
  expect(await bytes(await pending)).toEqual(png);
});
