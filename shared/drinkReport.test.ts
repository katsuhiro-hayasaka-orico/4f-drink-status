import { describe, expect, it } from 'vitest';
import { summarizeDrinkReports } from './aggregate.js';
import type { Report } from './domain.js';
import { buildDrinkReportRows, parseDrinkReport } from './drinkReport.js';

describe('parseDrinkReport', () => {
  it('accepts a plain made report', () => {
    expect(parseDrinkReport({ drink: 'caffeMocha', result: 'made' })).toEqual({
      drink: 'caffeMocha',
      result: 'made',
      low: [],
      cause: null,
    });
  });

  it('accepts made with low materials from the recipe, deduplicated', () => {
    const p = parseDrinkReport({
      drink: 'caffeMocha',
      result: 'made',
      low: ['milkPowder', 'milkPowder', 'cocoaPowder'],
    });
    expect(p?.low).toEqual(['milkPowder', 'cocoaPowder']);
  });

  it('rejects low materials the drink does not use', () => {
    // Hot coffee uses beans only; claiming its ice ran low is nonsense.
    expect(parseDrinkReport({ drink: 'hotCoffee', result: 'made', low: ['ice'] })).toBeNull();
  });

  it('requires a cause for failed — unknown is an answer, absence is not', () => {
    expect(parseDrinkReport({ drink: 'iceCoffee', result: 'failed' })).toBeNull();
    expect(parseDrinkReport({ drink: 'iceCoffee', result: 'failed', cause: 'unknown' })).toEqual({
      drink: 'iceCoffee',
      result: 'failed',
      low: [],
      cause: 'unknown',
    });
  });

  it('rejects a cause naming an ingredient the drink does not use', () => {
    expect(
      parseDrinkReport({ drink: 'hotCocoa', result: 'failed', cause: 'coffeeBeans' }),
    ).toBeNull();
  });

  it('rejects contradictions and malformed shapes', () => {
    expect(parseDrinkReport({ drink: 'hotCoffee', result: 'made', cause: 'machine' })).toBeNull();
    expect(parseDrinkReport({ drink: 'hotCoffee', result: 'failed', low: ['coffeeBeans'], cause: 'unknown' })).toBeNull();
    expect(parseDrinkReport({ drink: 'espresso', result: 'made' })).toBeNull();
    expect(parseDrinkReport(null)).toBeNull();
    expect(parseDrinkReport('made')).toBeNull();
  });
});

describe('buildDrinkReportRows', () => {
  const rowsOf = (input: Parameters<typeof buildDrinkReportRows>[0]) =>
    buildDrinkReportRows(input).map((r) => `${r.subject}:${r.action}`);

  it('made vouches for every ingredient used — and the machine', () => {
    expect(rowsOf({ drink: 'caffeMocha', result: 'made', low: [], cause: null })).toEqual([
      'caffeMocha:made',
      'coffeeBeans:available',
      'cocoaPowder:available',
      'milkPowder:available',
      'machine:available',
    ]);
  });

  it('made with declared lows marks those materials low, the rest available', () => {
    expect(rowsOf({ drink: 'iceCaffeLatte', result: 'made', low: ['ice'], cause: null })).toEqual([
      'iceCaffeLatte:made',
      'coffeeBeans:available',
      'milkPowder:available',
      'ice:low',
      'machine:available',
    ]);
  });

  it('failed accuses only the named culprit', () => {
    expect(rowsOf({ drink: 'iceCaffeLatte', result: 'failed', low: [], cause: 'ice' })).toEqual([
      'iceCaffeLatte:failed',
      'ice:unavailable',
    ]);
    expect(rowsOf({ drink: 'hotCoffee', result: 'failed', low: [], cause: 'machine' })).toEqual([
      'hotCoffee:failed',
      'machine:unavailable',
    ]);
  });

  it('failed with an unknown cause casts no material votes at all', () => {
    // Guessing here would poison the board; the failure speaks through the
    // drink's own card instead.
    expect(rowsOf({ drink: 'iceCaffeMocha', result: 'failed', low: [], cause: 'unknown' })).toEqual([
      'iceCaffeMocha:failed',
    ]);
  });
});

describe('summarizeDrinkReports', () => {
  const NOW = 1_700_000_000_000;
  const MIN = 60_000;
  let seq = 0;
  const report = (action: 'made' | 'failed', userId: string, minutesAgo: number): Report => ({
    id: `d${seq++}`,
    subject: 'caffeMocha',
    action,
    userId,
    userLabel: userId,
    createdAt: NOW - minutesAgo * MIN,
  });

  it('returns null with no in-window reports', () => {
    expect(summarizeDrinkReports([report('made', 'a', 45)], 'caffeMocha', NOW)).toBeNull();
    expect(summarizeDrinkReports([], 'caffeMocha', NOW)).toBeNull();
  });

  it('weights fresh votes above stale ones', () => {
    const reports = [
      report('failed', 'a', 28),
      report('failed', 'b', 27),
      report('made', 'c', 1),
      report('made', 'd', 2),
    ];
    expect(summarizeDrinkReports(reports, 'caffeMocha', NOW)).toBe('made');
  });

  it('breaks ties toward failed', () => {
    const reports = [report('made', 'a', 3), report('failed', 'b', 3)];
    expect(summarizeDrinkReports(reports, 'caffeMocha', NOW)).toBe('failed');
  });

  it('counts one vote per person, newest wins', () => {
    const reports = [report('failed', 'a', 10), report('made', 'a', 1)];
    expect(summarizeDrinkReports(reports, 'caffeMocha', NOW)).toBe('made');
  });
});
