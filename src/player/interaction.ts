/**
 * Interaction system — a centered raycast plus forgiving proximity check.
 * One prompt at a time, highest-priority target wins. Interactions are
 * cancellable and never double-fire.
 */
import { v3dist, type Vec3 } from '../engine/math';
import type { Door, HidingSpot, Socket, RoomInstance, ItemId } from '../game/types';
import { PLAYER } from '../game/config';

export type InteractKind =
  | 'door' | 'peek' | 'listen' | 'brace' | 'wedge' | 'unwedge' | 'drawer' | 'socket' | 'hide' | 'exitHide' | 'vend' | 'claim' | 'register' | 'roster' | 'complaint' | 'workOrder' | 'crewBoard' | 'claimRegister' | 'watchSheet' | 'audit' | 'settle' | 'square' | 'docket' | 'counterClaim' | 'returnSlip' | 'affidavit' | 'tallyDrawer' | 'registerDrawer' | 'misfile' | 'wanted' | 'wantedTear'
  | 'item' | 'lore' | 'shop' | 'puzzle' | 'seal' | 'lift' | 'houseLine'
  | 'underEntrance' | 'underExit' | 'relay' | 'board' | 'isolator' | 'drain'
  | 'pylon' | 'catalogue' | 'card' | 'alarm' | 'merchant' | 'coffin' | 'piano' | 'tv' | 'tvoff' | 'clock' | 'valve' | 'hearth' | 'douse' | 'phone' | 'offHook' | 'hangUp' | 'dial' | 'trap' | 'snip' | 'bleed' | 'coax' | 'scrub' | 'chock' | 'unchock' | 'forge' | 'pick' | 'strip' | 'washer' | 'basket' | 'printer' | 'typewriter' | 'window' | 'cooler' | 'seat' | 'toll' | 'tape' | 'untape' | 'pry' | 'cutWord' | 'cutRepost' | 'stripCheck' | 'fix' | 'ask' | 'askReg' | 'till' | 'bell' | 'purse' | 'fence' | 'restock' | 'book' | 'seizedClaim' | 'seizedCut' | 'buyback' | 'wedgeDrop' | 'keyring' | 'askTally';

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
        const wired = sock.meta.wired === true;
        const coaxed = sock.meta.coaxed === true;
        this.add({
          kind: 'drawer', id: `drawer-${room.index}-${sock.pos.x.toFixed(1)}-${sock.pos.z.toFixed(1)}`,
          pos: sock.pos,
          prompt: locked ? 'Drawer (locked)' : wired ? 'Search drawer — the latch looks forced; kneel to coax it'
            : coaxed ? 'Search drawer — the latch is scarred, already worked' : 'Search drawer',
          holdTime: locked ? 1.6 : 0.5,
          data: sock, enabled: !sock.meta.opened, priority: 1,
        });
        // 'Coax the latch' lives in Game.rebuildInteractables — crouch-gated
        // like the submerged wire: you kneel to work a bitten latch.
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
        if (sock.meta.clerk !== undefined) { kind = 'shop'; prompt = 'Buy at the counter'; }
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
        if (sock.meta.claim !== undefined) {
          kind = 'claim';
          prompt = sock.meta.marginalia
            ? `Reclaim the effects tagged '${sock.meta.claimTag as string}' — ${sock.meta.price as number} marginalia`
            : `Claim the bag tagged '${sock.meta.claimTag as string}' — ${sock.meta.price as number} imprints`;
        }
        if (sock.meta.register !== undefined) {
          kind = 'register';
          prompt = `Read the guest ledger — ${sock.meta.price as number} imprints`;
        }
        if (sock.meta.roster !== undefined) {
          kind = 'roster';
          prompt = `Consult the duty roster — ${sock.meta.price as number} imprints`;
        }
        if (sock.meta.complaint !== undefined) {
          kind = 'complaint';
          prompt = `${sock.meta.fault ? 'Read the fault book' : 'Read the complaint book'} — ${sock.meta.price as number} imprints`;
        }
        if (sock.meta.crewBoard !== undefined) {
          kind = 'crewBoard';
          prompt = `Check the crew board — ${sock.meta.price as number} marginalia`;
        }
        if (sock.meta.claimRegister !== undefined) {
          kind = 'claimRegister';
          prompt = `Consult the claim register — ${sock.meta.price as number} marginalia`;
        }
        if (sock.meta.workOrder !== undefined) {
          kind = 'workOrder';
          prompt = `File the work order — ${sock.meta.price as number} marginalia`;
        }
        if (sock.meta.watchSheet !== undefined) {
          kind = 'watchSheet';
          prompt = `Read the inspection sheet — ${sock.meta.price as number} imprints`;
        }
        if (sock.meta.counterClaim !== undefined) {
          kind = 'counterClaim';
          prompt = `File a counter-claim — ${sock.meta.price as number} marginalia`;
        }
        if (sock.meta.returnSlip !== undefined) {
          kind = 'returnSlip';
          prompt = `File a return slip — ${sock.meta.price as number} marginalia`;
        }
        if (sock.meta.affidavit !== undefined) {
          kind = 'affidavit';
          prompt = `File an affidavit — ${sock.meta.price as number} imprints`;
        }
        if (sock.meta.misfile !== undefined) {
          kind = 'misfile';
          prompt = `Misfile a line item — ${sock.meta.price as number} marginalia`;
        }
        if (sock.meta.confiscated !== undefined) {
          kind = 'pry';
          prompt = 'Pry the confiscated case';
        }
        if (sock.kind === 'clue' && !sock.meta.catalogue) { kind = 'card'; prompt = 'Take catalog card'; }
        this.add({
          kind, id: `sock-${room.index}-${sock.pos.x.toFixed(1)}-${sock.pos.z.toFixed(1)}-${sock.kind}`,
          pos: sock.pos, prompt,
          data: sock,
          // sold sockets must not re-mint an offered verb — 'shop' cases
          // set meta.sold, and a stale 'Buy at the counter' would keep
          // focus and silently swallow presses near the counter
          enabled: !sock.meta.taken && sock.meta.sold !== true,
          // crewBoard/claimRegister sit ~0.5 off their host, which often
          // carries its own loot socket — outrank it or the book never focuses
          priority: kind === 'crewBoard' || kind === 'claimRegister' || kind === 'watchSheet' || kind === 'counterClaim' || kind === 'returnSlip' || kind === 'affidavit' || kind === 'misfile' || kind === 'pry' ? 3 : kind === 'shop' ? 1 : 2,
          holdTime: kind === 'pry' ? 2.2 : kind === 'pylon' || kind === 'seal' || kind === 'vend' || kind === 'claim' || kind === 'register' || kind === 'roster' || kind === 'complaint' || kind === 'workOrder' || kind === 'crewBoard' || kind === 'claimRegister' || kind === 'watchSheet' || kind === 'counterClaim' || kind === 'returnSlip' || kind === 'affidavit' || kind === 'misfile' ? 1.2 : 0,
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

/** Crouch-lean interacts on doors, re-registered per frame while crouched:
 *  a keyhole-peek on locked leaves, and ear-to-the-seam on any closed leaf.
 *  The seam sits one step off the leaf's edge — position-disambiguated so a
 *  door's centre still reads Open (crouch+quiet-open survives) and its edge
 *  reads Listen. False doors keep their seam: listening is the counter-tell. */
export function addCrouchedDoorInteracts(sys: InteractionSystem, hasChock = false, playerPos?: Vec3): void {
  for (const it of sys.interactables) {
    const d = it.data as Door | undefined;
    if (it.kind !== 'door' || !d) continue;
    if (d.locked && !d.falseDoor) {
      sys.add({
        kind: 'peek', id: `peek-${it.id}`, pos: it.pos,
        prompt: `Peek Door ${d.label}`, holdTime: 0.9,
        data: d, enabled: true, priority: 4,
      });
    }
    if (d.openT <= 0.4) {
      const latX = Math.cos(d.yaw), latZ = -Math.sin(d.yaw);
      sys.add({
        kind: 'listen', id: `listen-${it.id}`,
        pos: { x: it.pos.x + latX * 0.55, y: it.pos.y, z: it.pos.z + latZ * 0.55 },
        prompt: `Listen at Door ${d.label}`, holdTime: 1.1,
        data: d, enabled: true, priority: 4,
      });
      // The mirror seam: brace the leaf shut. Held things can't be braced,
      // false doors have nothing behind them worth bracing against.
      if (!d.falseDoor && !d.heldBy) {
        sys.add({
          kind: 'brace', id: `brace-${it.id}`,
          pos: { x: it.pos.x - latX * 0.55, y: it.pos.y, z: it.pos.z - latZ * 0.55 },
          prompt: `Brace Door ${d.label}`, holdTime: 0.8,
          data: d, enabled: true, priority: 4,
        });
        // The chock — brace's paid cousin: set it and walk away, but it
        // gives before your weight does. Sits a step off the leaf on the
        // player's side — dead-centre loses focus to the nearer seam.
        if (hasChock) {
          const nX = Math.sin(d.yaw), nZ = Math.cos(d.yaw);
          const side = playerPos ? Math.sign((playerPos.x - it.pos.x) * nX + (playerPos.z - it.pos.z) * nZ) || 1 : 1;
          sys.add({
            kind: 'wedge', id: `wedge-${it.id}`,
            pos: { x: it.pos.x + nX * side * 0.45, y: it.pos.y - 0.12, z: it.pos.z + nZ * side * 0.45 },
            prompt: `Wedge Door ${d.label}`, holdTime: 0.9,
            data: d, enabled: true, priority: 4,
          });
        }
      } else if (!d.falseDoor && d.heldBy === 'wedge') {
        // Yours — pull it free to reclaim it. Same side rule as the set.
        const nX = Math.sin(d.yaw), nZ = Math.cos(d.yaw);
        const side = playerPos ? Math.sign((playerPos.x - it.pos.x) * nX + (playerPos.z - it.pos.z) * nZ) || 1 : 1;
        sys.add({
          kind: 'unwedge', id: `unwedge-${it.id}`,
          pos: { x: it.pos.x + nX * side * 0.45, y: it.pos.y - 0.12, z: it.pos.z + nZ * side * 0.45 },
          prompt: 'Pull the wedge free', holdTime: 0.5,
          data: d, enabled: true, priority: 4,
        });
      }
    }
  }
}
