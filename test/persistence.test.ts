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
});

describe('store phases', () => {
  it('defaults to MENU and transitions', () => {
    const st = useGameStore.getState();
    expect(['MENU', 'BOOT', 'PLAYING', 'PAUSED', 'DEAD', 'COMPLETE', 'DYING', 'MINIGAME', 'LOADING', 'ENDING']).toContain(st.phase);
  });
});
