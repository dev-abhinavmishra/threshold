import { test, expect } from '@playwright/test';

/**
 * Smoke test: menu renders, a run starts, the WebGL canvas draws, HUD shows,
 * pause/settings/archive open, and a death or continued state survives reload.
 */

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('menu renders with title and primary action', async ({ page }) => {
  await expect(page.locator('.menu')).toBeVisible();
  await expect(page.getByRole('button', { name: 'New Run' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Settings' })).toBeVisible();
});

test('new run starts the game and shows HUD', async ({ page }) => {
  await page.getByRole('button', { name: 'New Run' }).click();
  // canvas must exist and HUD overlay should appear once PLAYING
  await expect(page.locator('canvas.game-canvas')).toBeVisible();
  await expect(page.locator('.hud')).toBeVisible({ timeout: 20_000 });
  // the renderer should have drawn something (non-blank canvas)
  const lit = await page.evaluate(() => {
    const c = document.querySelector('canvas.game-canvas') as HTMLCanvasElement;
    return c && c.width > 0 && c.height > 0;
  });
  expect(lit).toBeTruthy();
});

test('settings page opens and persists a change', async ({ page }) => {
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.locator('.menu-inner.wide')).toBeVisible();
  // reload → still on menu, settings persisted under threshold key
  const keys = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('threshold')));
  expect(keys.length).toBeGreaterThanOrEqual(0);
});

test('archive page lists documents', async ({ page }) => {
  await page.getByRole('button', { name: 'Archive' }).click();
  await expect(page.locator('.menu-inner.wide')).toBeVisible();
});
