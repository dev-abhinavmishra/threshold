/**
 * Typed event bus + positional sound event bus.
 *
 * GameEventBus carries gameplay lifecycle signals. SoundEventBus is how the
 * world reports *positional gameplay noise* (footsteps, drawers, thrown
 * objects, puzzle failures) that entities like the Curator listen to and the
 * caption system describes.
 */

export type Unsubscribe = () => void;

export class EventBus<Events extends { [K in keyof Events]: unknown }> {
  private handlers = new Map<keyof Events, Set<(payload: never) => void>>();

  on<K extends keyof Events>(event: K, fn: (payload: Events[K]) => void): Unsubscribe {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(fn as (payload: never) => void);
    return () => set!.delete(fn as (payload: never) => void);
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const fn of [...set]) (fn as (p: Events[K]) => void)(payload);
  }

  clear(): void {
    this.handlers.clear();
  }
}

export type SoundCategory =
  | 'footstep'
  | 'sprint'
  | 'door'
  | 'drawer'
  | 'impact'
  | 'item'
  | 'puzzle-fail'
  | 'machine'
  | 'distraction'
  | 'entity-cue'
  | 'ambient'
  | 'critter';

export interface SoundEvent {
  /** World position. */
  x: number;
  y: number;
  z: number;
  /** Loudness 0..1 — Curator weights by this and distance. */
  intensity: number;
  category: SoundCategory;
  /** Caption text like "[metal drawer, right]" — empty for uncaptioned. */
  caption: string;
  /** Direction hint for captions (left/right/behind/ahead) resolved at emit. */
  direction?: 'left' | 'right' | 'ahead' | 'behind' | 'above' | 'below';
  /** Floor surface under the emitter (wood/carpet/stone/metal/concrete/paper) — varies footstep timbre. */
  surface?: string;
}

type SoundListener = (event: SoundEvent) => void;

export class SoundEventBus {
  private listeners = new Set<SoundListener>();
  /** Rolling log of recent events — entities sample it; capped for memory. */
  readonly recent: SoundEvent[] = [];
  private static MAX_RECENT = 64;

  emit(event: SoundEvent): void {
    this.recent.push(event);
    if (this.recent.length > SoundEventBus.MAX_RECENT) this.recent.shift();
    for (const fn of [...this.listeners]) fn(event);
  }

  on(fn: SoundListener): Unsubscribe {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  clear(): void {
    this.listeners.clear();
    this.recent.length = 0;
  }
}
