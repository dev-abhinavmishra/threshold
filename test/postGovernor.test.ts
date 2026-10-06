import { describe, it, expect } from 'vitest';
import { PostGovernor, GOVERNOR } from '../src/game/postGovernor';

function rig(hasSsao = true, hasBloom = true) {
  const calls: { ssao: boolean[]; bloom: boolean[]; scale: number[] } = { ssao: [], bloom: [], scale: [] };
  const gov = new PostGovernor({
    setSsao: (on) => calls.ssao.push(on),
    setBloom: (on) => calls.bloom.push(on),
    setScale: (mul) => calls.scale.push(mul),
  }, { hasSsao, hasBloom });
  return { gov, calls };
}

const feed = (gov: PostGovernor, dt: number, frames: number, enabled = true) => {
  for (let i = 0; i < frames; i++) gov.update(dt, enabled);
};

describe('post governor', () => {
  it('sheds SSAO first, then bloom, then render scale as fps stays low', () => {
    const { gov, calls } = rig();
    // ~10fps — far under the 45 threshold. EMA converges after a handful of
    // samples, then each step needs 2.5s of sustained low fps.
    feed(gov, 0.1, 40); // ~4s → tier 1: ssao off
    expect(gov.tier).toBe(1);
    expect(calls.ssao).toEqual([false]);
    feed(gov, 0.1, 30); // ~3s more → tier 2: bloom off too
    expect(gov.tier).toBe(2);
    expect(calls.bloom).toEqual([false]);
    feed(gov, 0.1, 30); // → tier 3: render scale
    expect(gov.tier).toBe(3);
    expect(calls.scale).toEqual([GOVERNOR.scaleMul]);
    feed(gov, 0.1, 30); // ladder is exhausted — stays at 3
    expect(gov.tier).toBe(3);
  });

  it('restores one step at a time after sustained headroom', () => {
    const { gov, calls } = rig();
    feed(gov, 0.1, 100); // degrade all the way down
    expect(gov.tier).toBe(3);
    calls.scale.length = 0;
    feed(gov, 1 / 60, 60 * 11); // 11s at 60fps → restore one step
    expect(gov.tier).toBe(2);
    expect(calls.scale).toEqual([1]); // scale restored first
    feed(gov, 1 / 60, 60 * 11);
    expect(gov.tier).toBe(1);
  });

  it('does not oscillate on brief fps dips', () => {
    const { gov } = rig();
    feed(gov, 1 / 60, 30);
    feed(gov, 0.1, 20); // 2s of jank — under the 2.5s sustain
    feed(gov, 1 / 60, 30);
    feed(gov, 0.1, 20);
    expect(gov.tier).toBe(0);
  });

  it('medium preset has no SSAO step — bloom sheds first', () => {
    const { gov, calls } = rig(false, true);
    feed(gov, 0.1, 40);
    expect(gov.tier).toBe(1);
    expect(calls.ssao).toEqual([]);
    expect(calls.bloom).toEqual([false]);
  });

  it('disabled restores everything immediately', () => {
    const { gov, calls } = rig();
    feed(gov, 0.1, 100);
    expect(gov.tier).toBeGreaterThan(0);
    gov.update(1 / 60, false);
    expect(gov.tier).toBe(0);
    expect(calls.ssao.at(-1)).toBe(true);
    expect(calls.bloom.at(-1)).toBe(true);
    expect(calls.scale.at(-1)).toBe(1);
  });

  it('ignores zero/negative dt samples', () => {
    const { gov } = rig();
    gov.update(0, true);
    gov.update(-0.016, true);
    expect(gov.fps).toBe(0);
  });
});
