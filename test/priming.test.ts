import { describe, it, expect } from 'vitest';
import { IndexEncounter, LensHallEncounter, Milestone } from '../src/encounters/milestones';
import type { RoomInstance } from '../src/game/types';

const room = {
  index: 50,
  label: '050',
  templateId: 'ms-index',
  origin: { x: 0, y: 0, z: 0 },
  yaw: 0,
  entryPos: { x: 0, y: 0, z: -5 },
  exitPos: { x: 0, y: 0, z: 5 },
  spec: { props: [] },
} as unknown as RoomInstance;

const lensRoom = {
  index: 75,
  label: '075',
  templateId: 'ms-lens-hall',
  origin: { x: 0, y: 0, z: 0 },
  yaw: 0,
  entryPos: { x: 0, y: 0, z: -5 },
  exitPos: { x: 0, y: 0, z: 5 },
  spec: { props: [] },
} as unknown as RoomInstance;

function makeEvents(captured: string[]) {
  return {
    ctx: () => ({ sound: { emit: () => {} } }) as never,
    spawnEntity: () => {},
    cue: (_n: string, _a: unknown, t: string) => { captured.push(t); },
    unlockMainDoor: () => {},
    openExit: () => {},
    enterUnderscript: () => {},
    exitUnderscript: () => {},
    victory: () => {},
    giveItem: () => {},
    spendImprints: () => true,
    hasItem: () => false,
  };
}

describe('milestone priming — loud work within three doors opens it hot', () => {
  it('a primed Index opens on the heard-tell caption', () => {
    const cues: string[] = [];
    const m = new IndexEncounter(room, makeEvents(cues), 1);
    m.prime();
    expect(m.primed).toBe(true);
    m.enter();
    expect(cues[0]).toContain('heard you three doors back');
  });

  it('an unprimed Index keeps the quiet tell', () => {
    const cues: string[] = [];
    const m = new IndexEncounter(room, makeEvents(cues), 1);
    expect(m.primed).toBe(false);
    m.enter();
    expect(cues[0]).toContain('collect five catalog cards');
  });

  it('a primed Lens Hall announces the already-sweeping beams', () => {
    const cues: string[] = [];
    const m = new LensHallEncounter(lensRoom, makeEvents(cues));
    m.prime();
    m.enter();
    expect(cues[0]).toContain('already sweep');
  });

  it('prime is idempotent and generic across milestones', () => {
    const m: Milestone = new IndexEncounter(room, makeEvents([]), 1);
    m.prime();
    m.prime();
    expect(m.primed).toBe(true);
  });
});
