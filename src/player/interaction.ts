/**
 * Interaction system — a centered raycast plus forgiving proximity check.
 * One prompt at a time, highest-priority target wins. Interactions are
 * cancellable and never double-fire.
 */
import { v3dist, type Vec3 } from '../engine/math';
import type { Door, HidingSpot, Socket, RoomInstance, ItemId } from '../game/types';
import { PLAYER } from '../game/config';

export type InteractKind =
  | 'door' | 'peek' | 'drawer' | 'socket' | 'hide' | 'exitHide' | 'vend'
  | 'item' | 'lore' | 'shop' | 'puzzle' | 'seal' | 'lift'
  | 'underEntrance' | 'underExit' | 'relay' | 'board' | 'isolator'
  | 'pylon' | 'catalogue' | 'card' | 'alarm' | 'merchant' | 'coffin' | 'piano' | 'tv' | 'clock' | 'valve' | 'hearth' | 'phone' | 'trap' | 'washer' | 'printer' | 'typewriter' | 'window' | 'cooler';

export interface Interactable {
  kind: InteractKind;
  id: string;
  pos: Vec3;
  /** Verb + object for the prompt, e.g. "Open Door 017" */
  prompt: string;
  /** Requires key item. */
  requiresItem?: ItemId;
  /** Locked doors show this instead of normal prompt. */
  lockedPrompt?: string;
  /** Longer actions get a hold-progress (seconds). */
  holdTime?: number;
  /** Radius bonus beyond base range for big targets. */
  reachBonus?: number;
  data?: Door | Socket | HidingSpot | Record<string, unknown>;
  enabled: boolean;
  priority: number;
}

export class InteractionSystem {
  /** Live registry rebuilt when rooms stream or state changes. */
  interactables: Interactable[] = [];
  focused: Interactable | null = null;
  holdProgress = 0;
  holdTarget: string | null = null;

  clear(): void {
    this.interactables = [];
    this.focused = null;
    // hold state survives per-frame rebuilds; updateHold resets it on target change
  }

  add(it: Interactable): void {
    this.interactables.push(it);
  }

