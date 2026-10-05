import { describe, it, expect } from 'vitest';
import { buildProp } from '../src/world/props';
import { SeedStreams } from '../src/engine/rng';
import type { PropKind } from '../src/world/spec';

const rng = new SeedStreams('prop-test').stream('props');

// Procedural builders added for themed rooms — must produce real geometry
// and colliders (they have no GLTF fallback).
const PROCEDURAL: { kind: PropKind; minChildren: number }[] = [
  { kind: 'morgueDrawer', minChildren: 10 },
  { kind: 'gurney', minChildren: 5 },
  { kind: 'washer', minChildren: 5 },
  { kind: 'boilerTank', minChildren: 8 },
  { kind: 'cubiclePod', minChildren: 8 },
  { kind: 'monitor', minChildren: 4 },
  { kind: 'serverRack', minChildren: 30 },
  { kind: 'glassWall', minChildren: 5 },
];

const NO_COLLIDER = new Set<PropKind>(['monitor']); // desk-top items

describe('procedural prop builders', () => {
  for (const { kind, minChildren } of PROCEDURAL) {
    it(`${kind} builds a populated group with colliders`, () => {
      const p = buildProp({ kind, x: 0, z: 0, yaw: 0 }, rng.fork(kind.length * 31));
      expect(p.group.children.length).toBeGreaterThanOrEqual(minChildren);
      if (!NO_COLLIDER.has(kind)) expect(p.colliders.length).toBeGreaterThan(0);
    });
  }

  it('monitor screens and rack LEDs are tagged for animation', () => {
    const mon = buildProp({ kind: 'monitor', x: 0, z: 0 }, rng.fork(1));
    const rack = buildProp({ kind: 'serverRack', x: 0, z: 0 }, rng.fork(2));
    let screen = 0, blink = 0;
    mon.group.traverse((o) => { if (o.userData.anim === 'screen') screen++; });
    rack.group.traverse((o) => { if (o.userData.anim === 'blink') blink++; });
    expect(screen).toBe(1);
    expect(blink).toBeGreaterThanOrEqual(30);
  });
});
