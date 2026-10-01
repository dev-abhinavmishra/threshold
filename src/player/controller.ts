/**
 * First-person player controller — kinematic capsule vs AABB world.
 * Pointer lock look, WASD, sprint/stamina, crouch, stairs via step offset,
 * head bob, footstep sound events by floor material.
 */
import { PLAYER, PANIC } from '../game/config';
import type { SettingsData, HidingSpot, RoomInstance } from '../game/types';
import {
  v3, clamp, damp, slideMove2D, aabbContainsPoint,
  type Vec3, type Aabb,
} from '../engine/math';
import type { SoundEventBus } from '../engine/events';

export interface MoveInput {
  forward: number;   // -1..1
  strafe: number;    // -1..1
  sprint: boolean;
  crouch: boolean;
  jump?: boolean;
}

export type Protection = 'exposed' | 'hidden' | 'losSafe' | 'zone';

export class PlayerController {
  pos: Vec3 = v3(0, 0, 0);          // feet position
  vel: Vec3 = v3();
  yaw = 0;
  pitch = 0;
  eyeHeight = PLAYER.eyeHeight;
  crouching = false;
  onGround = true;
  bobPhase = 0;
  bobAmp = 0;
  stamina = PLAYER.staminaMax;
  health = PLAYER.maxHealth;
  protection: Protection = 'exposed';
  hiddenSpot: HidingSpot | null = null;
  panic = 0;                        // 0..1 inside cabinet
  panicLockoutUntil = 0;
  speedMul = 1;                     // tonic/weights
  noiseMul = 1;                     // feltWrap
  dead = false;
  rootedUntil = 0;                  // snare root
  fovKick = 0;
  frozen = false;                   // cutscene/forced state (Stillframe reads this)
  lastMoveSpeed = 0;
  footAcc = 0;


  eyePos(out: Vec3): Vec3 {
    out.x = this.pos.x;
    out.y = this.pos.y + (this.crouching ? PLAYER.crouchEyeHeight : this.eyeHeight) + this.bobOffset();
    out.z = this.pos.z;
    return out;
  }

  lookDir(out: Vec3): Vec3 {
    const cp = Math.cos(this.pitch);
    out.x = Math.sin(this.yaw) * cp;
    out.y = Math.sin(this.pitch);
    out.z = Math.cos(this.yaw) * cp;
    return out;
  }

  private bobOffset(): number {
    return Math.sin(this.bobPhase * Math.PI * 2) * this.bobAmp;
  }

  update(
    dt: number,
    input: MoveInput,
    blockers: readonly Aabb[],
    settings: SettingsData,
    sound: SoundEventBus,
    roomFloor: RoomInstance | null,
    now: number,
  ): void {
    if (this.dead || this.frozen || this.hiddenSpot) {
      // No movement while hidden/frozen/dead — handled by hide/panic systems.
      if (!this.hiddenSpot) this.vel.x = this.vel.z = 0;
      return;
    }

    const targetCrouch = input.crouch;
    this.crouching = targetCrouch;

    const sprinting = input.sprint && !this.crouching && input.forward > 0.1 && this.stamina > 1;
    if (sprinting) this.stamina = Math.max(0, this.stamina - PLAYER.staminaDrain * dt);
    else this.stamina = Math.min(PLAYER.staminaMax, this.stamina + PLAYER.staminaRegen * dt);

    let speed = this.crouching ? PLAYER.crouchSpeed : sprinting ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
    speed *= this.speedMul;
    if (now < this.rootedUntil) speed = 0;

    // Camera-relative move direction
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const dirX = sy * input.forward + cy * input.strafe;
    const dirZ = cy * input.forward - sy * input.strafe;
    const len = Math.hypot(dirX, dirZ) || 1;
    const wantX = (dirX / len) * speed * Math.min(1, len);
    const wantZ = (dirZ / len) * speed * Math.min(1, len);

    this.vel.x = damp(this.vel.x, wantX, PLAYER.accel / speed, dt);
    this.vel.z = damp(this.vel.z, wantZ, PLAYER.accel / speed, dt);
    const h = this.crouching ? PLAYER.crouchHeight : PLAYER.height;
    slideMove2D(this.pos, this.vel.x * dt, this.vel.z * dt, PLAYER.radius, h, blockers);

    // Ground snap + step offset (probes downward for walkable tops)
    this.pos.y = this.groundHeight(this.pos, blockers, this.pos.y);
    this.onGround = true;

    // Head bob scales with actual speed
    const speedNow = Math.hypot(this.vel.x, this.vel.z);
    this.lastMoveSpeed = speedNow;
    const bobTarget = settings.headBob && !settings.reducedMotion ? clamp(speedNow / PLAYER.sprintSpeed, 0, 1) * PLAYER.headBobAmp : 0;
    this.bobAmp = damp(this.bobAmp, bobTarget, 10, dt);
    this.bobPhase += dt * PLAYER.headBobFreq * clamp(speedNow / PLAYER.walkSpeed, 0.4, 2);

    // Footstep events
    if (speedNow > 0.5) {
      this.footAcc += speedNow * dt;
      const stride = this.crouching ? 1.1 : sprinting ? 0.75 : 0.95;
      if (this.footAcc > stride) {
        this.footAcc = 0;
        const intensity = (this.crouching ? 0.15 : sprinting ? 0.85 : 0.4) * this.noiseMul;
        sound.emit({
          x: this.pos.x, y: this.pos.y, z: this.pos.z,
          intensity,
          category: sprinting ? 'sprint' : 'footstep',
          caption: sprinting ? '[running]' : '',
        });
        void roomFloor;
      }
    }
  }

