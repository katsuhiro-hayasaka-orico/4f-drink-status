import { describe, expect, it } from 'vitest';
import type { Report, ReportRowValue, ReportSubject } from '../../shared/domain.js';
import { collapsePostings } from './postings.js';

const T0 = 1_700_000_000_000;

let seq = 0;
function report(
  subject: ReportSubject,
  action: ReportRowValue,
  userId: string,
  at: number,
): Report {
  return {
    id: `r${seq++}`,
    subject,
    action,
    userId,
    userLabel: `利用者${userId.toUpperCase()}`,
    createdAt: at,
  };
}

describe('collapsePostings', () => {
  it('keeps one row per posting, preferring the drink row', () => {
    // One drink posting fanned out into four rows at the same instant.
    const fanned = [
      report('iceCoffee', 'made', 'a', T0),
      report('coffeeBeans', 'available', 'a', T0),
      report('ice', 'available', 'a', T0),
      report('machine', 'available', 'a', T0),
    ];
    const collapsed = collapsePostings(fanned);
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0].subject).toBe('iceCoffee');
  });

  it('leaves standalone reports intact and preserves order', () => {
    const rows = [
      report('queue', 'empty', 'b', T0 + 2000),
      report('iceCoffee', 'made', 'a', T0 + 1000),
      report('coffeeBeans', 'available', 'a', T0 + 1000),
      report('milkPowder', 'refilled', 'c', T0),
    ];
    const collapsed = collapsePostings(rows);
    expect(collapsed.map((r) => r.subject)).toEqual(['queue', 'iceCoffee', 'milkPowder']);
  });

  it('does not merge different people posting at the same instant', () => {
    const rows = [
      report('hotCocoa', 'made', 'a', T0),
      report('hotCocoa', 'made', 'b', T0),
    ];
    expect(collapsePostings(rows)).toHaveLength(2);
  });
});
