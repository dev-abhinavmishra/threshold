/** Adaptive post-effects governor: rolls a fps EMA and sheds the most
 *  expensive post steps first — SSAO, then bloom, then render scale —
 *  when the GPU can't hold the frame rate, and restores them when
 *  headroom returns. Hysteresis (2.5s to shed, 10s to restore) keeps the
 *  ladder from oscillating on frame noise.
 *
 *  The steps are a fixed ladder built from whatever the quality preset
 *  enabled: at 'medium' the SSAO step simply isn't in the ladder, so a
 *  degrade goes straight to bloom; 'low' degrades to render scale only.
 */

export interface GovernorHooks {
  setSsao(on: boolean): void;
  setBloom(on: boolean): void;
  /** Render resolution multiplier — 1 is full res. */
  setScale(mul: number): void;
}

export type GovernorStep = 'ssao' | 'bloom' | 'scale';

export const GOVERNOR = {
  /** fps below this for LOW_S sustains a degrade step. */
  lowFps: 45,
  /** fps above this for HIGH_S sustains a restore step. */
  highFps: 56,
  lowS: 2.5,
  highS: 10,
  /** Render-scale multiplier for the last step. */
  scaleMul: 0.7,
  /** EMA smoothing per frame sample. */
  ema: 0.92,
} as const;

export class PostGovernor {
  /** How many degrade steps are currently engaged (0 = full effects). */
  tier = 0;
  private fpsEma = 0;
  private lowT = 0;
  private highT = 0;
  private readonly steps: GovernorStep[];

  constructor(private hooks: GovernorHooks, opts: { hasSsao: boolean; hasBloom: boolean }) {
    this.steps = [];
    if (opts.hasSsao) this.steps.push('ssao');
    if (opts.hasBloom) this.steps.push('bloom');
    this.steps.push('scale');
  }

  /** Called once per rendered frame with the REAL frame delta (not the
   *  clamped game dt). `enabled` gates the whole governor — when the
   *  user turns adaptive quality off, everything restores at once. */
  update(realDt: number, enabled: boolean): void {
    if (realDt <= 0) return;
    const fps = 1 / realDt;
    this.fpsEma = this.fpsEma === 0 ? Math.min(fps, 60) : this.fpsEma * GOVERNOR.ema + fps * (1 - GOVERNOR.ema);

    if (!enabled) {
      if (this.tier !== 0) this.applyTier(0);
      this.lowT = this.highT = 0;
      return;
    }
    // Sustain must be CONTINUOUS: any recovery above the threshold
    // clears the accumulator, so brief jank never banks a degrade step.
    if (this.fpsEma < GOVERNOR.lowFps) { this.lowT += realDt; this.highT = 0; }
    else if (this.fpsEma > GOVERNOR.highFps) { this.highT += realDt; this.lowT = 0; }
    else { this.lowT = 0; this.highT = 0; }

    if (this.lowT > GOVERNOR.lowS && this.tier < this.steps.length) {
      this.applyTier(this.tier + 1);
      this.lowT = 0;
    } else if (this.highT > GOVERNOR.highS && this.tier > 0) {
      this.applyTier(this.tier - 1);
      this.highT = 0;
    }
  }

  /** Quality preset changed — the pass set changed with it; clear
   *  engaged steps so the next update re-evaluates from scratch. The
   *  caller rebuilds `steps` by constructing a new governor. */
  private applyTier(t: number): void {
    const prev = this.tier;
    this.tier = t;
    for (let i = 0; i < this.steps.length; i++) {
      const engaged = i < t;
      if (engaged === (i < prev)) continue; // only write what flipped
      switch (this.steps[i]) {
        case 'ssao': this.hooks.setSsao(!engaged); break;
        case 'bloom': this.hooks.setBloom(!engaged); break;
        case 'scale': this.hooks.setScale(engaged ? GOVERNOR.scaleMul : 1); break;
      }
    }
  }

  /** Quality preset changed — restore everything engaged; the caller
   *  may rebuild the pass set underneath us. */
  hardReset(): void {
    this.applyTier(0);
    this.lowT = this.highT = 0;
  }

  /** Debug/test surface. */
  get fps(): number { return this.fpsEma; }
}
