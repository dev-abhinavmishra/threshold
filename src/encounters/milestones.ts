/**
 * Milestone encounter controllers — authored set-pieces bound to specific
 * generated rooms. Each controller owns its entities, reads interactions,
 * and reports completion. All puzzle data derives from the run seed.
 */
import type { Vec3 } from '../engine/math';
import { Rng } from '../engine/rng';
import type { RoomInstance, Socket } from '../game/types';
import type { EntityCtx } from '../entities/base';
import type { Interactable } from '../player/interaction';
import { Curator } from '../entities/curator';
import { Pursuer, Orrery } from '../entities/setpieces';
import { corridorPath } from '../entities/base';

export interface MilestoneEvents {
  ctx: () => EntityCtx;
  spawnEntity: (e: import('../entities/base').Entity) => void;
  cue: (name: string, at: Vec3 | null, caption: string, severity?: 'info' | 'warn' | 'danger') => void;
  unlockMainDoor: (room: RoomInstance) => void;
  openExit: (room: RoomInstance) => void;
  enterUnderscript: () => void;
  exitUnderscript: () => void;
  victory: () => void;
  giveItem: (item: string, count?: number) => void;
  spendImprints: (n: number) => boolean;
  hasItem: (id: string) => boolean;
}

export abstract class Milestone {
  done = false;
  constructor(protected room: RoomInstance, protected ev: MilestoneEvents) {}
  abstract update(dt: number): void;
  /** Return true if this milestone consumed the interaction. */
  onInteract(_it: Interactable): boolean {
    return false;
  }
  /** Per-frame hold on a focused interactable (e.g. pylon charging). */
  onHold(_it: Interactable, _dt: number): void {}
  dispose(): void {}
}

/* ============================ THE INDEX (Room 50) ============================ */
const GLYPHS = ['Archive', 'Suture', 'Lantern', 'Orrery', 'Seal', 'Choir', 'Ledger', 'Hollow', 'Meridian', 'Index', 'Gate'];

export class IndexEncounter extends Milestone {
  private curator: Curator;
  private cardsTaken = 0;
  private cardsNeeded = 5;
  private targetGlyphs: string[] = [];
  private consoleStep = 0;
  private consoleShowing = 0;
  private catalogRead = false;
  private breatheT = 0;

  constructor(room: RoomInstance, ev: MilestoneEvents, seed: number) {
    super(room, ev);
    const rng = new Rng(seed ^ 0x50de);
    // pick 3 ordered glyphs deterministically
    const pool = [...GLYPHS];
    rng.shuffle(pool);
    this.targetGlyphs = pool.slice(0, 3);
    this.curator = new Curator();
    this.curator.containTo(room);
    this.curator.setLevel(1);
  }

  get glyphs(): readonly string[] {
    return this.catalogRead ? this.targetGlyphs : [];
  }

  get cardsRemaining(): number {
    return Math.max(0, this.cardsNeeded - this.cardsTaken);
  }

  enter(): void {
    this.ev.spawnEntity(this.curator);
    this.ev.cue('curator-enter', null, '[collect five catalog cards — quietly]', 'warn');
  }

  override update(dt: number): void {
    this.breatheT += dt;
    if (this.breatheT > 9) {
      this.breatheT = 0;
      this.ev.cue('curator-search', this.curator.position, '', 'info');
    }
  }

  override onInteract(it: Interactable): boolean {
    if (it.kind === 'card') {
      const sock = it.data as Socket;
      if (!sock.meta.taken) {
        sock.meta.taken = true;
        it.enabled = false;
        this.cardsTaken++;
        this.ev.ctx().sound.emit({ x: it.pos.x, y: 1, z: it.pos.z, intensity: 0.35, category: 'item', caption: '[card slide]' });
        this.ev.cue('pickup', it.pos, `[catalog card ${this.cardsTaken}/5]`);
        if (this.cardsTaken >= this.cardsNeeded) {
          this.ev.cue('checkpoint', null, '[the catalogue will answer now — read it]', 'info');
        }
        return true;
      }
    }
    if (it.kind === 'catalogue') {
      if (this.cardsTaken < this.cardsNeeded) {
        this.ev.cue('door-locked', it.pos, `[need ${this.cardsRemaining} more catalog card(s)]`, 'warn');
      } else {
        this.catalogRead = true;
        this.ev.cue('pickup', it.pos, `[the glyph order: ${this.targetGlyphs.join(' → ')}]`, 'info');
      }
      return true;
    }
    if (it.kind === 'puzzle') {
      if (!this.catalogRead) {
        this.ev.cue('door-locked', it.pos, '[the seal console wants a glyph order]', 'warn');
        return true;
      }
      // cycle console showing glyph; correct press advances step
      this.consoleShowing = (this.consoleShowing + 1) % GLYPHS.length;
      const shown = GLYPHS[this.consoleShowing];
      this.ev.cue('stabilize-tick', it.pos, `[console shows: ${shown}]`, 'info');
      if (shown === this.targetGlyphs[this.consoleStep]) {
        this.consoleStep++;
        this.ev.cue('stabilize-good', it.pos, `[glyph ${this.consoleStep}/3 accepted]`, 'info');
        if (this.consoleStep >= 3) {
          this.done = true;
          this.ev.unlockMainDoor(this.room);
          this.ev.cue('door-unlock', null, '[the Index releases you]', 'info');
        }
      } else if (shown === this.targetGlyphs[0] && this.consoleStep !== 0) {
        // reset handled below
      } else {
        // wrong glyph while a step was pending — loud failure, resets
        if (this.consoleStep > 0 && shown !== this.targetGlyphs[this.consoleStep]) {
          this.consoleStep = 0;
          this.ev.ctx().sound.emit({ x: it.pos.x, y: 1, z: it.pos.z, intensity: 0.8, category: 'puzzle-fail', caption: '[the console rejects the glyph]' });
          this.ev.cue('stabilize-bad', it.pos, '[wrong glyph — sequence reset]', 'warn');
        }
      }
      return true;
    }
    return false;
  }

