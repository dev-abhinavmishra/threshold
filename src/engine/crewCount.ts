/* The count — crew property is tallied on a slow cycle. Pilfering a
 * lost-property cage, the sledge's cargo, or its lamp queues a loss-report
 * that rings at the socket ~75s later: the books below mark the till light
 * whether you're still there or not. Delayed heat that lands where you
 * WERE — pilfer-and-move and the count hunts your shadow; pilfer-and-linger
 * and it finds you. The laundress's keen is the same thought made flesh;
 * this is the books' turn to wail. Pure (no Game/THREE) so vitest drives it. */

export interface CrewLoss {
  x: number;
  z: number;
  t: number;
  caption: string;
}

export const COUNT_DELAY = 75;

export class CrewCount {
  private losses: CrewLoss[] = [];

  /** Queue a loss-report to ring at (x, z) `delay` sim-seconds after `now`. */
  push(x: number, z: number, now: number, caption: string, delay = COUNT_DELAY): void {
    this.losses.push({ x, z, t: now + delay, caption });
  }

  /** Fire every due report through `emit`. Call once per frame with sim time. */
  tick(now: number, emit: (l: CrewLoss) => void): void {
    while (this.losses.length && this.losses[0].t <= now) emit(this.losses.shift() as CrewLoss);
  }

  get pending(): number {
    return this.losses.length;
  }

  /** The sockets of every still-queued report — the books marked them
   *  together, so a dispatch may route through tills that haven't rung. */
  pendingSockets(): { x: number; z: number }[] {
    return this.losses.map((l) => ({ x: l.x, z: l.z }));
  }

  /** Run teardown — a queued report must not ring in the next run. */
  reset(): void {
    this.losses = [];
  }
}
