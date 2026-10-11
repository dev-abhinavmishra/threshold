import { test, expect } from '@playwright/test';
import { seededRun, ThresholdG } from './harness';

test.setTimeout(300_000);

// Sprint 693 — the rail forgets in the glass.
// The caption rail used to hold its last reads forever: a stale tell
// lingered after the room went quiet, reading as if it just happened.
// s691 wired the rail through visibleCaptions (dwell by severity, ×N
// fold, 3-line cap); this leg verifies it in the running game — in the
// DOM, not the unit.
test('the rail ages reads out, folds repeats and caps its lines', async ({ page }) => {
  await seededRun(page, 'rail-693');
  await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    g.godMode = true;
    // The rail only renders when the captions setting is on — flip it
    // through the real path so the store + audio both see it.
    const gs = g as unknown as { applySettings(s: unknown): void; settings: Record<string, unknown> };
    gs.applySettings({ ...gs.settings, captions: true });
    // Ambient cues caption during play; only this leg's reads may land
    // in the store, or the asserts below race the room's own tells.
    const audio = g.audio as unknown as {
      emitCaption(text: string, severity?: string): void;
      play(cue: string, at: null, caption: string, severity: string): void;
    };
    const orig = audio.emitCaption.bind(audio);
    audio.emitCaption = (text: string, severity?: string) => {
      if (String(text).startsWith('rail-')) orig(text, severity);
    };
  });

  const railLines = page.locator('.captions .caption');

  // ×N fold — one repeated tell rides the rail as a single counted line.
  await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    const audio = g.audio as unknown as { play(c: string, a: null, t: string, s: string): void };
    for (let i = 0; i < 4; i++) audio.play('uiTick', null, 'rail-fold', 'warn');
  });
  await page.waitForFunction(
    () => {
      (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame.frame();
      return document.querySelectorAll('.captions .caption').length === 1;
    },
    undefined,
    { timeout: 30_000 },
  );
  await expect(railLines.first()).toContainText('rail-fold');
  await expect(railLines.first()).toContainText('×4');

  // Cap — a burst of distinct reads keeps only the newest three.
  await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    const audio = g.audio as unknown as { play(c: string, a: null, t: string, s: string): void };
    for (let i = 0; i < 5; i++) audio.play('uiTick', null, `rail-cap-${i}`, 'info');
  });
  await page.waitForFunction(
    () => {
      (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame.frame();
      const els = document.querySelectorAll('.captions .caption');
      return els.length === 3 && els[2].textContent?.includes('rail-cap-4');
    },
    undefined,
    { timeout: 30_000 },
  );
  await expect(railLines).toHaveCount(3);
  await expect(railLines.first()).toContainText('rail-cap-2');

  // Expiry — everything on the rail right now is 'info' (4.2s dwell).
  // Wait it out with frame-steps so the store keeps re-publishing and
  // the read dies of old age rather than a new emit.
  await page.waitForFunction(
    () => {
      (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame.frame();
      return document.querySelectorAll('.captions .caption').length === 0;
    },
    undefined,
    { timeout: 30_000 },
  );
});
