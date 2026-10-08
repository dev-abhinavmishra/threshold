/**
 * Deterministic seeded RNG.
 *
 * Independent streams (structure / dressing / loot / encounters / audio) so
 * that adding a visual prop never shifts gameplay generation. Same seed +
 * same build + same mode reproduces the same route and scheduled events.
 */

export type RngStream =
  | 'structure'
  | 'dressing'
  | 'loot'
  | 'encounter'
  | 'audio'
  | 'puzzle'
  | 'entity'
  | 'scare'
  | 'uscare'
  | 'pacing'
  | 'confiscate'
  | 'filer'
  | 'countersign'
  | 'returnslip'
  | 'affidavit'
  | 'misfile'
  | 'clerk';

const STREAM_SALTS: Record<RngStream, number> = {
  structure: 0x517ac0de,
  dressing: 0xd3e551de,
  loot: 0x1007cafe,
  encounter: 0xec09a742,
  audio: 0xa0d10e11,
  puzzle: 0x9a221e55,
  entity: 0xe7717a15,
  scare: 0x5ca4e000,
  uscare: 0x05ca4e00,
  pacing: 0x9ac1e000,
  confiscate: 0xc0514cae,
  filer: 0xf11e4ce2,
  countersign: 0xc04e51d0,
  returnslip: 0x4e7151e7,
  affidavit: 0xa55d71e8,
  misfile: 0x151f11e5,
  clerk: 0x0c7e4a2f,
};

/** FNV-1a 32-bit string hash — used to derive seeds from player-entered text. */
export function hashSeed(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 — small, fast, seedable PRNG with good-enough distribution. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  private next: () => number;

  constructor(seed: number) {
    this.next = mulberry32(seed);
  }

  /** float in [0, 1) */
  float(): number {
    return this.next();
  }

  /** float in [min, max) */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** int in [min, max] inclusive */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  bool(probability = 0.5): boolean {
    return this.next() < probability;
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.min(items.length - 1, Math.floor(this.next() * items.length))];
  }

  /** Weighted pick; weights need not sum to 1. */
  weighted<T>(items: readonly T[], weight: (item: T) => number): T {
    let total = 0;
    for (const item of items) total += Math.max(0, weight(item));
    let roll = this.next() * total;
    for (const item of items) {
      roll -= Math.max(0, weight(item));
      if (roll <= 0) return item;
    }
    return items[items.length - 1];
  }

  /** Fisher-Yates shuffle in place; returns the same array. */
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  }

  /** Fork a deterministic child stream (e.g. per-room dressing). */
  fork(salt: number): Rng {
    return new Rng((Math.imul(this.int(0, 0xffffffff), 0x9e3779b1) ^ salt) >>> 0);
  }
}

/**
 * The run's full set of streams. Derives each stream from `hashSeed(seedText)`.
 * Numeric seeds are normalized through the same hash so "42" and 42 match.
 */
export class SeedStreams {
  readonly seedText: string;
  readonly seedHash: number;
  private streams = new Map<RngStream, Rng>();

  constructor(seedText: string) {
    this.seedText = seedText;
    this.seedHash = hashSeed(seedText);
  }

  stream(name: RngStream): Rng {
    let s = this.streams.get(name);
    if (!s) {
      s = new Rng((this.seedHash ^ STREAM_SALTS[name]) >>> 0);
      this.streams.set(name, s);
    }
    return s;
  }

  /** A fresh forked Rng for one room/encounter — does not disturb shared streams. */
  roomStream(name: RngStream, roomIndex: number): Rng {
    const base = (this.seedHash ^ STREAM_SALTS[name]) >>> 0;
    return new Rng((base + Math.imul(roomIndex + 1, 0x85ebca6b)) >>> 0);
  }

  static randomSeedText(): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let out = '';
    const cryptoObj = globalThis.crypto;
    const buf = new Uint32Array(8);
    if (cryptoObj?.getRandomValues) cryptoObj.getRandomValues(buf);
    else for (let i = 0; i < buf.length; i++) buf[i] = Math.floor(Math.random() * 0xffffffff);
    for (const v of buf) out += alphabet[v % alphabet.length];
    return out;
  }
}
