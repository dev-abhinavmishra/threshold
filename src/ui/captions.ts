/** Caption rail — pure render-side helpers for the HUD subtitle strip.
 *  The rail holds the last few caption events but never forgot: a stale
 *  read ("[stone drags to the fresh sign]") lingered indefinitely once
 *  the room went quiet, reading as if it just happened. These helpers
 *  age captions out by severity and fold identical consecutive reads
 *  into a ×N run so a storm of one repeated tell does not flood the
 *  rail. Sprint 690 — the rail keeps its hour. */
import type { CueSeverity } from '../audio/audio';

export interface RailCaption {
  text: string;
  severity: CueSeverity;
  key: number; // caption event timestamp (performance.now() at emit)
}

/** How long a caption keeps the rail, ms — danger reads longest:
 *  the last thing before a death deserves to stay up. */
export const CAPTION_DWELL: Record<CueSeverity, number> = { info: 4200, warn: 5200, danger: 7000 };

/** At most this many lines ride the rail at once. */
export const CAPTION_MAX_LINES = 3;

export interface RenderCaption {
  text: string;
  severity: CueSeverity;
  key: number;
  /** Folded repeat count — the same read arriving back-to-back shows ×N
   *  instead of stacking identical lines. */
  count: number;
}

/** The rail's visible face at a moment: drop expired reads, fold
 *  consecutive repeats, keep the newest MAX_LINES. */
export function visibleCaptions(subs: readonly RailCaption[], now: number): RenderCaption[] {
  const live: RenderCaption[] = [];
  for (const c of subs) {
    if (now - c.key > CAPTION_DWELL[c.severity]) continue;
    const last = live[live.length - 1];
    if (last && last.text === c.text && last.severity === c.severity) {
      last.count++;
      last.key = c.key; // the fold rides the newest stamp — repeats refresh its dwell
    } else {
      live.push({ text: c.text, severity: c.severity, key: c.key, count: 1 });
    }
  }
  return live.slice(-CAPTION_MAX_LINES);
}
