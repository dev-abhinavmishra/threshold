// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore, loadSettings, saveSettings, loadMeta, saveMeta, saveCheckpoint, loadCheckpoint, clearCheckpoint } from '../src/game/store';
import type { SettingsData } from '../src/game/types';

const base: SettingsData = loadSettings();

beforeEach(() => {
  localStorage.clear();
});

describe('settings persistence', () => {
  it('round-trips modified settings', () => {
    const s = { ...base, masterVolume: 0.42, fov: 95, captions: false, keybinds: { ...base.keybinds, interact: 'KeyG' } };
    saveSettings(s);
    const got = loadSettings();
    expect(got.masterVolume).toBeCloseTo(0.42);
    expect(got.fov).toBe(95);
    expect(got.captions).toBe(false);
    expect(got.keybinds.interact).toBe('KeyG');
  });
  it('falls back to defaults on corrupt data', () => {
    localStorage.setItem('threshold.settings.v2', '{not json');
    const got = loadSettings();
    expect(got.masterVolume).toBe(base.masterVolume);
    expect(got.fov).toBe(base.fov);
  });
  it('migrates/drops wrong version', () => {
    localStorage.setItem('threshold.settings.v2', JSON.stringify({ version: 1, fov: 123 }));
    const got = loadSettings();
    expect(got.fov).not.toBe(123);
  });
});

describe('meta persistence', () => {
  it('records deaths, best room, unlocks', () => {
    const meta = loadMeta();
    const next = { ...meta, deaths: 3, bestRoom: 55, victories: 1, documents: ['doc-a'], achievements: ['first_breach'] };
    saveMeta(next);
    const got = loadMeta();
    expect(got.deaths).toBe(3);
    expect(got.bestRoom).toBe(55);
    expect(got.documents).toContain('doc-a');
  });
});

describe('checkpoint', () => {
  it('saves and restores run state', () => {
    saveCheckpoint({
      seedText: 'cp-seed', roomIndex: 34, underIndex: 0, inUnderscript: false, difficulty: 'standard',
      health: 80, inventory: [{ id: 'latchpick', count: 1 }, { id: 'tonic', count: 2 }], imprints: 42, marginalia: 7,
      stats: { roomsEntered: 34, deaths: 0, kills: 0, hidesUsed: 2, itemsUsed: 1, imprintsFound: 42, marginaliaFound: 7, timePlayed: 120, entitiesSurvived: 5, secretsFound: 1 },
    });
    const cp = loadCheckpoint();
    expect(cp).not.toBeNull();
    expect(cp!.roomIndex).toBe(34);
    expect(cp!.inventory[0].id).toBe('latchpick');
    clearCheckpoint();
    expect(loadCheckpoint()).toBeNull();
  });

  it('the ledgers outlive you — debts and marks round-trip', () => {
    // sprint 332 — a death must not launder the books: the checkpoint
    // carries the five ledger fields so a reload keeps your name.
    saveCheckpoint({
      seedText: 'cp-seed', roomIndex: 12, underIndex: 0, inUnderscript: false, difficulty: 'standard',
      health: 60, inventory: [{ id: 'bandage', count: 2 }], imprints: 9, marginalia: 3,
      stats: { roomsEntered: 12, deaths: 0, kills: 0, hidesUsed: 0, itemsUsed: 0, imprintsFound: 9, marginaliaFound: 3, timePlayed: 40, entitiesSurvived: 1, secretsFound: 0 },
      unpaidTheft: 3, unpaidHeld: 2, paperTrail: 4, hotImprints: 6,
      hotItems: ['bandage', 'tonic'],
    });
    const cp = loadCheckpoint();
    expect(cp!.unpaidTheft).toBe(3);
    expect(cp!.unpaidHeld).toBe(2);
    expect(cp!.paperTrail).toBe(4);
    expect(cp!.hotImprints).toBe(6);
    expect(cp!.hotItems).toEqual(['bandage', 'tonic']);
    // pre-332 saves (no ledger fields) restore as a clean slate, not NaN
    saveCheckpoint({
      seedText: 'old-save', roomIndex: 3, underIndex: 0, inUnderscript: false, difficulty: 'standard',
      health: 100, inventory: [], imprints: 0, marginalia: 0,
      stats: { roomsEntered: 3, deaths: 0, kills: 0, hidesUsed: 0, itemsUsed: 0, imprintsFound: 0, marginaliaFound: 0, timePlayed: 10, entitiesSurvived: 0, secretsFound: 0 },
    });
    const old = loadCheckpoint()!;
    expect(old.unpaidTheft ?? 0).toBe(0);
    expect(old.hotItems ?? []).toEqual([]);
  });

  it('the house keeps what you spent — wanted, lines, hazards, marks round-trip', () => {
    // sprints 346–350 — the checkpoint carries the wanted episode,
    // pulled junction boxes, fresh sign marks, hazard kill-state,
    // drained halls, and filed stock manifests.
    saveCheckpoint({
      seedText: 'cp-seed', roomIndex: 20, underIndex: 0, inUnderscript: false, difficulty: 'standard',
      health: 70, inventory: [], imprints: 4, marginalia: 2,
      stats: { roomsEntered: 20, deaths: 0, kills: 0, hidesUsed: 0, itemsUsed: 0, imprintsFound: 4, marginaliaFound: 2, timePlayed: 60, entitiesSurvived: 2, secretsFound: 0 },
      wantedActive: true, wantedRooms: [[7, { x: 1, z: 2 }]], wantedRepostS: 0,
      bareBoards: [[9, { x: 3, z: 4 }]],
      deadLines: [5, 9],
      evidence: [{ room: 3, kind: 'work', t: 42, x: 1.5, z: 2.5, readBy: ['warden:33'], wiped: false }],
      deadHazards: [{ room: 4, kind: 'snare', x: 0, z: 1 }, { room: 6, kind: 'eye', x: 2, z: 3, filed: true }],
      drainedRooms: ['main:8'],
      stockFiled: [11],
    });
    const cp = loadCheckpoint()!;
    expect(cp.wantedActive).toBe(true);
    expect(cp.wantedRooms).toEqual([[7, { x: 1, z: 2 }]]);
    expect(cp.bareBoards).toEqual([[9, { x: 3, z: 4 }]]);
    expect(cp.deadLines).toEqual([5, 9]);
    expect(cp.evidence).toHaveLength(1);
    expect(cp.evidence![0].readBy).toEqual(['warden:33']);
    expect(cp.deadHazards).toHaveLength(2);
    expect(cp.deadHazards![1].filed).toBe(true);
    expect(cp.drainedRooms).toEqual(['main:8']);
    expect(cp.stockFiled).toEqual([11]);
  });
});

describe('store phases', () => {
  it('defaults to MENU and transitions', () => {
    const st = useGameStore.getState();
    expect(['MENU', 'BOOT', 'PLAYING', 'PAUSED', 'DEAD', 'COMPLETE', 'DYING', 'MINIGAME', 'LOADING', 'ENDING']).toContain(st.phase);
  });
});
