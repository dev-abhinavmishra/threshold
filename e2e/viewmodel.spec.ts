import { test, expect } from '@playwright/test';

/** Held viewmodel — the equipped slot item renders in-hand, the lit lamp
 *  overrides to hold the beam source, and slot presses play a use motion.
 *  Inventory is checkpoint-seeded (addInitScript before load) so no live
 *  evaluate races start()'s async inventory reset — SwiftShader's main
 *  thread is already starving. */

test('equipped slot item renders in-hand; lit lamp takes the hand for its beam', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('threshold.run.v1', JSON.stringify({
      seedText: 'viewmodel-seed',
      difficulty: 'qa',
      roomIndex: 0,
      underIndex: 0,
      inUnderscript: false,
      health: 100,
      imprints: 0,
      marginalia: 0,
      inventory: [
        { id: 'doorKey', count: 1 },
        { id: 'handLamp', count: 80 },
      ],
      stats: {
        startedAt: 0, endedAt: 0, deaths: 0, retries: 0, roomsVisited: 1,
        imprintsEarned: 0, marginaliaEarned: 0, entityEncounters: {},
        underscriptDeepest: 0, underscriptCompleted: false,
      },
    }));
  });
  await page.goto('/?debug');
  await page.getByRole('button', { name: /QA/ }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click({ force: true });
  await expect(page.locator('.hud')).toBeVisible({ timeout: 30_000 });

  // equip the brass key and let a few frames run (SwiftShader game-time lags
  // wall clock — give the raise/sequence room to land)
  await page.keyboard.press('Digit1');
  await page.waitForTimeout(2000);
  await page.keyboard.press('KeyF');
  await page.waitForTimeout(1500);
  await page.keyboard.press('KeyF');
  await page.waitForTimeout(1500);

  const s = await page.evaluate(() => {
    const g = (window as unknown as {
      __thresholdGame: {
        lampOn: boolean;
        beamGroup: { visible: boolean } | null;
        heldView: {
          group: { visible: boolean };
          item: { children: unknown[] };
          itemId: string | null;
          raiseT: number;
          useT: number;
        };
      };
    }).__thresholdGame;
    return {
      itemId: g.heldView.itemId,
      visible: g.heldView.group.visible,
      kids: g.heldView.item.children.length,
      raise: g.heldView.raiseT,
      lampOn: g.lampOn,
      beam: !!g.beamGroup?.visible,
    };
  });
  // lamp was lit then killed — equipped slot is back in hand, beam is off
  expect(s.itemId).toBe('doorKey');
  expect(s.visible).toBe(true);
  expect(s.kids).toBeGreaterThan(0);
  expect(s.raise).toBeGreaterThan(0);
  expect(s.lampOn).toBe(false);
  expect(s.beam).toBe(false);
});

test('lit lamp takes the hand while its beam is on', async ({ page }) => {
  // the resume's GLB decode flood has measured >90s under contention —
  // this leg gets the budget to survive it cold
  test.setTimeout(210_000);
  await page.addInitScript(() => {
    localStorage.setItem('threshold.run.v1', JSON.stringify({
      seedText: 'viewmodel-seed',
      difficulty: 'qa',
      roomIndex: 0,
      underIndex: 0,
      inUnderscript: false,
      health: 100,
      imprints: 0,
      marginalia: 0,
      inventory: [
        { id: 'doorKey', count: 1 },
        { id: 'handLamp', count: 80 },
      ],
      stats: {
        startedAt: 0, endedAt: 0, deaths: 0, retries: 0, roomsVisited: 1,
        imprintsEarned: 0, marginaliaEarned: 0, entityEncounters: {},
        underscriptDeepest: 0, underscriptCompleted: false,
      },
    }));
  });
  await page.goto('/?debug');
  await page.getByRole('button', { name: /QA/ }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click({ force: true });
  await expect(page.locator('.hud')).toBeVisible({ timeout: 30_000 });
  // assert JS-side flags only — stub the renderer before any frame step so a
  // degraded shared GPU process can't wedge the page's main thread
  await page.evaluate(() => {
    (window as unknown as { __thresholdGame: { renderFrame(): void } }).__thresholdGame.renderFrame = () => {};
  });

  // equip the key first, then light the lamp — the lamp must take the hand.
  // KeyF only binds while phase === 'PLAYING'; on a cold resume the async
  // boot + GLB decode flood can hold a pre-PLAYING phase for a stretch and
  // any press landing in the gap is silently dropped. clock.time only
  // advances while the sim runs — and the runner's RAF can die outright
  // under load (observed: lastFrameNow frozen at boot+4.5s while the event
  // loop lived) — so step the sim manually with frame() until it ticks,
  // then the press is guaranteed to bind.
  const bootT = await page.evaluate(() => (window as unknown as {
    __thresholdGame: { clock: { time: number } };
  }).__thresholdGame.clock.time);
  await page.waitForFunction((t0) => {
    const g = (window as unknown as {
      __thresholdGame: { clock: { time: number }; frame(): void };
    }).__thresholdGame;
    if (g.clock.time <= t0) g.frame(); // manual tick when RAF starves
    return g.clock.time > t0;
  }, bootT, { timeout: 150_000, polling: 250 });
  await page.keyboard.press('Digit1');
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('KeyF');
    const on = await page.evaluate(() => (window as unknown as {
      __thresholdGame: { lampOn: boolean };
    }).__thresholdGame.lampOn);
    if (on) break;
    await page.waitForTimeout(1500);
  }
  // the beam flag and the held-item swap only apply on a sim frame — keep
  // stepping frame() inside the poll so a dead RAF can't wedge the leg
  await page.waitForFunction(() => {
    const g = (window as unknown as {
      __thresholdGame: {
        lampOn: boolean;
        beamGroup: { visible: boolean } | null;
        frame(): void;
      };
    }).__thresholdGame;
    if (!(g.lampOn && g.beamGroup?.visible)) g.frame();
    return g.lampOn && g.beamGroup?.visible === true;
  }, null, { timeout: 150_000, polling: 250 });

  const s = await page.evaluate(() => {
    const g = (window as unknown as {
      __thresholdGame: {
        lampOn: boolean;
        beamGroup: { visible: boolean } | null;
        heldView: { group: { visible: boolean }; itemId: string | null };
      };
    }).__thresholdGame;
    return { held: g.heldView.itemId, vis: g.heldView.group.visible, on: g.lampOn, beam: !!g.beamGroup?.visible };
  });
  expect(s.on).toBe(true);
  expect(s.beam).toBe(true);
  expect(s.held).toBe('handLamp');
  expect(s.vis).toBe(true);
});
