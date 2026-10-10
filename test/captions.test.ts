/** Sprint 690-691 — the rail keeps its hour.
 *  The caption rail used to hold its last reads forever: a stale tell
 *  lingered after the room went quiet, reading as if it just happened.
 *  These pin the render-side helper — expiry per severity, the ×N fold,
 *  the line cap — plus the ARIA wiring in App.tsx. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { visibleCaptions, CAPTION_DWELL, CAPTION_MAX_LINES } from '../src/ui/captions';
import type { RailCaption } from '../src/ui/captions';

const cap = (text: string, severity: RailCaption['severity'], key: number): RailCaption => ({ text, severity, key });

describe('the rail keeps its hour (sprints 690-692)', () => {
  it('drops reads past their dwell', () => {
    const now = 10_000;
    const subs = [
      cap('old info', 'info', now - CAPTION_DWELL.info - 1),
      cap('fresh info', 'info', now - 1000),
    ];
    const out = visibleCaptions(subs, now);
    expect(out.map((c) => c.text)).toEqual(['fresh info']);
  });

  it('danger keeps the rail longest — the last read before a death stays up', () => {
    const now = 10_000;
    expect(visibleCaptions([cap('d', 'danger', now - CAPTION_DWELL.danger + 1)], now)).toHaveLength(1);
    expect(visibleCaptions([cap('d', 'danger', now - CAPTION_DWELL.danger - 1)], now)).toHaveLength(0);
    expect(CAPTION_DWELL.danger).toBeGreaterThan(CAPTION_DWELL.warn);
    expect(CAPTION_DWELL.warn).toBeGreaterThan(CAPTION_DWELL.info);
  });

  it('a caption exactly at its dwell still shows', () => {
    const now = 10_000;
    const out = visibleCaptions([cap('edge', 'info', now - CAPTION_DWELL.info)], now);
    expect(out).toHaveLength(1);
  });

  it('folds consecutive identical reads into a ×N run', () => {
    const now = 10_000;
    const subs = [
      cap('stone drags', 'warn', now - 3000),
      cap('stone drags', 'warn', now - 2000),
      cap('stone drags', 'warn', now - 1000),
    ];
    const out = visibleCaptions(subs, now);
    expect(out).toHaveLength(1);
    expect(out[0].count).toBe(3);
    expect(out[0].key).toBe(now - 1000); // fold rides the newest stamp
  });

  it('does not fold across severity or text changes', () => {
    const now = 10_000;
    const subs = [
      cap('same', 'info', now - 3000),
      cap('same', 'warn', now - 2000),
      cap('other', 'warn', now - 1000),
    ];
    const out = visibleCaptions(subs, now);
    expect(out.map((c) => c.count)).toEqual([1, 1, 1]);
  });

  it('a non-consecutive repeat does not fold back', () => {
    const now = 10_000;
    const subs = [
      cap('a', 'info', now - 3000),
      cap('b', 'info', now - 2000),
      cap('a', 'info', now - 1000),
    ];
    expect(visibleCaptions(subs, now)).toHaveLength(3);
  });

  it('keeps only the newest lines', () => {
    const now = 10_000;
    const subs = Array.from({ length: 8 }, (_, i) => cap(`c${i}`, 'info', now - 800 + i * 10));
    const out = visibleCaptions(subs, now);
    expect(out).toHaveLength(CAPTION_MAX_LINES);
    expect(out[0].text).toBe('c5');
    expect(out[2].text).toBe('c7');
  });

  it('an expired read no longer counts against the cap', () => {
    const now = 10_000;
    const subs = [
      cap('stale', 'info', now - CAPTION_DWELL.info - 500),
      cap('x', 'info', now - 300),
      cap('y', 'info', now - 200),
      cap('z', 'info', now - 100),
    ];
    const out = visibleCaptions(subs, now);
    expect(out.map((c) => c.text)).toEqual(['x', 'y', 'z']);
  });
});

describe('the rail speaks once — App wiring pins', () => {
  const app = readFileSync(join(__dirname, '../src/ui/App.tsx'), 'utf8');

  it('the rail renders through visibleCaptions, not a raw slice', () => {
    expect(app).toMatch(/visibleCaptions\(hud\.subtitles,\s*performance\.now\(\)\)/);
    expect(app).not.toMatch(/hud\.subtitles\.slice/);
  });

  it('the rail is a polite live log', () => {
    expect(app).toMatch(/className="captions"[^>]*role="log"/);
    expect(app).toMatch(/aria-live="polite"/);
  });

  it('folded repeats render their count', () => {
    expect(app).toMatch(/c\.count > 1/);
  });

});

describe('the room names its instruments — ARIA pins', () => {
  const app = readFileSync(join(__dirname, '../src/ui/App.tsx'), 'utf8');

  it('HUD bars announce as progressbars with live values', () => {
    expect(app).toMatch(/role="progressbar"/);
    expect(app).toMatch(/aria-valuenow/);
    expect(app).toMatch(/aria-valuemax/);
  });

  it('decorative chrome hides from the reader', () => {
    expect(app).toMatch(/className="crosshair"[^>]*aria-hidden/);
    expect(app).toMatch(/className="vignette"[^>]*aria-hidden/);
  });
});
