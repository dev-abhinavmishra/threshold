import { test, expect } from '@playwright/test';

/**
 * Gameplay soak: a QA run survives ~15s of real input with zero page errors —
 * the net that catches a bad mill export, a foreshadow crash, or a reverb NaN.
 * Lives in its own file so the heavy WebGL browser is torn down after every
 * other spec (alphabetical order runs this one last); the trailing wait gives
 * software-GL cleanup a beat before the context closes.
 */


test('QA run plays 15s with no page errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/');
  await page.getByRole('button', { name: /QA/ }).click();
  await page.getByRole('button', { name: 'New Run' }).click();
  await expect(page.locator('.hud')).toBeVisible({ timeout: 20_000 });
  // walk forward through several rooms — triggers generation, streaming,
  // foreshadow cues, per-room reverb, and any scheduled entity spawns
  for (let i = 0; i < 15; i++) {
    await page.keyboard.down('w');
    await page.waitForTimeout(700);
    await page.keyboard.up('w');
    await page.waitForTimeout(300);
  }
  expect(errors).toEqual([]);
  await page.waitForTimeout(2500); // let SwiftShader teardown settle
});
