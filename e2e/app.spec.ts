import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function loadDemo(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try the old-photo demo' }).click();
  await expect(page.locator('.summary')).toBeVisible({ timeout: 60_000 });
}

/** A PNG drawn in the page at a given size from a 0..1 drawing function. */
async function makePng(page: Page, width: number, height: number, blur = 0): Promise<Buffer> {
  const base64 = await page.evaluate(
    ({ width, height, blur }) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.scale(width / 400, height / 300);
      if (blur) ctx.filter = `blur(${blur}px)`;
      ctx.fillStyle = '#d8d0c4';
      ctx.fillRect(0, 0, 400, 300);
      ctx.fillStyle = '#6b5a4c';
      ctx.fillRect(60, 80, 160, 170);
      ctx.fillStyle = '#2f3b44';
      ctx.fillRect(250, 60, 100, 120);
      ctx.fillStyle = '#9fb8c8';
      ctx.beginPath();
      ctx.arc(300, 230, 40, 0, Math.PI * 2);
      ctx.fill();
      return canvas.toDataURL('image/png').split(',')[1];
    },
    { width, height, blur },
  );
  return Buffer.from(base64, 'base64');
}

test('demo: support score, classes and regions', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await loadDemo(page);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('.summary h2')).toHaveText('Some details need review');
  await expect(page.locator('.fact', { hasText: 'Comparison' })).toContainText('Lightness only');
  await expect(page.locator('.fact', { hasText: 'Sampling scale' })).toContainText('4.0×');
  await expect(page.locator('.region.c-contradicted').first()).toBeVisible();
  await expect(page.locator('.region.c-invented').first()).toBeVisible();
  await expect(page.locator('.region').first().locator('.crop')).toHaveCount(2);
  expect(errors).toEqual([]);
});

test('views, highlighting and the colour comparison', async ({ page }) => {
  await loadDemo(page);
  for (const name of ['Support map', 'Source', 'Restoration', 'Swipe']) {
    await page.getByRole('tab', { name }).click();
    await expect(page.getByRole('tab', { name })).toHaveAttribute('aria-selected', 'true');
  }
  await page.locator('.region').first().getByRole('button', { name: 'Highlight' }).click();
  await expect(page.locator('.region.active')).toHaveCount(1);
  // Comparing colour against a sepia source counts the colourization as contradiction.
  await page.getByRole('radio', { name: 'Colour' }).click();
  await expect(page.locator('.summary h2')).toHaveText('Many details need review');
  await page.getByRole('radio', { name: 'Lightness only' }).click();
  await expect(page.locator('.summary h2')).toHaveText('Some details need review');
});

test('focus areas summarize what supports a detail', async ({ page }) => {
  await loadDemo(page);
  const stage = page.locator('#stage');
  const box = (await stage.boundingBox())!;
  // The face in the doorway sits around (870, 555) of the 1280 × 960 frame.
  const at = (x: number, y: number) =>
    [box.x + (x / 1280) * box.width, box.y + (y / 960) * box.height] as const;
  await page.mouse.move(...at(815, 500));
  await page.mouse.down();
  await page.mouse.move(...at(925, 610), { steps: 4 });
  await page.mouse.up();
  const focus = page.locator('.focus li');
  await expect(focus).toHaveCount(1);
  const invented = await focus.locator('.bar-row.c-invented .bar-value').textContent();
  expect(Number.parseInt(invented ?? '0', 10)).toBeGreaterThan(8);
  await focus.getByRole('button', { name: 'Remove' }).click();
  await expect(page.locator('.focus li')).toHaveCount(0);
});

test('exports a JSON report and two PNG images', async ({ page }) => {
  await loadDemo(page);
  const wait = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Report (JSON)' }).click();
  const report = JSON.parse(await readFile((await (await wait).path())!, 'utf8'));
  expect(report.tool.name).toBe('Invented Detail');
  expect(report.resolutionGain).toBeCloseTo(4, 1);
  expect(report.regions.some((r: { kind: string }) => r.kind === 'contradicted')).toBe(true);
  expect(report.regions[0].boxInOutput.width).toBeGreaterThan(0);
  for (const [name, file] of [
    ['Comparison sheet (PNG)', 'invented-detail-comparison.png'],
    ['Support map (PNG)', 'invented-detail-map.png'],
  ]) {
    const next = page.waitForEvent('download');
    await page.getByRole('button', { name }).click();
    const download = await next;
    expect(download.suggestedFilename()).toBe(file);
    expect((await readFile((await download.path())!)).subarray(1, 4).toString()).toBe('PNG');
  }
});

