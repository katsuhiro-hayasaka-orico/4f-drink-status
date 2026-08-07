import { describe, expect, it } from 'vitest';
import { aggregate, focusSummary, overallState, summarize, weight } from './aggregate.js';
import { SUBJECT_LABELS, type ActionKey, type Report, type SubjectKey } from './domain.js';

const NOW = 1_700_000_000_000;
const MIN = 60_000;

let seq = 0;
function report(
  subject: SubjectKey,
  action: ActionKey,
  userId: string,
  minutesAgo: number,
): Report {
  return {
    id: `r${seq++}`,
    subject,
    action,
    userId,
    userLabel: userId,
    createdAt: NOW - minutesAgo * MIN,
  };
}

describe('weight', () => {
  it('decays in steps and drops to zero past the window', () => {
    expect(weight(NOW - 5 * MIN, NOW)).toBe(1);
    expect(weight(NOW - 10 * MIN, NOW)).toBe(1);
    expect(weight(NOW - 15 * MIN, NOW)).toBe(0.7);
    expect(weight(NOW - 25 * MIN, NOW)).toBe(0.4);
    expect(weight(NOW - 31 * MIN, NOW)).toBe(0);
  });
});

describe('summarize', () => {
  it('reports "none" when nothing falls inside the window', () => {
    const s = summarize([report('coffeeBeans', 'available', 'a', 45)], 'coffeeBeans', NOW);
    expect(s.status).toBe('none');
    expect(s.total).toBe(0);
    expect(s.confidence).toBe('none');
    expect(s.lastAt).toBeNull();
  });

  it('counts one vote per person, keeping only their newest report', () => {
    const s = summarize(
      [
        report('coffeeBeans', 'unavailable', 'a', 12),
        report('coffeeBeans', 'available', 'a', 2), // same person, changed their mind
        report('coffeeBeans', 'available', 'b', 3),
      ],
      'coffeeBeans',
      NOW,
    );
    expect(s.total).toBe(2);
    expect(s.status).toBe('available');
    expect(s.agreement).toBe(100);
  });

  it('discards everything before a refill', () => {
    const s = summarize(
      [
        report('milkPowder', 'unavailable', 'a', 20),
        report('milkPowder', 'unavailable', 'b', 18),
        report('milkPowder', 'refilled', 'c', 10),
      ],
      'milkPowder',
      NOW,
    );
    expect(s.total).toBe(1);
    expect(s.status).toBe('available');
    expect(s.dominantAction).toBe('refilled');
  });

  it('lets two fresh "cannot make it" reports override older optimism', () => {
    const s = summarize(
      [
        report('cocoaPowder', 'available', 'a', 25),
        report('cocoaPowder', 'available', 'b', 24),
        report('cocoaPowder', 'available', 'c', 23),
        report('cocoaPowder', 'unavailable', 'd', 2),
        report('cocoaPowder', 'unavailable', 'e', 1),
      ],
      'cocoaPowder',
      NOW,
    );
    expect(s.status).toBe('unavailable');
  });

  it('does not let a single "cannot make it" report override the crowd', () => {
    const s = summarize(
      [
        report('cocoaPowder', 'available', 'a', 3),
        report('cocoaPowder', 'available', 'b', 3),
        report('cocoaPowder', 'unavailable', 'c', 1),
      ],
      'cocoaPowder',
      NOW,
    );
    expect(s.status).toBe('available');
  });

  it('weights recent votes above stale ones', () => {
    const s = summarize(
      [
        report('coffeeBeans', 'low', 'a', 28),
        report('coffeeBeans', 'low', 'b', 27),
        report('coffeeBeans', 'available', 'c', 1),
        report('coffeeBeans', 'available', 'd', 2),
      ],
      'coffeeBeans',
      NOW,
    );
    // 2 x 0.4 for "low" versus 2 x 1 for "available".
    expect(s.status).toBe('available');
  });

  it('grades confidence on numbers, agreement, and freshness', () => {
    const high = summarize(
      [
        report('coffeeBeans', 'available', 'a', 1),
        report('coffeeBeans', 'available', 'b', 2),
        report('coffeeBeans', 'available', 'c', 3),
      ],
      'coffeeBeans',
      NOW,
    );
    expect(high.confidence).toBe('high');
    expect(high.agreement).toBe(100);

    const medium = summarize(
      [
        report('coffeeBeans', 'available', 'a', 12),
        report('coffeeBeans', 'available', 'b', 14),
      ],
      'coffeeBeans',
      NOW,
    );
    expect(medium.confidence).toBe('medium');

    const low = summarize([report('coffeeBeans', 'available', 'a', 25)], 'coffeeBeans', NOW);
    expect(low.confidence).toBe('low');
  });

  it('splits agreement when people disagree', () => {
    const s = summarize(
      [
        report('coffeeBeans', 'available', 'a', 1),
        report('coffeeBeans', 'available', 'b', 2),
        report('coffeeBeans', 'low', 'c', 3),
      ],
      'coffeeBeans',
      NOW,
    );
    expect(s.status).toBe('available');
    expect(s.supporters).toBe(2);
    expect(s.agreement).toBe(67);
    // Short of the 75% needed for 高, but past the 60% that earns 中.
    expect(s.confidence).toBe('medium');
  });
});