  override dispose(): void {
    this.curator.dispose();
  }
}

/* ============================ CUSTODIAN'S COUNTER (Room 51) ============================ */
export class CustodianEncounter extends Milestone {
  /** shop sockets on 'itemPedestal' with meta.shop = slot index. */
  constructor(room: RoomInstance, ev: MilestoneEvents) {
    super(room, ev);
  }

  override update(): void {}

  override onInteract(it: Interactable): boolean {
    if (it.kind !== 'shop') return false;
    const sock = it.data as Socket;
    if (sock.meta.sold) return true;
    const item = sock.meta.shopItem as string;
    const price = (sock.meta.price as number) ?? 30;
    if (this.ev.spendImprints(price)) {
      sock.meta.sold = true;
      it.enabled = false;
      this.ev.giveItem(item, 1);
      this.ev.cue('purchase', it.pos, `[purchased — ${price} imprints]`, 'info');
    } else {
      this.ev.cue('door-locked', it.pos, `[${price} imprints required]`, 'warn');
    }
    return true;
  }
}

/* ============================ CHASES ============================ */
export class ChaseEncounter extends Milestone {
  private pursuer: Pursuer;
  private started = false;
  private path: Vec3[] = [];
  private startIndex: number;
  private endIndex: number;
  private getRooms: () => RoomInstance[];

  constructor(room: RoomInstance, ev: MilestoneEvents, startIndex: number, endIndex: number, getRooms: () => RoomInstance[]) {
    super(room, ev);
    this.startIndex = startIndex;
    this.endIndex = endIndex;
    this.getRooms = getRooms;
    this.pursuer = new Pursuer();
  }

  enter(): void {
    if (this.started) return;
    this.started = true;
    const rooms = this.getRooms();
    // path: from two rooms behind startIndex through to endIndex
    const from = Math.max(0, this.startIndex - 2);
    this.path = corridorPath(rooms, from, Math.min(rooms.length - 1, this.endIndex));
    this.ev.spawnEntity(this.pursuer);
    this.pursuer.begin(this.path);
    this.ev.cue('pursuer-roar', this.path[0], '[RUN — do not stop]', 'danger');
  }

  override update(): void {
    if (!this.started || this.done) return;
    const c = this.ev.ctx();
    // chase ends when player reaches the end room
    if (c.currentRoomIndex >= this.endIndex) {
      this.done = true;
      this.pursuer.end();
      this.ev.cue('door-open', null, '[the passage seals behind you]', 'info');
    }
  }

  override dispose(): void {
    this.pursuer.dispose();
  }
}

/* ============================ LENS HALL (Room ~75) ============================ */
export class LensHallEncounter extends Milestone {
  private orrery: Orrery;
  private entered = false;

  constructor(room: RoomInstance, ev: MilestoneEvents) {
    super(room, ev);
    this.orrery = new Orrery();
  }

  enter(): void {
    if (this.entered) return;
    this.entered = true;
    this.ev.spawnEntity(this.orrery);
    this.ev.cue('orrery-wake', null, '[four pylons — tune each while the beams sweep]', 'warn');
  }

  get solved(): boolean {
    return this.orrery.solved;
  }

  override update(): void {
    if (this.orrery.solved && !this.done) {
      this.done = true;
      this.ev.unlockMainDoor(this.room);
    }
  }

  override onHold(it: Interactable, dt: number): void {
    if (it.kind !== 'pylon' || this.orrery.solved) return;
    const sock = it.data as Socket;
    const idx = (sock.meta.pylon as number) ?? 0;
    this.orrery.chargePylon(idx, dt);
    if (Math.random() < dt * 8) this.ev.cue('stabilize-tick', it.pos, '', 'info');
  }

  override onInteract(): boolean {
    return false;
  }

  override dispose(): void {
    this.orrery.dispose();
  }
}

