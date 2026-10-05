/**
 * Room streamer — keeps a sliding window of rooms instantiated in the scene:
 * enough behind for rebound entities/backtracking, enough ahead to prewarm
 * so doors never stall. Disposes meshes for rooms outside the window.
 */
import * as THREE from 'three';
import type { RoomInstance } from '../game/types';
import { buildRoomMesh, disposeRoom, type BuiltRoom } from './builder';
import { DIRECTOR, QUALITY } from '../game/config';

export class RoomStreamer {
  private scene: THREE.Group;
  private built = new Map<number, BuiltRoom>();
  private quality: 'low' | 'medium' | 'high';
  private seedHash: number;

  constructor(scene: THREE.Group, quality: 'low' | 'medium' | 'high', seedHash: number) {
    this.scene = scene;
    this.quality = quality;
    this.seedHash = seedHash;
  }

  setQuality(q: 'low' | 'medium' | 'high'): void {
    this.quality = q;
  }

  /** Which floor-space is active — main route or underscript. */
  private space: 'main' | 'under' = 'main';

  setSpace(space: 'main' | 'under'): void {
    if (this.space === space) return;
    this.space = space;
    // Index spaces overlap (both start at 0) — switching floors clears the window.
    this.clear();
  }

  get builtIndices(): number[] {
    return [...this.built.keys()];
  }

  /** Ensure rooms in [lo, hi] are built and those far outside are disposed. */
  update(rooms: RoomInstance[], centerIndex: number, dir = 1, branchRooms: RoomInstance[] = []): void {
    const lo = Math.max(0, centerIndex - DIRECTOR.keepBehind);
    const hi = Math.min(rooms.length - 1, centerIndex + DIRECTOR.prewarmAhead);
    const wanted = new Set<number>();
    for (let i = lo; i <= hi; i++) wanted.add(i);
    // Always keep current room and immediate neighbors.
    for (const i of [centerIndex - 1, centerIndex, centerIndex + 1]) {
      if (i >= 0 && i < rooms.length) wanted.add(i);
    }

    const buildList: RoomInstance[] = [];
    for (const i of wanted) {
      const room = rooms[i];
      if (room) buildList.push(room);
    }
    // Branch closets stream with their parent room.
    for (const b of branchRooms) {
      if (b.branchOf !== undefined && wanted.has(b.branchOf)) {
        buildList.push(b);
        wanted.add(b.index);
      }
    }

    for (const room of buildList) {
      if (this.built.has(room.index)) continue;
      if (!room.spec) continue;
      const built = buildRoomMesh(room, room.spec, this.seedHash, this.quality);
      this.scene.add(built.group);
      this.built.set(room.index, built);
    }

    for (const [i, built] of [...this.built]) {
      if (!wanted.has(i)) {
        disposeRoom(built);
        this.scene.remove(built.group);
        this.built.delete(i);
      }
    }
    void dir;
  }

  get(index: number): BuiltRoom | undefined {
    return this.built.get(index);
  }

  clear(): void {
    for (const [, built] of this.built) disposeRoom(built);
    this.built.clear();
    this.scene.clear();
  }

  static qualitySettings(q: 'low' | 'medium' | 'high') {
    return QUALITY[q];
  }
}
