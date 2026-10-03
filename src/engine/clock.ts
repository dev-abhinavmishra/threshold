/**
 * Centralized game clock.
 *
 * All gameplay timers read from here so pausing, tab throttling, and hitches
 * can't teleport entities. `tick` receives wall-clock delta, clamps it to a
 * max frame step (avoids huge dt after tab switches), and accumulates into
 * `time` only while running.
 */
export class GameClock {
  /** Accumulated gameplay seconds since the run started. */
  time = 0;
  /** Delta of the last tick, seconds, clamped. */
  dt = 0;
  /** Wall-clock time at last tick (ms). */
  private lastMs: number | null = null;
  private running = false;
  /** Seconds of gameplay elapsed (includes while paused = no). */
  readonly maxStep = 1 / 15; // clamp tab-throttle deltas to ~66ms

  start(): void {
    this.running = true;
    this.lastMs = null;
  }

  stop(): void {
    this.running = false;
    this.lastMs = null;
  }

  get isRunning(): boolean {
    return this.running;
  }

  /** Call once per rAF. Returns true if gameplay should simulate this frame. */
  tick(nowMs: number): boolean {
    if (!this.running) {
      this.dt = 0;
      this.lastMs = nowMs;
      return false;
    }
    if (this.lastMs === null) {
      this.dt = 0;
      this.lastMs = nowMs;
      return true;
    }
    const raw = (nowMs - this.lastMs) / 1000;
    this.lastMs = nowMs;
    this.dt = Math.min(raw, this.maxStep);
    this.time += this.dt;
    return true;
  }

  /** Simulate a fixed duration — used by headless tests. */
  advance(seconds: number, step = 1 / 60): void {
    this.dt = step;
    this.time += seconds;
  }
}
