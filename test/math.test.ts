import { describe, it, expect } from 'vitest';
import {
  v3, aabb, aabbIntersects2D, aabbContainsPoint, raycastAabb,
  slideMove2D, hasLineOfSight, clamp, damp,
} from '../src/engine/math';

describe('aabb + movement', () => {
  const wall = aabb(0, 1, 0, 1, 2, 0.1); // 2m x 4m x 0.2m wall at origin

  it('slideMove2D slides along a wall instead of tunneling', () => {
    const pos = v3(-0.5, 0, -1);
    // per-frame movement (as the controller does each tick)
    for (let i = 0; i < 20; i++) slideMove2D(pos, 0.01, 0.2, 0.35, 1.7, [wall]);
    // wall face at z=-0.1 minus player radius; x slides through
    expect(pos.z).toBeLessThanOrEqual(-0.1 - 0.35 + 1e-6);
    expect(pos.x).toBeGreaterThan(-0.5);
  });

  it('raycastAabb hits boxes and reports t', () => {
    const t = raycastAabb(v3(0, 0, -5), v3(0, 0, 1), wall, 20);
    expect(t).toBeGreaterThanOrEqual(0);
    expect(t).toBeCloseTo(4.9, 1);
  });

  it('hasLineOfSight blocked by a wall', () => {
    expect(hasLineOfSight(v3(0, 1, -3), v3(0, 1, 3), [wall])).toBe(false);
    expect(hasLineOfSight(v3(0, 1, -3), v3(0, 1, -1), [wall])).toBe(true);
    expect(hasLineOfSight(v3(0, 1, -3), v3(5, 1, 3), [wall])).toBe(true);
  });

  it('aabbContainsPoint boundary', () => {
    const b = aabb(0, 0, 0, 1, 1, 1);
    expect(aabbContainsPoint(b, 0.5, 0.5, 0.5)).toBe(true);
    expect(aabbContainsPoint(b, 2, 0, 0)).toBe(false);
  });

  it('aabbIntersects2D edge cases', () => {
    const a = aabb(0, 0, 0, 1, 1, 1);
    const b = aabb(2, 0, 0, 1, 1, 1); // touching at x=1 — strict inequality
    const c = aabb(1.5, 0, 0, 1, 1, 1);
    expect(aabbIntersects2D(a, b)).toBe(false);
    expect(aabbIntersects2D(a, c)).toBe(true);
    expect(aabbIntersects2D(a, aabb(5, 0, 5, 1, 1, 1))).toBe(false);
  });
});

describe('scalar helpers', () => {
  it('clamp', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-5, 0, 3)).toBe(0);
    expect(clamp(1, 0, 3)).toBe(1);
  });
  it('damp approaches target', () => {
    let v = 0;
    for (let i = 0; i < 200; i++) v = damp(v, 10, 5, 0.05);
    expect(v).toBeGreaterThan(9);
  });
});