/* ============================ THE ENGINE (Room 100) ============================ */
type EnginePhase = 'breach' | 'relays' | 'routing' | 'escape';

export class EngineEncounter extends Milestone {
  private curator: Curator;
  private phase: EnginePhase = 'breach';
  private relaysNeeded = 5;
  private relaysTaken = 0;
  private routingSequence: number[] = [];
  private routingStep = 0;
  private entered = false;

  constructor(room: RoomInstance, ev: MilestoneEvents, seed: number) {
    super(room, ev);
    const rng = new Rng(seed ^ 0xe961e);
    this.routingSequence = [0, 1, 2].map(() => rng.int(0, 6));
    this.curator = new Curator();
    this.curator.containTo(room);
    this.curator.setLevel(2);
  }

  get phaseName(): EnginePhase {
    return this.phase;
  }

  enter(): void {
    if (this.entered) return;
    this.entered = true;
    this.ev.cue('engine-hum', null, '[the Engine stalls — recover the relays]', 'danger');
    this.ev.spawnEntity(this.curator);
    this.phase = 'relays';
  }

  override update(): void {
    if (this.done) return;
    if (this.phase === 'relays' && this.relaysTaken >= this.relaysNeeded) {
      this.phase = 'routing';
      this.ev.cue('relay', null, `[routing board online — sequence: ${this.routingSequence.map((n) => n + 1).join(' · ')}]`, 'info');
    }
  }

  override onInteract(it: Interactable): boolean {
    if (it.kind === 'relay' && this.phase === 'relays') {
      const sock = it.data as Socket;
      if (!sock.meta.taken) {
        sock.meta.taken = true;
        it.enabled = false;
        this.relaysTaken++;
        this.ev.ctx().sound.emit({ x: it.pos.x, y: 1, z: it.pos.z, intensity: 0.5, category: 'machine', caption: '[relay pulled]' });
        this.ev.cue('relay', it.pos, `[relay ${this.relaysTaken}/${this.relaysNeeded}]`, 'info');
      }
      return true;
    }
    if (it.kind === 'board' && this.phase === 'routing') {
      // Player presses the board when standing nearest to the correct terminal.
      // Simpler authored version: board cycles through terminals 0..6 on each press;
      // press when it shows the next number in sequence.
      const sock = it.data as Socket;
      const showing = ((sock.meta.showing as number) ?? -1) + 1;
      sock.meta.showing = showing > 6 ? 0 : showing;
      const cur = sock.meta.showing as number;
      this.ev.cue('stabilize-tick', it.pos, `[board shows terminal ${cur + 1}]`);
      if (cur === this.routingSequence[this.routingStep]) {
        this.routingStep++;
        this.ev.cue('stabilize-good', it.pos, `[route ${this.routingStep}/3 locked]`, 'info');
        if (this.routingStep >= 3) {
          this.phase = 'escape';
          this.ev.unlockMainDoor(this.room);
          this.ev.cue('orrery-done', null, '[routing complete — the freight lift is free. GO]', 'danger');
        }
      } else {
        this.routingStep = 0;
        this.ev.ctx().sound.emit({ x: it.pos.x, y: 1, z: it.pos.z, intensity: 0.9, category: 'puzzle-fail', caption: '[route rejected]' });
        this.ev.cue('stabilize-bad', it.pos, '[route rejected — sequence reset]', 'warn');
      }
      return true;
    }
    if (it.kind === 'isolator') {
      if (this.phase === 'escape') {
        this.done = true;
        this.ev.victory();
      } else {
        this.ev.cue('door-locked', it.pos, '[the lift is dead until routing completes]', 'warn');
      }
      return true;
    }
    return false;
  }

  override dispose(): void {
    this.curator.dispose();
  }
}

/* ============================ UNDERSCRIPT ENTRY ============================ */
export class UnderscriptGate extends Milestone {
  private clamps = new Set<string>();
  enter(): void {}
  override update(): void {}
  get clampsDone(): number {
    return this.clamps.size;
  }
  override onInteract(it: Interactable): boolean {
    if (it.kind === 'seal') {
      const sock = it.data as Socket;
      const id = sock.meta.sealClamp as string;
      if (!this.clamps.has(id)) {
        this.clamps.add(id);
        it.enabled = false;
        this.ev.cue('relay', it.pos, `[clamp ${id.toUpperCase()} released — ${2 - this.clamps.size} remain]`, 'info');
      }
      return true;
    }
    if (it.kind === 'underEntrance') {
      if (this.clamps.size < 2) {
        this.ev.cue('door-locked', it.pos, '[two seal clamps hold it shut]', 'warn');
        return true;
      }
      if (!this.ev.hasItem('resonanceKey')) {
        this.ev.cue('door-locked', it.pos, '[it wants a Resonance Key]', 'warn');
        return true;
      }
      this.ev.enterUnderscript();
      return true;
    }
    return false;
  }
}