test('a plain enlargement of the source is mostly supported', async ({ page }) => {
  await page.goto('/');
  const small = await makePng(page, 200, 150, 0.6);
  const large = await makePng(page, 800, 600, 2.4);
  await page
    .locator('#file-source')
    .setInputFiles({ name: 'scan.png', mimeType: 'image/png', buffer: small });
  await page
    .locator('#file-output')
    .setInputFiles({ name: 'upscaled.png', mimeType: 'image/png', buffer: large });
  await expect(page.locator('.summary h2')).toHaveText('Mostly consistent with the source', {
    timeout: 60_000,
  });
});

test('a stale decode cannot replace a newer file or the demo', async ({ page }) => {
  await page.addInitScript(() => {
    const original = window.createImageBitmap.bind(window);
    const gates = window as unknown as { releaseDecode?: () => void };
    window.createImageBitmap = (async (file: Blob, options?: ImageBitmapOptions) => {
      if (file instanceof File && file.name === 'slow.png')
        await new Promise<void>((resolve) => {
          gates.releaseDecode = resolve;
        });
      return original(file, options);
    }) as typeof createImageBitmap;
  });
  await page.goto('/');
  const image = await makePng(page, 200, 150);
  const source = page.locator('#file-source');
  await source.setInputFiles({ name: 'slow.png', mimeType: 'image/png', buffer: image });
  await source.setInputFiles({ name: 'new.png', mimeType: 'image/png', buffer: image });
  await expect(page.locator('#name-source')).toContainText('new.png');
  await page.evaluate(() => (window as unknown as { releaseDecode: () => void }).releaseDecode());
  await page.waitForTimeout(100);
  await expect(page.locator('#name-source')).toContainText('new.png');
  await source.setInputFiles({ name: 'slow.png', mimeType: 'image/png', buffer: image });
  await page.getByRole('button', { name: 'Try the old-photo demo' }).click();
  await page.evaluate(() => (window as unknown as { releaseDecode: () => void }).releaseDecode());
  await expect(page.locator('.summary')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('.ws-head h1')).toContainText('demo-old-photo.png');
  await expect(page.locator('.ws-head h1')).not.toContainText('slow.png');
});

test('rejects images too small to produce classified interior tiles', async ({ page }) => {
  await page.goto('/');
  await page.locator('#file-source').setInputFiles({
    name: 'tiny.png',
    mimeType: 'image/png',
    buffer: await makePng(page, 8, 8),
  });
  await expect(page.locator('#intro-error')).toContainText('too small or narrow');
  await expect(page.locator('.summary')).toHaveCount(0);
});

test('original-file resolution is preserved when source analysis is downscaled', async ({ page }) => {
  await page.goto('/');
  const image = await makePng(page, 2048, 1536, 1.2);
  await page
    .locator('#file-source')
    .setInputFiles({ name: 'original.png', mimeType: 'image/png', buffer: image });
  await page
    .locator('#file-output')
    .setInputFiles({ name: 'same-size.png', mimeType: 'image/png', buffer: image });
  await expect(page.locator('.fact', { hasText: 'Sampling scale' })).toContainText('1.0×', {
    timeout: 60_000,
  });
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Report (JSON)' }).click();
  const report = JSON.parse(await readFile((await (await download).path())!, 'utf8'));
  expect(report.resolutionGain).toBeCloseTo(1, 1);
  expect(report.additionalPixelShare).toBeLessThan(0.02);
  expect(report.files.source.width).toBe(2048);
  expect(report.analysisSizes.source.width).toBe(1024);
});

test('small comparisons export room for all four legend labels', async ({ page }) => {
  await page.goto('/');
  await page.locator('#file-source').setInputFiles({
    name: 'small.png',
    mimeType: 'image/png',
    buffer: await makePng(page, 64, 48),
  });
  await page.locator('#file-output').setInputFiles({
    name: 'restored.png',
    mimeType: 'image/png',
    buffer: await makePng(page, 128, 96),
  });
  await expect(page.locator('.summary')).toBeVisible({ timeout: 60_000 });
  for (const name of ['Support map (PNG)', 'Comparison sheet (PNG)']) {
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name }).click();
    const png = await readFile((await (await download).path())!);
    expect(png.readUInt32BE(16)).toBeGreaterThanOrEqual(720);
  }
});

test('undecodable files explain themselves and the phone layout fits', async ({ page }) => {
  await page.goto('/');
  await page
    .locator('#file-source')
    .setInputFiles({ name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('nope') });
  await expect(page.locator('#intro-error')).toContainText('could not be decoded');
  await page.setViewportSize({ width: 390, height: 844 });
  await loadDemo(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});
