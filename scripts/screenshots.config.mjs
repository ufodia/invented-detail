/** Screens captured for the README. Every image shows the synthetic old-photo demo. */
const demo = async (page) => {
  await page.getByRole('button', { name: 'Try the old-photo demo' }).click();
  await page.locator('.summary').waitFor({ timeout: 60_000 });
};
const view = async (page, name) => {
  await page.getByRole('tab', { name }).click();
  await page.waitForTimeout(200);
};
const focusFace = async (page) => {
  const box = await page.locator('#stage').boundingBox();
  const at = (x, y) => [box.x + (x / 1280) * box.width, box.y + (y / 960) * box.height];
  await page.mouse.move(...at(815, 500));
  await page.mouse.down();
  await page.mouse.move(...at(925, 610), { steps: 4 });
  await page.mouse.up();
};

export default {
  shots: [
    {
      file: 'docs/assets/screenshot-home.png',
      viewport: { width: 1440, height: 980 },
      prepare: async () => {},
    },
    {
      file: 'docs/assets/screenshot-support.png',
      viewport: { width: 1440, height: 1000 },
      prepare: async (page) => {
        await demo(page);
        await view(page, 'Support map');
      },
    },
    {
      file: 'docs/assets/screenshot-swipe.png',
      viewport: { width: 1440, height: 1000 },
      prepare: async (page) => {
        await demo(page);
        await page.locator('#view-range').fill('55');
      },
    },
    {
      file: 'docs/assets/screenshot-panel.png',
      viewport: { width: 1440, height: 2600 },
      prepare: async (page) => {
        await demo(page);
        await focusFace(page);
      },
      element: '.panel',
    },
    {
      file: 'docs/assets/screenshot-mobile.png',
      viewport: { width: 390, height: 844 },
      scale: 2,
      prepare: async (page) => {
        await demo(page);
        await view(page, 'Support map');
      },
    },
  ],
  cards: [{ source: 'docs/assets/social-card.svg', file: 'public/og-image.png', width: 1200, height: 630 }],
};
