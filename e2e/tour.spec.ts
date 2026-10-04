import { test } from '@playwright/test';
import fs from 'fs';

/** Visual tour: ?debug panel jump teleports into chosen rooms (prod-safe). */
// Opt-in visual survey (SwiftShader screenshot timing is flaky): TOUR=1 npx playwright test e2e/tour.spec.ts
(process.env.TOUR ? test : test.skip)('teleport captures', async ({ page }) => {
  test.setTimeout(280_000);
  fs.mkdirSync('/tmp/tourshots', { recursive: true });
  const rooms = (process.env.TOUR_ROOMS ?? '0,2,4').split(',').map(Number);
  await page.goto('/?debug');
  await page.getByRole('button', { name: 'New Run' }).click();
  page.on('crash', () => console.log('PAGE CRASHED'));
  page.on('pageerror', e => console.log('PAGEERR', e.message));
  await page.locator('.hud').waitFor({ timeout: 30_000 });
  await page.waitForTimeout(2500);
    for (const idx of rooms) {
    console.log('jump', idx);
    await page.evaluate((i) => {
      const inp = document.querySelector('#dbg-jump') as HTMLInputElement | null;
      if (inp) inp.value = String(i);
      (document.querySelector('#dbg-go') as HTMLButtonElement | null)?.click();
    }, idx);
    await page.waitForTimeout(2600);
    await page.screenshot({ path: `/tmp/tourshots/r${idx}.jpg`, type: 'jpeg', quality: 55, timeout: 60_000 });
    console.log('shot room', idx);
  }
});
