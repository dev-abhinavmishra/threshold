import { describe, it, expect } from 'vitest';
import * as THREE from 'three';

// The contract `Game.roomLocal` implements: a built room group carries
// position=room.origin, rotation.y=room.yaw, so any world-space point
// (door pos, socket pos, wanted host) must be folded through
// worldToLocal before being set on a child — otherwise the decal lands
// origin+yaw-transformed AGAIN and floats metres off its host.
function roomLocal(group: THREE.Group, x: number, y: number, z: number): THREE.Vector3 {
  group.updateWorldMatrix(true, false);
  return group.worldToLocal(new THREE.Vector3(x, y, z));
}

describe('room-local decal placement (review: world coords into a yawed group)', () => {
  it('lands a world-space point on the transformed child', () => {
    const group = new THREE.Group();
    group.position.set(10, 0, 30);
    group.rotation.y = Math.PI / 2;
    const scene = new THREE.Scene();
    scene.add(group);

    const world = { x: 12.5, y: 1.35, z: 28 };
    const m = new THREE.Mesh();
    m.position.copy(roomLocal(group, world.x, world.y, world.z));
    group.add(m);

    scene.updateMatrixWorld(true);
    const back = m.getWorldPosition(new THREE.Vector3());
    expect(back.x).toBeCloseTo(world.x, 4);
    expect(back.y).toBeCloseTo(world.y, 4);
    expect(back.z).toBeCloseTo(world.z, 4);
  });

  it('a world yaw folded through the room keeps its facing', () => {
    const yaw = Math.PI / 3;
    const worldYaw = 0.9;
    // child local yaw = worldYaw - room.yaw; after the group transform
    // the mesh's world rotation must equal the original world yaw.
    const childYaw = worldYaw - yaw;
    const group = new THREE.Group();
    group.rotation.y = yaw;
    const scene = new THREE.Scene();
    scene.add(group);
    const m = new THREE.Mesh();
    m.rotation.y = childYaw;
    group.add(m);
    scene.updateMatrixWorld(true);
    const q = m.getWorldQuaternion(new THREE.Quaternion());
    const e = new THREE.Euler().setFromQuaternion(q, 'YXZ');
    expect(e.y).toBeCloseTo(worldYaw, 4);
  });
});
