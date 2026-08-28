import { describe, expect, it } from 'vitest';
import {
  FAINT_BELOW,
  RHYTHM_DOWS,
  RHYTHM_HOURS,
  buildRhythm,
  rhythmLevel,
  type RhythmRawCell,
} from './rhythm.js';

const row = (
  dow: number,
  hour: number,
  subject: string,
  action: string,
  n: number,
): RhythmRawCell => ({ dow, hour, subject, action, n });

function cellAt(r: ReturnType<typeof buildRhythm>, dow: number, hour: number) {
  return r.heat[RHYTHM_DOWS.indexOf(dow as 1)][RHYTHM_HOURS.indexOf(hour)];
}

describe('rhythmLevel', () => {
  it('buckets the bad ratio into six diverging steps', () => {
    expect(rhythmLevel(10, 0)).toBe(0); // 0%
    expect(rhythmLevel(4, 1)).toBe(1); // 20%
    expect(rhythmLevel(6, 4)).toBe(2); // 40%
    expect(rhythmLevel(1, 1)).toBe(3); // 50%
    expect(rhythmLevel(1, 3)).toBe(4); // 75%
    expect(rhythmLevel(0, 10)).toBe(5); // 100%
  });

  it('returns null with no verdicts at all', () => {
    expect(rhythmLevel(0, 0)).toBeNull();
  });
});

describe('buildRhythm', () => {
  it('classifies actions into 作れる vs 切れがち and ignores what is neither', () => {
    const r = buildRhythm([
      row(1, 10, 'hotCoffee', 'made', 3),
      row(1, 10, 'coffeeBeans', 'available', 2),
      row(1, 10, 'ice', 'refilled', 1),
      row(1, 10, 'iceCoffee', 'failed', 2),
      row(1, 10, 'milkPowder', 'low', 1),
      row(1, 10, 'machine', 'cleaning', 1),
      row(1, 10, 'cocoaPowder', 'unavailable', 1),
    ]);
    const cell = cellAt(r, 1, 10);
    expect(cell.good).toBe(6);
    expect(cell.bad).toBe(5);
    expect(cell.faint).toBe(false);
  });

  it('keeps queue rows out of the verdict and in the crowding bars', () => {
    const r = buildRhythm([
      row(2, 13, 'queue', 'long', 2), // 6 people ×2
      row(3, 13, 'queue', 'empty', 1), // 0 people
      row(2, 13, 'queue', 'medium', 1), // 4 people
    ]);
    expect(cellAt(r, 2, 13).level).toBeNull();
    const load13 = r.queueLoad.find((q) => q.hour === 13)!;
    expect(load13.samples).toBe(4);
    expect(load13.avgPeople).toBe((6 * 2 + 0 + 4) / 4);
    // Hours with no queue reports stay at zero.
    expect(r.queueLoad.find((q) => q.hour === 9)!.samples).toBe(0);
  });

  it('drops weekends and out-of-hours rows entirely', () => {
    const r = buildRhythm([
      row(0, 10, 'hotCoffee', 'made', 5), // Sunday
      row(6, 10, 'hotCoffee', 'failed', 5), // Saturday
      row(1, 8, 'hotCoffee', 'failed', 5), // before opening
      row(1, 17, 'hotCoffee', 'failed', 5), // after closing
    ]);
    expect(r.totalCount).toBe(0);
    expect(cellAt(r, 1, 10).level).toBeNull();
  });

  it('marks thin cells faint instead of asserting a trend', () => {
    const r = buildRhythm([row(4, 11, 'hotCocoa', 'made', FAINT_BELOW - 1)]);
    const cell = cellAt(r, 4, 11);
    expect(cell.faint).toBe(true);
    expect(cell.level).toBe(0);
    expect(cellAt(r, 4, 12).faint).toBe(false); // empty is empty, not faint
  });

  it('derives 要注意タイム, merging same-hour weekdays within the tie window', () => {
    const r = buildRhythm([
      row(1, 14, 'iceCoffee', 'failed', 8),
      row(1, 14, 'hotCoffee', 'made', 2),
      row(3, 14, 'ice', 'unavailable', 4),
      row(3, 14, 'hotCoffee', 'made', 1),
      // 火14時台 is fine — must not join the label.
      row(2, 14, 'hotCoffee', 'made', 5),
      // Fill the rest so the total clears the insufficiency floor.
      row(2, 9, 'hotCoffee', 'made', 10),
    ]);
    expect(r.warn?.label).toBe('月・水 14時台');
    expect(r.insufficient).toBe(false);
  });

  it('derives ねらい目 from the greenest well-fed cell', () => {
    const r = buildRhythm([
      row(2, 9, 'hotCoffee', 'made', 9),
      row(2, 9, 'iceCoffee', 'failed', 1),
      row(4, 15, 'hotCoffee', 'made', 3),
      row(4, 15, 'iceCoffee', 'failed', 3),
    ]);
    expect(r.best?.label).toBe('火 9時台');
  });

  it('claims no slot when nothing dominates or data is too thin', () => {
    const even = buildRhythm([
      row(1, 10, 'hotCoffee', 'made', 5),
      row(1, 10, 'iceCoffee', 'failed', 5),
    ]);
    expect(even.warn).toBeNull(); // 50% does not dominate
    expect(even.best).toBeNull();

    const thin = buildRhythm([row(1, 10, 'iceCoffee', 'failed', FAINT_BELOW - 1)]);
    expect(thin.warn).toBeNull(); // under the vote floor
  });

  it('reports insufficiency and the raw count', () => {
    const r = buildRhythm([
      row(1, 10, 'hotCoffee', 'made', 5),
      row(2, 13, 'queue', 'long', 3),
    ]);
    expect(r.totalCount).toBe(8); // queue counts toward 「N件から集計」
    expect(r.insufficient).toBe(true); // …but not toward the verdict floor
  });
});