describe('aggregate', () => {
  it('falls back to resting levels for subjects nobody has reported on', () => {
    const { statuses, levels } = aggregate([], NOW);
    expect(statuses.coffeeBeans).toBe('available');
    expect(levels).toEqual({ coffeeBeans: 75, cocoaPowder: 35, milkPowder: 80 });
  });

  it('maps status onto an estimated level, with refills reading full', () => {
    const reports = [
      report('coffeeBeans', 'low', 'a', 1),
      report('cocoaPowder', 'unavailable', 'b', 1),
      report('milkPowder', 'refilled', 'c', 1),
    ];
    const { levels } = aggregate(reports, NOW);
    expect(levels.coffeeBeans).toBe(30);
    expect(levels.cocoaPowder).toBe(0);
    expect(levels.milkPowder).toBe(100);
  });
});

describe('overallState', () => {
  const base = {
    coffeeBeans: 'available',
    cocoaPowder: 'available',
    milkPowder: 'available',
    machine: 'available',
  } as const;

  it('puts a broken machine above everything else', () => {
    const o = overallState({ ...base, machine: 'unavailable' }, SUBJECT_LABELS);
    expect(o.label).toBe('マシンを利用できません');
    expect(o.tone).toBe('unavailable');
  });

  it('flags a missing ingredient', () => {
    const o = overallState({ ...base, cocoaPowder: 'unavailable' }, SUBJECT_LABELS);
    expect(o.label).toBe('一部利用できません');
  });

  it('names the ingredient that is running low', () => {
    const o = overallState({ ...base, milkPowder: 'low' }, SUBJECT_LABELS);
    expect(o.label).toBe('一部残り少なめ');
    expect(o.reason).toContain('ミルク');
  });

  it('says so when everything is fine', () => {
    expect(overallState(base, SUBJECT_LABELS).label).toBe('利用できます');
  });
});

describe('focusSummary', () => {
  it('prefers the problem over the merely uncertain', () => {
    const reports = [
      report('coffeeBeans', 'available', 'a', 1),
      report('cocoaPowder', 'unavailable', 'b', 1),
      report('cocoaPowder', 'unavailable', 'c', 1),
    ];
    const { summaries, statuses } = aggregate(reports, NOW);
    expect(focusSummary(summaries, statuses)?.subject).toBe('cocoaPowder');
  });

  it('falls back to the shakiest reading when nothing is wrong', () => {
    const reports = [
      report('coffeeBeans', 'available', 'a', 1),
      report('coffeeBeans', 'refilled', 'b', 1), // both read as available: 100%
      report('cocoaPowder', 'available', 'c', 1),
      report('cocoaPowder', 'available', 'd', 1), // 100%
      report('milkPowder', 'available', 'e', 1),
      report('milkPowder', 'unavailable', 'f', 2), // 50% — the shakiest
    ];
    const { summaries, statuses } = aggregate(reports, NOW);
    expect(statuses.milkPowder).toBe('available');
    expect(focusSummary(summaries, statuses)?.subject).toBe('milkPowder');
  });
});
