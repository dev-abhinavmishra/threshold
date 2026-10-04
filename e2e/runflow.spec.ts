import { test, expect } from '@playwright/test';

/**
 * Run-flow regression: the death → retry loop must work end-to-end on the
 * production build. `?debug` exposes the game handle so the suite can force a
 * deterministic kill instead of driving a sighted entity to a killing blow.
 */


test('death shows the death screen and retry restarts the run', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?debug');
  await page.getByRole('button', { name: /QA/ }).click();
  await page.getByRole('button', { name: 'New Run' }).click();
  await expect(page.locator('.hud')).toBeVisible({ timeout: 20_000 });
  await page.waitForFunction(() => (window as unknown as { __thresholdGame?: unknown }).__thresholdGame);

  // Force a kill — private at compile time, reachable at runtime.
  await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: { damagePlayer(n: number, s: string, h: string): void } }).__thresholdGame;
    g.damagePlayer(999, 'sweep', 'test kill');
  });

  await expect(page.locator('.overlay.death')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.death-title')).toHaveText('The threshold keeps you');

  // force: the death overlay fades in, so the button never reports 'stable'
  await page.getByRole('button', { name: 'Retry from checkpoint' }).click({ force: true });
  await expect(page.locator('.hud')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.overlay.death')).toHaveCount(0);

  // A second kill must still work — proves the retried run is live, not a ghost.
  await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: { damagePlayer(n: number, s: string, h: string): void } }).__thresholdGame;
    g.damagePlayer(999, 'sweep', 'test kill 2');
  });
  await expect(page.locator('.overlay.death')).toBeVisible({ timeout: 10_000 });
  expect(errors).toEqual([]);
});

test('quit to menu keeps the checkpoint; Continue resumes the run', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?debug');
  await page.getByRole('button', { name: /QA/ }).click();
  await page.getByRole('button', { name: 'New Run' }).click();
  await expect(page.locator('.hud')).toBeVisible({ timeout: 20_000 });

  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Quit to Menu' }).click({ force: true });
  await expect(page.locator('.menu-inner')).toBeVisible({ timeout: 10_000 });

  // Checkpoint was written at run start — the menu must offer Continue.
  await page.getByRole('button', { name: 'Continue', exact: true }).click({ force: true });
  await expect(page.locator('.hud')).toBeVisible({ timeout: 20_000 });
  expect(errors).toEqual([]);
});

test('underscript entry streams the subfloor and walks clean', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/?debug');
  await page.getByRole('button', { name: /QA/ }).click();
  await page.getByRole('button', { name: 'New Run' }).click();
  await expect(page.locator('.hud')).toBeVisible({ timeout: 20_000 });
  await page.waitForFunction(() => (window as unknown as { __thresholdGame?: unknown }).__thresholdGame);

  // Jump the threshold — enterUnderscript teleports into U-000 and checkpoints.
  const space = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: { enterUnderscript(): void; space: string } }).__thresholdGame;
    g.enterUnderscript();
    return g.space;
  });
  expect(space).toBe('under');

  for (let i = 0; i < 8; i++) {
    await page.keyboard.down('w');
    await page.waitForTimeout(650);
    await page.keyboard.up('w');
    await page.waitForTimeout(250);
  }
  expect(errors).toEqual([]);
});

test('victory shows the completion screen and returns to menu', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?debug');
  await page.getByRole('button', { name: /QA/ }).click();
  await page.getByRole('button', { name: 'New Run' }).click();
  await expect(page.locator('.hud')).toBeVisible({ timeout: 20_000 });
  await page.waitForFunction(() => (window as unknown as { __thresholdGame?: unknown }).__thresholdGame);

  // Crossing the Engine threshold is a hundred-room walk — force the same
  // code path the milestone calls.
  await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: { victory(): void } }).__thresholdGame;
    g.victory();
  });
  await expect(page.locator('.overlay.victory')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.victory-title')).toHaveText('The hundredth door closes behind you');

  await page.getByRole('button', { name: 'Return to threshold' }).click({ force: true });
  await expect(page.locator('.menu-inner')).toBeVisible({ timeout: 10_000 });
  expect(errors).toEqual([]);
});