  /** Height of ground beneath position within step range. */
  private groundHeight(pos: Vec3, blockers: readonly Aabb[], currentY: number): number {
    let ground = 0;
    for (const b of blockers) {
      if (pos.x < b.minX - PLAYER.radius * 0.7 || pos.x > b.maxX + PLAYER.radius * 0.7) continue;
      if (pos.z < b.minZ - PLAYER.radius * 0.7 || pos.z > b.maxZ + PLAYER.radius * 0.7) continue;
      // Tops within step range count as ground.
      if (b.maxY <= currentY + PLAYER.stepHeight && b.maxY > ground) ground = b.maxY;
    }
    return Math.max(ground, currentY - 8 * (1 / 60)); // gentle fall
  }

  /** Set yaw/pitch from mouse delta; invert/sensitivity applied by caller. */
  look(dx: number, dy: number, settings: SettingsData): void {
    const s = 0.0022 * settings.sensitivity;
    this.yaw -= dx * s;
    this.pitch = clamp(this.pitch + (settings.invertY ? dy : -dy) * s, -1.45, 1.45);
  }

  teleport(x: number, y: number, z: number, yaw?: number): void {
    this.pos.x = x; this.pos.y = y; this.pos.z = z;
    if (yaw !== undefined) this.yaw = yaw;
    this.vel.x = this.vel.y = this.vel.z = 0;
  }

  /** Enter a hiding spot: snap view, become protected. */
  enterHiding(spot: HidingSpot, now: number): boolean {
    if (this.hiddenSpot || now < this.panicLockoutUntil) return false;
    this.hiddenSpot = spot;
    this.protection = 'hidden';
    this.teleport(spot.viewPos.x, spot.viewPos.y - 1.1, spot.viewPos.z, spot.viewYaw);
    return true;
  }

  exitHiding(now: number): void {
    if (!this.hiddenSpot) return;
    const spot = this.hiddenSpot;
    this.hiddenSpot = null;
    this.protection = 'exposed';
    this.panicLockoutUntil = now + PANIC.reentryCooldown * 0.2;
    this.teleport(spot.exitPos.x, 0, spot.exitPos.z, spot.viewYaw);
  }

  /** Called when panic maxes — forced eject. */
  panicEject(now: number): void {
    if (!this.hiddenSpot) return;
    this.exitHiding(now);
    this.panicLockoutUntil = now + PANIC.reentryCooldown;
  }

  /** Protection state recomputed vs. safe zones each frame. */
  refreshProtection(zones: readonly Aabb[]): void {
    if (this.hiddenSpot) { this.protection = 'hidden'; return; }
    for (const z of zones) {
      if (aabbContainsPoint(z, this.pos.x, this.pos.y + 1, this.pos.z)) {
        this.protection = 'losSafe';
        return;
      }
    }
    this.protection = 'exposed';
  }
}
