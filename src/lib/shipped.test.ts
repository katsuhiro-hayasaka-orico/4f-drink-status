import { describe, expect, it } from 'vitest';
import { byNewestFirst, formatShippedDate } from './shipped.js';
import type { ShippedItem } from './shipped.js';

const item = (when: string, change: string): ShippedItem => ({ when, voice: 'v', change });

describe('byNewestFirst', () => {
  it('puts the newest change at the top', () => {
    const out = byNewestFirst([
      item('2026-08-28', 'a'),
      item('2026-09-04', 'b'),
      item('2026-08-01', 'c'),
    ]);
    expect(out.map((i) => i.change)).toEqual(['b', 'a', 'c']);
  });

  it('sorts October above September', () => {
    // The reason the dates are stored as ISO: as display strings this pair
    // sorts backwards, because 「2026年10月1日」 < 「2026年9月4日」 on 1 < 9.
    const out = byNewestFirst([item('2026-09-04', 'sep'), item('2026-10-01', 'oct')]);
    expect(out.map((i) => i.change)).toEqual(['oct', 'sep']);
  });

  it('keeps same-day entries in the order they were written', () => {
    const out = byNewestFirst([
      item('2026-08-28', 'first'),
      item('2026-08-28', 'second'),
      item('2026-09-04', 'newer'),
    ]);
    expect(out.map((i) => i.change)).toEqual(['newer', 'first', 'second']);
  });

  it('leaves the caller"s array alone', () => {
    const input = [item('2026-08-28', 'a'), item('2026-09-04', 'b')];
    byNewestFirst(input);
    expect(input.map((i) => i.change)).toEqual(['a', 'b']);
  });
});

describe('formatShippedDate', () => {
  it('reads back as the date that was typed, unpadded', () => {
    expect(formatShippedDate('2026-09-04')).toBe('2026年9月4日');
    expect(formatShippedDate('2026-08-28')).toBe('2026年8月28日');
    expect(formatShippedDate('2026-10-01')).toBe('2026年10月1日');
  });

  it('does not slip a day at the year boundary', () => {
    // Through `new Date('2026-01-01')` this is UTC midnight, and any viewer
    // west of Japan would be shown 2025年12月31日.
    expect(formatShippedDate('2026-01-01')).toBe('2026年1月1日');
  });
});
