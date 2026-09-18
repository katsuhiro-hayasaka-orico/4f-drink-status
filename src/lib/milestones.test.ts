import { describe, expect, it } from 'vitest';
import { nextCelebration, parseCelebrated } from './milestones.js';

describe('nextCelebration', () => {
  it('celebrates the tenth posting, once', () => {
    expect(nextCelebration(9, 0)).toBeNull();
    expect(nextCelebration(10, 0)).toBe(10);
    expect(nextCelebration(10, 10)).toBeNull();
    expect(nextCelebration(11, 10)).toBeNull();
  });

  it('keeps going every ten', () => {
    expect(nextCelebration(20, 10)).toBe(20);
    expect(nextCelebration(100, 90)).toBe(100);
  });

  it('collapses a run the device missed into one thank-you', () => {
    // Away (or in private mode) while the count passed 10 and 20: say 30 once
    // rather than three toasts in a row, or nothing at all.
    expect(nextCelebration(34, 9)).toBe(30);
    expect(nextCelebration(34, 30)).toBeNull();
  });

  it('says nothing when storage could not be read', () => {
    // readCelebrated returns Infinity there, which has to read as "already
    // celebrated everything" — otherwise every page load congratulates again.
    expect(nextCelebration(12, Infinity)).toBeNull();
    expect(nextCelebration(1200, Infinity)).toBeNull();
  });

  it('ignores a count that is not a real number', () => {
    expect(nextCelebration(Number.NaN, 0)).toBeNull();
    expect(nextCelebration(0, 0)).toBeNull();
  });
});

describe('parseCelebrated', () => {
  const me = 'device-1';

  it('reads back what markCelebrated writes', () => {
    expect(parseCelebrated(`${me}:30`, me)).toBe(30);
  });

  it('ignores progress that belongs to another identity', () => {
    // A shared browser, or this device's own cookie rotated: a new contributor
    // starts from zero and must not inherit a stranger's ceiling.
    expect(parseCelebrated('device-2:90', me)).toBe(0);
    expect(parseCelebrated('30', me)).toBe(0);
  });

  it('survives a user id containing a colon', () => {
    expect(parseCelebrated('a:b:c:20', 'a:b:c')).toBe(20);
  });

  it('treats anything unparseable as never celebrated', () => {
    expect(parseCelebrated(null, me)).toBe(0);
    expect(parseCelebrated('', me)).toBe(0);
    expect(parseCelebrated(`${me}:`, me)).toBe(0);
    expect(parseCelebrated(`${me}:abc`, me)).toBe(0);
    expect(parseCelebrated(`${me}:-10`, me)).toBe(0);
    expect(parseCelebrated(`${me}:10.5`, me)).toBe(0);
    expect(parseCelebrated(`${me}:30`, '')).toBe(0);
  });
});
