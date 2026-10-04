import { test, expect } from '@playwright/test';

/**
 * Asset + deep-run regression: every vendored/milled model the modelLibrary
 * can reach must be served (a missing GLB is a silent fallback), and a QA
 * run must survive ~15s of real gameplay with zero page errors — this is the
 * net that catches a bad mill export, a foreshadow crash, or a reverb NaN.
 */

const MILL_DIRS = [
  'archway', 'colonnade', 'vault', 'medallion', 'portcullis', 'hatch',
  'wallVent', 'stackShelf', 'boilerDrum', 'pipeManifold', 'breakerPanel',
  'scissorgate', 'balustrade', 'fireplace', 'windowArch', 'wardrobe',
  'dresser', 'nightstand', 'doorLeaf',
  'boneArch', 'toppledColumn', 'wallNiche', 'stairGate',
  'transomWindow', 'bookCart', 'radiatorFin', 'dumbwaiter', 'ironGrate',
  'keyRack', 'counterBell', 'luggageRack', 'doorPlaque',
  'hallTree', 'umbrellaStand', 'washStand', 'mailCart', 'podiumLectern',
  'conduitRun', 'sumpPump', 'hangingCable', 'ductRun',
];

const FIGURES = [
  'quaternius_hooded.glb', 'quaternius_ghostskull.glb',
  'quaternius_skeleton.glb', 'quaternius_ghost.glb', 'quaternius_demon.glb',
  'quaternius_orc.glb', 'quaternius_wizard.glb', 'quaternius_yeti.glb',
];

test('all milled and rigged assets are served', async ({ request }) => {
  const missing: string[] = [];
  for (const dir of MILL_DIRS) {
    const r = await request.get(`/assets/models/${dir}/model.gltf`);
    if (!r.ok()) missing.push(dir);
  }
  for (const f of FIGURES) {
    const r = await request.get(`/assets/figures/${f}`);
    if (!r.ok()) missing.push(f);
  }
  expect(missing).toEqual([]);
});

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
});
