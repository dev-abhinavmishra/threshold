/**
 * Foreshadowing — after encounters are scheduled, the 1–2 rooms before each
 * trigger room get tell-tale dressing: candles before the Whisper, mirrors
 * before the EchoSkin, a dropped lantern before a corridor chase. The pass
 * runs on the 'scare' stream so structure and dressing are untouched.
 *
 * Props land near the room's entry or along its walls where a player
 * walking the route actually sees them — never blocking the path.
 */
import type { Rng } from '../engine/rng';
import type { RoomInstance } from '../game/types';
import { inDoorLane, type PropKind } from './spec';
import { WALL_MOUNT_Y } from './templates';

// Wall-hung tells mount at eye height on the wall face — a keyRack or
// transom window at y=0 reads as a bug, not a sign. securityCam and
// transomWindow have no WALL_MOUNT_Y entry (their templates mount them
// explicitly) — 2.3 matches the template convention.
const TELL_MOUNT_Y: Partial<Record<PropKind, number>> = {
  ...WALL_MOUNT_Y, transomWindow: 2.3, securityCam: 2.3,
};

export const TELLS: Record<string, PropKind[][]> = {
  // two candidate sets per entity: nearer rooms pull from later sets
  whisper:    [['papers', 'candle'], ['paperStack']],
  inkling:    [['paperStack', 'papers'], ['books']],
  echoskin:   [['mirror'], ['hauntedPortrait']],
  husk:       [['rubblePile', 'deadBranch'], ['rubble']],
  hollow:     [['lantern', 'candle'], ['flashlight']],
  redactor:   [['papers', 'paperStack'], ['books']],
  witness:    [['watcherFigure'], ['securityCam']],
  grafter:    [['wrench', 'multimeter'], ['toolbox']],
  sweep:      [['paperScatter', 'lantern'], ['rubble']],
  reprise:    [['paperScatter', 'flashlight'], ['rubble']],
  maelstrom:  [['rubblePile', 'wallVent'], ['rubble']],
  returner:   [['hallFigure'], ['lantern']],
  lurker:     [['toolbox', 'wrench'], ['papers']],
  behemoth:   [['rubblePile'], ['rubble', 'wallVent']],
  collector:  [['lantern'], ['papers', 'paperScatter']],
  singer:     [['rubberBoots'], ['papers']],
  // Sprint 288 — every schedulable entity marks its approach. The newer
  // cast got no tells when they shipped; now the cast reads complete.
  bellman:    [['suitcase', 'luggageRack'], ['keyRack']],
  porter:     [['woodLadder'], ['rubble', 'pegRail']],
  warden:     [['keyRack', 'lantern'], ['megaphone']],
  groundswell:[['rubblePile', 'rubble'], ['cementBag', 'bucket']],
  inspector:  [['wardrobe'], ['dresser', 'locker']],
  commissionaire: [['transomWindow'], ['keyRack', 'papers']],
  detective:  [['payphone'], ['stationery', 'papers']],
  curator:    [['bookCart', 'books'], ['libraryLadder']],
  redline:    [['roadBarrier'], ['chainFence', 'sign']],
  stillframe: [['statue'], ['bust', 'watcherFigure']],
  margin:     [['bookCart', 'books'], ['paperStack', 'papers']],
  editor:     [['register', 'paperStack'], ['typewriter', 'stapler']],
  swamper:    [['wetFloor', 'bucket'], ['plunger']],
  hauler:     [['sledge', 'handTruck'], ['crowbar', 'ropeBarrier']],
  laundress:  [['linenHamper', 'towelRail'], ['manglePress', 'basinSink']],
  auditor:    [['register', 'paperStack'], ['typewriter', 'stationery']],
  filer:      [['mailCart', 'paperScatter'], ['keyCabinet', 'papers']],
};

export function applyForeshadowing(rooms: RoomInstance[], rng: Rng, only?: Set<string>): void {
  const byIndex = new Map(rooms.map((r) => [r.index, r]));
  for (const room of rooms) {
    for (const sch of room.scheduled) {
      if (only && !only.has(sch.entity)) continue;
      const sets = TELLS[sch.entity];
      if (!sets) continue;
      for (let back = 1; back <= 2; back++) {
        const prev = byIndex.get(room.index - back);
        if (!prev || !prev.spec || prev.authored) continue;
        // The nearest approach room carries the entity's mark — scuffs,
        // prints, drag-lines the mesh builder lays down as decals.
        if (back === 1 && !prev.foreshadow && prev.scheduled.length === 0) prev.foreshadow = sch.entity;
        const set = sets[Math.min(back - 1, sets.length - 1)];
        const spec = prev.spec;
        const hw = spec.width / 2 - 1.2, hh = spec.depth / 2 - 1.2;
        for (const kind of set) {
          // hug the side walls so the prop reads at the door but never blocks
          const side = rng.bool(0.5) ? 1 : -1;
          const mountY = TELL_MOUNT_Y[kind];
          const x = mountY !== undefined
            ? side * (spec.width / 2 - 0.15)
            : side * rng.range(hw * 0.55, hw * 0.9);
          const z = rng.range(-hh * 0.6, hh * 0.75);
          if (inDoorLane(spec, x, z)) continue;
          spec.props.push({
            kind,
            x, z,
            y: mountY,
            yaw: side > 0 ? -Math.PI / 2 : Math.PI / 2,
            meta: { foreshadow: sch.entity },
          });
        }
      }
    }
  }
}
