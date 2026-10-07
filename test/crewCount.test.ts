import { describe, it, expect } from 'vitest';
import { CrewCount, COUNT_DELAY, type CrewLoss } from '../src/engine/crewCount';

describe('the count — crew property rings late (sprint 305)', () => {
  it('fires each queued loss once, in order, only when due', () => {
    const c = new CrewCount();
    const fired: CrewLoss[] = [];
    c.push(1, 2, 100, 'first');
    c.push(3, 4, 120, 'second');
    expect(c.pending).toBe(2);
    c.tick(100 + COUNT_DELAY - 0.01, (l) => fired.push(l));
    expect(fired).toHaveLength(0); // nothing early
    c.tick(100 + COUNT_DELAY, (l) => fired.push(l));
    expect(fired).toHaveLength(1);
    expect(fired[0].caption).toBe('first');
    expect(fired[0].x).toBe(1);
    c.tick(120 + COUNT_DELAY + 1, (l) => fired.push(l));
    expect(fired).toHaveLength(2);
    expect(c.pending).toBe(0);
    c.tick(120 + COUNT_DELAY + 99, (l) => fired.push(l)); // no double-fire
    expect(fired).toHaveLength(2);
  });

  it('several losses due on the same frame all fire together', () => {
    const c = new CrewCount();
    const fired: string[] = [];
    c.push(0, 0, 0, 'a', 10);
    c.push(0, 0, 0, 'b', 12);
    c.push(0, 0, 0, 'c', 14);
    c.tick(20, (l) => fired.push(l.caption));
    expect(fired).toEqual(['a', 'b', 'c']);
  });
});
