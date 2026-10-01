import { describe, it, expect } from 'vitest';
import { SeedStreams, hashSeed, mulberry32 } from '../src/engine/rng';

describe('hashSeed', () => {
  it('is deterministic', () => {
    expect(hashSeed('ash-vault-101')).toBe(hashSeed('ash-vault-101'));
  });
  it('differs across seeds', () => {
    expect(hashSeed('a')).not.toBe(hashSeed('b'));
  });
});

describe('mulberry32', () => {
  it('produces values in [0,1)', () => {
    const r = mulberry32(42);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
  it('same seed → same sequence', () => {
    const a = mulberry32(7);
    const b = mulberry32(7);
    for (let i = 0; i < 50; i++) expect(a()).toBe(b());
  });
});

describe('SeedStreams', () => {
  it('same seed text → identical stream values', () => {
    const a = new SeedStreams('wax-bell-256');
    const b = new SeedStreams('wax-bell-256');
    for (const name of ['structure', 'dressing', 'loot', 'encounter', 'audio', 'puzzle', 'entity']) {
      expect(a.stream(name).int(0, 1e9)).toBe(b.stream(name).int(0, 1e9));
    }
  });
  it('different seed text → different values', () => {
    const a = new SeedStreams('x').stream('loot').int(0, 1e9);
    const b = new SeedStreams('y').stream('loot').int(0, 1e9);
    expect(a).not.toBe(b);
  });
  it('independent streams from one seed', () => {
    const s = new SeedStreams('q');
    expect(s.stream('loot').int(0, 1e9)).not.toBe(s.stream('audio').int(0, 1e9));
  });
  it('room streams are per-index distinct', () => {
    const s = new SeedStreams('z');
    expect(s.roomStream('dressing', 3).int(0, 1e9)).not.toBe(s.roomStream('dressing', 4).int(0, 1e9));
  });
  it('Rng helpers obey bounds', () => {
    const rng = new SeedStreams('t').stream('loot');
    for (let i = 0; i < 200; i++) {
      const v = rng.int(3, 9);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(9);
      const f = rng.range(-2, 5);
      expect(f).toBeGreaterThanOrEqual(-2);
      expect(f).toBeLessThan(5);
    }
  });
  it('weighted never returns zero-weight items', () => {
    const rng = new SeedStreams('w').stream('loot');
    const items = [{ item: 'a', w: 0 }, { item: 'b', w: 1 }];
    for (let i = 0; i < 100; i++) expect(rng.weighted(items, (t) => t.w).item).toBe('b');
  });
  it('shuffle preserves multiset', () => {
    const rng = new SeedStreams('s').stream('loot');
    const src = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = rng.shuffle(src.slice());
    expect(out.slice().sort((a, b) => a - b)).toEqual(src);
  });
});
