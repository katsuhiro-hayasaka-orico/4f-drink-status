import { describe, expect, it } from 'vitest';
import {
  UNKNOWN_STATUSES,
  aggregate,
  focusSummary,
  overallState,
  queueIsNotable,
  queueWeight,
  summarize,
  summarizeQueue,
  weight,
} from './aggregate.js';
import {
  SUBJECT_LABELS,
  isValidReportValue,
  type Report,
  type ReportValue,
  type SubjectKey,
} from './domain.js';

const NOW = 1_700_000_000_000;
const MIN = 60_000;

let seq = 0;
function report(
  subject: SubjectKey,
  action: ReportValue,
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
  it('reports "none" when nothing usable falls inside the window', () => {
    // A stale 残り少なめ gets no afterglow — see the dedicated block below.
    const s = summarize([report('coffeeBeans', 'low', 'a', 45)], 'coffeeBeans', NOW);
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

describe('summarize afterglow (残照)', () => {
  it('carries a good report forward after the window empties', () => {
    const s = summarize([report('coffeeBeans', 'available', 'a', 45)], 'coffeeBeans', NOW);
    expect(s.status).toBe('available');
    expect(s.carried).toBe(true);
    expect(s.confidence).toBe('low');
    // Not in-window evidence, so it must not count as a vote…
    expect(s.total).toBe(0);
    // …but the timestamp stays honest about how old the sighting is.
    expect(s.lastAt).toBe(NOW - 45 * MIN);
  });

  it('carries a refill forward, still reading as refilled', () => {
    const s = summarize([report('milkPowder', 'refilled', 'a', 90)], 'milkPowder', NOW);
    expect(s.status).toBe('available');
    expect(s.dominantAction).toBe('refilled');
    expect(s.carried).toBe(true);
  });

  it('gives bad news no afterglow', () => {
    // A stale shortage is exactly the reading that needs re-checking.
    expect(summarize([report('ice', 'low', 'a', 45)], 'ice', NOW).status).toBe('none');
    expect(summarize([report('ice', 'unavailable', 'a', 45)], 'ice', NOW).status).toBe('none');
  });

  it('lets the newest report decide, not any good report in range', () => {
    // Someone saw beans at 90 min, but the last word (40 min) was 残り少なめ:
    // the older good news must not resurrect over the newer bad news.
    const s = summarize(
      [report('coffeeBeans', 'available', 'a', 90), report('coffeeBeans', 'low', 'b', 40)],
      'coffeeBeans',
      NOW,
    );
    expect(s.status).toBe('none');
  });

  it('expires after the retention period', () => {
    const s = summarize([report('coffeeBeans', 'available', 'a', 121)], 'coffeeBeans', NOW);
    expect(s.status).toBe('none');
    expect(s.lastAt).toBeNull();
  });

  it('never outranks in-window votes', () => {
    const s = summarize(
      [report('coffeeBeans', 'available', 'a', 100), report('coffeeBeans', 'low', 'b', 5)],
      'coffeeBeans',
      NOW,
    );
    expect(s.status).toBe('low');
    expect(s.carried).toBeUndefined();
  });
});

describe('aggregate', () => {
  it('reports nothing rather than inventing resting levels', () => {
    // Earlier versions filled an empty board with plausible-looking demo
    // values; an honest board admits it has no eyes on the machine.
    const { statuses, levels } = aggregate([], NOW);
    expect(statuses).toEqual({
      coffeeBeans: 'none',
      cocoaPowder: 'none',
      milkPowder: 'none',
      ice: 'none',
      machine: 'none',
    });
    expect(levels).toEqual({ coffeeBeans: null, cocoaPowder: null, milkPowder: null, ice: null });
  });

  it('maps a carried afterglow onto levels like a live report', () => {
    const { statuses, levels } = aggregate(
      [report('coffeeBeans', 'available', 'a', 45), report('milkPowder', 'refilled', 'b', 90)],
      NOW,
    );
    expect(statuses.coffeeBeans).toBe('available');
    expect(levels.coffeeBeans).toBe(70);
    expect(levels.milkPowder).toBe(100);
    // Nobody has said anything about cocoa at all.
    expect(statuses.cocoaPowder).toBe('none');
    expect(levels.cocoaPowder).toBeNull();
  });

  it('treats ice as a material like any other', () => {
    const { statuses, levels } = aggregate(
      [report('ice', 'low', 'a', 1), report('ice', 'low', 'b', 2)],
      NOW,
    );
    expect(statuses.ice).toBe('low');
    expect(levels.ice).toBe(30);
  });

  it('ignores queue reports when aggregating supply', () => {
    const { summaries } = aggregate(
      [report('queue', 'long', 'a', 1), report('coffeeBeans', 'available', 'b', 1)],
      NOW,
    );
    expect(summaries.map((s) => s.subject)).not.toContain('queue');
    expect(summaries.reduce((n, s) => n + s.total, 0)).toBe(1);
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
    ice: 'available',
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
    const o = overallState(base, SUBJECT_LABELS);
    expect(o.label).toBe('利用できます');
    expect(o.reason).toBe('各材料は十分にあります');
  });

  it('admits knowing nothing when no subject has been reported', () => {
    const o = overallState(UNKNOWN_STATUSES, SUBJECT_LABELS);
    expect(o.label).toBe('情報がありません');
    expect(o.tone).toBe('none');
  });

  it('scopes the verdict and names the unchecked materials', () => {
    // The audit's P0: a green blanket 利用できます next to ココア：情報なし
    // read as a contradiction. The headline now claims only what was seen.
    const o = overallState({ ...base, ice: 'none' }, SUBJECT_LABELS);
    expect(o.label).toBe('確認済みの材料は利用できます');
    expect(o.reason).toBe('氷は情報がありません');

    const two = overallState({ ...base, ice: 'none', cocoaPowder: 'none' }, SUBJECT_LABELS);
    expect(two.reason).toBe('ココア・氷は情報がありません');
  });

  it('reports a confirmed problem even with unreported materials around', () => {
    // 「情報がありません」 must never hide a shortage someone has seen.
    const o = overallState({ ...UNKNOWN_STATUSES, cocoaPowder: 'unavailable' }, SUBJECT_LABELS);
    expect(o.label).toBe('一部利用できません');
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

/* ------------------------------------------------------------------ queue -- */

describe('queueWeight', () => {
  it('decays much faster than supply weighting', () => {
    // The same 8-minute-old report is worth full value for supply but almost
    // nothing for the queue — that difference is the whole point.
    expect(weight(NOW - 8 * MIN, NOW)).toBe(1);
    expect(queueWeight(NOW - 8 * MIN, NOW)).toBe(0.3);

    expect(queueWeight(NOW - 1 * MIN, NOW)).toBe(1);
    expect(queueWeight(NOW - 4 * MIN, NOW)).toBe(0.6);
    expect(queueWeight(NOW - 11 * MIN, NOW)).toBe(0);
  });
});

describe('summarizeQueue', () => {
  it('reports no data when the short window is empty', () => {
    // 12 minutes still counts for stock, but is already stale for a queue.
    const s = summarizeQueue([report('queue', 'long', 'a', 12)], NOW);
    expect(s.level).toBeNull();
    expect(s.total).toBe(0);
    expect(s.confidence).toBe('none');
  });

  it('lets one fresh sighting outweigh several stale ones', () => {
    const s = summarizeQueue(
      [
        report('queue', 'long', 'a', 8),
        report('queue', 'long', 'b', 9),
        report('queue', 'empty', 'c', 0),
      ],
      NOW,
    );
    // 2 x 0.3 for "long" versus 1 x 1.0 for "empty".
    expect(s.level).toBe('empty');
  });

  it('counts one vote per person, newest first', () => {
    const s = summarizeQueue(
      [report('queue', 'long', 'a', 4), report('queue', 'short', 'a', 1)],
      NOW,
    );
    expect(s.total).toBe(1);
    expect(s.level).toBe('short');
  });

  it('breaks ties toward the busier answer', () => {
    const s = summarizeQueue(
      [report('queue', 'empty', 'a', 1), report('queue', 'medium', 'b', 1)],
      NOW,
    );
    expect(s.level).toBe('medium');
    expect(s.agreement).toBe(50);
  });

  it('demands recency before calling a reading confident', () => {
    const fresh = summarizeQueue(
      [report('queue', 'medium', 'a', 1), report('queue', 'medium', 'b', 2)],
      NOW,
    );
    expect(fresh.confidence).toBe('high');

    // Same unanimous pair, only older: no longer trustworthy.
    const stale = summarizeQueue(
      [report('queue', 'medium', 'a', 7), report('queue', 'medium', 'b', 8)],
      NOW,
    );
    expect(stale.confidence).toBe('low');
  });

  it('ignores supply reports', () => {
    const s = summarizeQueue([report('coffeeBeans', 'available', 'a', 1)], NOW);
    expect(s.level).toBeNull();
  });
});

describe('queueIsNotable', () => {
  it('stays quiet for an empty or short queue, speaks up otherwise', () => {
    const at = (level: ReportValue) => summarizeQueue([report('queue', level, 'a', 0)], NOW);
    expect(queueIsNotable(at('empty'))).toBe(false);
    expect(queueIsNotable(at('short'))).toBe(false);
    expect(queueIsNotable(at('medium'))).toBe(true);
    expect(queueIsNotable(at('long'))).toBe(true);
    expect(queueIsNotable(summarizeQueue([], NOW))).toBe(false);
  });
});

describe('isValidReportValue', () => {
  it('keeps queue levels and stock actions from being mixed up', () => {
    expect(isValidReportValue('coffeeBeans', 'available')).toBe(true);
    expect(isValidReportValue('ice', 'refilled')).toBe(true);
    expect(isValidReportValue('queue', 'long')).toBe(true);

    // The pairings that must never reach the database.
    expect(isValidReportValue('queue', 'refilled')).toBe(false);
    expect(isValidReportValue('queue', 'available')).toBe(false);
    expect(isValidReportValue('cocoaPowder', 'long')).toBe(false);
    expect(isValidReportValue('machine', 'empty')).toBe(false);
  });
});

describe('focusSummary with unreported materials', () => {
  it('does not let a material nobody reported on hijack the headline metric', () => {
    // Ice has no reports at all, so its agreement is 0%. Before this was
    // handled, it beat every reported material and pinned the metric to
    // 「情報なし」 even when everything else was unanimous and fresh.
    const reports = [
      report('coffeeBeans', 'available', 'a', 1),
      report('coffeeBeans', 'available', 'b', 1),
      report('coffeeBeans', 'available', 'c', 1),
      report('milkPowder', 'available', 'd', 1),
      report('milkPowder', 'available', 'e', 1),
      report('milkPowder', 'available', 'f', 1),
      report('cocoaPowder', 'available', 'g', 1),
      report('cocoaPowder', 'available', 'h', 1),
      report('cocoaPowder', 'available', 'i', 1),
    ];
    const { summaries, statuses } = aggregate(reports, NOW);
    const focus = focusSummary(summaries, statuses);
    expect(focus?.subject).not.toBe('ice');
    expect(focus?.confidence).toBe('high');
  });

  it('still returns something when nobody has reported anything', () => {
    const { summaries, statuses } = aggregate([], NOW);
    expect(focusSummary(summaries, statuses)).toBeDefined();
  });
});
