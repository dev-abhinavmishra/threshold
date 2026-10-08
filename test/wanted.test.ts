import { describe, it, expect } from 'vitest';
import { pickWantedHosts, WANTED_HOSTS } from '../src/game/wanted';
import type { RoomInstance } from '../src/game/types';

function room(idx: number, props: string[], origin = { x: 0, y: 0, z: idx * 10 }, yaw = 0): RoomInstance {
  return {
    index: idx,
    origin,
    yaw,
    spec: props.length ? { props: props.map((kind, i) => ({ kind, x: 1 + i, z: 2, rot: 0, meta: {} })) } : undefined,
  } as unknown as RoomInstance;
}

describe('pickWantedHosts — the boards your face goes up on', () => {
  it('marks only rooms downstream of the caller', () => {
    const rooms = [room(0, ['cubicle']), room(1, ['cabinet']), room(2, ['locker'])];
    const hosts = pickWantedHosts(rooms, 0);
    expect(hosts.map((h) => h.roomIdx)).toEqual([1, 2]);
  });

  it('skips rooms with no crew-board furniture', () => {
    const rooms = [room(0, []), room(1, ['desk', 'chair']), room(2, ['keyCabinet'])];
    const hosts = pickWantedHosts(rooms, 0);
    expect(hosts.map((h) => h.roomIdx)).toEqual([2]);
  });

  it('caps at five boards', () => {
    const rooms = Array.from({ length: 9 }, (_, i) => room(i, ['locker']));
    expect(pickWantedHosts(rooms, 0)).toHaveLength(5);
  });

  it('uses the first host prop in a room', () => {
    const rooms = [room(0, []), room(1, ['stackShelf', 'cabinet'])];
    const hosts = pickWantedHosts(rooms, 0);
    expect(hosts).toHaveLength(1);
    // host.x = origin.x + 1*cos(0) + 2*sin(0) = 0 + 1
    expect(hosts[0].x).toBeCloseTo(1, 5);
  });

  it('projects through the room yaw', () => {
    const r = room(0, ['locker'], { x: 10, y: 0, z: 20 }, Math.PI / 2);
    const hosts = pickWantedHosts([room(-1, []), r], 0);
    // yaw=PI/2: x' = x*c + z*s = 0 + 2, z' = -x*s + z*c = -1
    expect(hosts[0].x).toBeCloseTo(12, 5);
    expect(hosts[0].z).toBeCloseTo(19, 5);
  });

  it('only crew-board kinds qualify', () => {
    for (const k of [...WANTED_HOSTS]) {
      expect(pickWantedHosts([room(0, []), room(1, [k])], 0)).toHaveLength(1);
    }
    expect(pickWantedHosts([room(0, []), room(1, ['pedestal'])], 0)).toHaveLength(0);
  });
});