  /** Rebuild from streamed rooms each time the window changes. */
  addRoomInteractables(room: RoomInstance): void {
    for (const door of room.doors) {
      this.add({
        kind: 'door', id: door.id, pos: door.pos,
        prompt: door.falseDoor ? `Open Door ${door.label}` : door.locked ? `Unlock Door ${door.label}` : `Open Door ${door.label}`,
        lockedPrompt: door.locked ? 'Locked' : undefined,
        data: door, enabled: true,
        priority: door.isMainRoute ? 3 : 2,
      });
    }
    for (const spot of room.hidingSpots) {
      this.add({
        kind: 'hide', id: spot.id, pos: spot.exitPos,
        prompt: (() => {
          const base = spot.kind === 'cabinet' ? 'Hide in cabinet' : spot.kind === 'vent' ? 'Hide in vent' : spot.kind === 'underFurniture' ? 'Hide underneath' : 'Step into recess';
          // hollow tells — the Archive's promised readable warnings
          if (spot.trappedBy === 'hollow' && spot.trapClues?.length) {
            const CLUE_TEXT: Record<string, string> = {
              'off-hum': 'a hum pitched wrong', 'dark-residue': 'dark residue on the hinges',
              'warped-slats': 'the slats are warped', 'faint-move': 'something shifts inside', breathing: 'it is breathing',
            };
            const clue = CLUE_TEXT[spot.trapClues[0]] ?? spot.trapClues[0];
            return `${base} — ${clue}`;
          }
          return base;
        })(),
        data: spot, enabled: true, priority: 2,
      });
    }
    for (const sock of room.sockets) {
      if (sock.meta.hidden) continue;
      const contains = sock.meta.contains as string | undefined;
      if (sock.kind === 'drawer') {
        const locked = sock.meta.drawerLocked === true;
        this.add({
          kind: 'drawer', id: `drawer-${room.index}-${sock.pos.x.toFixed(1)}-${sock.pos.z.toFixed(1)}`,
          pos: sock.pos,
          prompt: locked ? 'Drawer (locked)' : 'Search drawer',
          holdTime: locked ? 1.6 : 0.5,
          data: sock, enabled: !sock.meta.opened, priority: 1,
        });
      } else if (sock.kind === 'loot' || sock.kind === 'itemPedestal' || sock.kind === 'key' || sock.kind === 'clue') {
        const underE = sock.meta.underEntrance === true;
        const underX = sock.meta.underExit === true;
        const clampId = sock.meta.sealClamp as string | undefined;
        const underD = sock.meta.underDoor === true;
        let kind: InteractKind = 'item';
        let prompt = 'Take';
        if (contains === 'imprints') prompt = 'Take Imprints';
        else if (contains === 'lore') prompt = 'Read document';
        else if (contains) prompt = `Take ${contains.replace(/([A-Z])/g, ' $1').trim()}`;
        if (sock.meta.shop !== undefined) { kind = 'shop'; prompt = 'Inspect wares'; }
        if (sock.meta.broker !== undefined) { kind = 'shop'; prompt = 'Trade wares'; }
        if (sock.meta.puzzle) { kind = 'puzzle'; prompt = 'Examine mechanism'; }
        if (sock.meta.relay) { kind = 'relay'; prompt = 'Take Resonance Relay'; }
        if (sock.meta.board) { kind = 'board'; prompt = 'Use routing board'; }
        if (sock.meta.isolator) { kind = 'isolator'; prompt = 'Pull main isolator'; }
        if (sock.meta.pylon !== undefined) { kind = 'pylon'; prompt = 'Tune resonance pylon'; }
        if (sock.meta.catalogue) { kind = 'catalogue'; prompt = 'Read Master Catalogue'; }
        if (underE) { kind = 'underEntrance'; prompt = 'Inspect sealed passage'; }
        if (underX) { kind = 'underExit'; prompt = 'Return to The Meridian'; }
        if (clampId) { kind = 'seal'; prompt = `Release seal clamp ${clampId.toUpperCase()}`; }
        if (underD) { kind = 'underEntrance'; prompt = 'Open Underscript passage'; }
        if (sock.meta.arrivalRegister) { kind = 'item'; prompt = 'Sign the register'; }
        if (sock.meta.vend !== undefined) {
          kind = 'vend';
          prompt = `Feed the machine — ${sock.meta.price as number} imprints`;
        }
        if (sock.kind === 'clue' && !sock.meta.catalogue) { kind = 'card'; prompt = 'Take catalog card'; }
        this.add({
          kind, id: `sock-${room.index}-${sock.pos.x.toFixed(1)}-${sock.pos.z.toFixed(1)}-${sock.kind}`,
          pos: sock.pos, prompt,
          data: sock, enabled: !sock.meta.taken, priority: kind === 'shop' ? 1 : 2,
          holdTime: kind === 'pylon' || kind === 'seal' || kind === 'vend' ? 1.2 : 0,
        });
      }
    }
  }

  /** Raycast-lite: score candidates by distance along view + angular alignment. */
  focus(eye: Vec3, lookDir: Vec3, playerPos: Vec3): Interactable | null {
    let best: Interactable | null = null;
    let bestScore = Infinity;
    for (const it of this.interactables) {
      if (!it.enabled) continue;
      const dx = it.pos.x - eye.x;
      const dy = (it.pos.y + 0.6) - eye.y;
      const dz = it.pos.z - eye.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const maxDist = PLAYER.interactRange + (it.reachBonus ?? 0);
      // Proximity fallback for targets below eye level (drawers, floors).
      const prox = v3dist(it.pos, playerPos);
      if (dist > maxDist && prox > maxDist * 0.8) continue;
      const nx = dx / (dist || 1), ny = dy / (dist || 1), nz = dz / (dist || 1);
      const align = nx * lookDir.x + ny * lookDir.y + nz * lookDir.z;
      const aligned = align > 0.86;
      const nearEnough = prox < 1.1; // forgiving edge cases
      if (!aligned && !nearEnough) continue;
      const score = dist - align - it.priority * 0.3;
      if (score < bestScore) { bestScore = score; best = it; }
    }
    this.focused = best;
    return best;
  }

  /** Advance hold-progress for the focused long action. */
  updateHold(dt: number, interacting: boolean): Interactable | null {
    const f = this.focused;
    if (!f || !interacting || !f.holdTime) {
      this.holdProgress = 0;
      this.holdTarget = null;
      return null;
    }
    if (this.holdTarget !== f.id) {
      this.holdTarget = f.id;
      this.holdProgress = 0;
    }
    this.holdProgress += dt;
    if (this.holdProgress >= f.holdTime) {
      this.holdProgress = 0;
      this.holdTarget = null;
      return f;
    }
    return null;
  }
}
