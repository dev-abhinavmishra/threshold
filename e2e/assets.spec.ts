import { test, expect } from '@playwright/test';

/**
 * Asset regression: every vendored/milled model the modelLibrary can reach
 * must be served (a missing GLB is a silent fallback). The gameplay soak is
 * in soak.spec.ts, which runs after this file.
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
  'doorChain', 'tollPlate',
  'plinth', 'displayCase', 'ropeBarrier', 'exhibitLabel', 'libraryLadder',
  'cageLocker', 'bellCart', 'teaTrolley', 'bedBench', 'radiatorTall',
  'linenHamper', 'basinSink', 'pegRail', 'towelRail', 'ceilingHook',
  'ovalMirror',
  'curtainRod', 'curtainLong', 'headboard', 'stoveRange', 'potRack',
  'dishDrainer', 'linenShelf', 'choppingBlock', 'copperSet', 'manglePress',
  'chapelPew', 'prayerKneeler', 'chapelAltar', 'votiveStand',
  'candelabrum', 'settee', 'dressingScreen', 'vanityTable', 'sideboard',
  'writingDesk', 'globeStand',
  'cubicle', 'recordsCage', 'printerRow', 'printer', 'typewriter',
  'waterCooler', 'breakTable', 'counter', 'machineBox', 'paperStack',
  'partition', 'fluoroTube', 'exitSign', 'vendingUnit', 'keyCabinet',
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

// The 15s gameplay soak lives in soak.spec.ts — it runs last so its heavy
// browser teardown can't starve other specs' context setup under software GL.
