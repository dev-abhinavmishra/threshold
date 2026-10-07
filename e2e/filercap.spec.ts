import { test } from '@playwright/test';
import { seededRun } from './harness';
import fs from 'fs';

/** Opt-in visual capture: Filer desk + tray in her under room. FILERCAP=1 */
(process.env.FILERCAP ? test : test.skip)('filer desk capture', async ({ page }) => {
  test.setTimeout(280_000);
  fs.mkdirSync('/tmp/tourshots', { recursive: true });
  page.on('crash', () => console.log('PAGE CRASHED'));
  await seededRun(page, 's');
  const info = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: never }).__thresholdGame as {
      enterUnderscript(): void; godMode: boolean; currentRoom: number;
      player: { teleport(x: number, y: number, z: number, yaw?: number): void; pos: { x: number; y: number; z: number }; yaw: number; pitch: number };
      interaction: { interactables: { kind: string; pos: { x: number; y: number; z: number } }[] };
      route: { underRooms: { index: number; origin: { x: number; z: number }; scheduled?: { entity: string }[] }[] };
    };
    const ga = g;
    ga.enterUnderscript();
    ga.godMode = true;
    const fRoom = g.route.underRooms.find((r: { scheduled?: { entity: string }[] }) => r.scheduled?.some((s) => s.entity === 'filer'));
    if (!fRoom) return null;
    g.player.teleport(fRoom.origin.x, 0, fRoom.origin.z);
    ga.currentRoom = fRoom.index;
    return fRoom.index;
  });
  if (info == null) { console.log('no filer'); return; }
  // let RAF present naturally — real-time waits, not manual frames
  await page.waitForTimeout(9000);
  const docket = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: never }).__thresholdGame as {
      currentRoom: number;
      player: { teleport(x: number, y: number, z: number, yaw?: number): void; pos: { x: number; y: number; z: number }; yaw: number; pitch: number };
      interaction: { interactables: { kind: string; pos: { x: number; y: number; z: number } }[] };
      route: { underRooms: { index: number; origin: { x: number; z: number }; scheduled?: { entity: string }[] }[] };
    };
    const d = g.interaction.interactables.find((i: { kind: string }) => i.kind === 'docket');
    if (!d) return null;
    const fRoom = g.route.underRooms.find((r: { index: number }) => r.index === g.currentRoom);
    if (!fRoom) return null;
    const dx = fRoom.origin.x - d.pos.x, dz = fRoom.origin.z - d.pos.z;
    const dl = Math.hypot(dx, dz) || 1;
    g.player.teleport(d.pos.x + (dx / dl) * 3.4, 0, d.pos.z + (dz / dl) * 3.4);
    g.player.yaw = Math.atan2(d.pos.x - g.player.pos.x, d.pos.z - g.player.pos.z);
    g.player.pitch = -0.06;
    return true;
  });
  await page.waitForTimeout(6000);
  await page.screenshot({ path: '/tmp/tourshots/filer.jpg', type: 'jpeg', quality: 55, timeout: 90_000 });
  console.log('captured filer room u-' + info, 'docket:', docket);
});
