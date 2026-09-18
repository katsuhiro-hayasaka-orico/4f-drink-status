import { describe, expect, it } from 'vitest';
import {
  CONTRIBUTOR_TIERS,
  CONTRIBUTOR_TOP_N,
  CONTRIBUTOR_WINDOW_DAYS,
  buildContributors,
  contributorTier,
  contributorWindowStart,
  describeMine,
  isMilestone,
  isTierKey,
  jstDayStart,
  milestoneMessage,
  nextTier,
  tierLadderNote,
  tierNewlyReached,
  type ContributorRaw,
} from './contributors.js';

const DAY = 86_400_000;
/** 2026-09-18 14:00 JST. */
const AFTERNOON = Date.UTC(2026, 8, 18, 5, 0);
/** 2026-09-18 00:30 JST — the same JST day, the previous UTC one. */
const JUST_PAST_MIDNIGHT = Date.UTC(2026, 8, 17, 15, 30);

function raw(over: Partial<ContributorRaw> & { userId: string }): ContributorRaw {
  return {
    label: `利用者${over.userId.toUpperCase()}`,
    postings: 0,
    recentDays: 0,
    recentPostings: 0,
    ...over,
  };
}

describe('contributorTier', () => {
  it('turns over exactly on the threshold', () => {
    expect(contributorTier(0)).toBeNull();
    expect(contributorTier(9)).toBeNull();
    expect(contributorTier(10)?.key).toBe('regular');
    expect(contributorTier(29)?.key).toBe('regular');
    expect(contributorTier(30)?.key).toBe('expert');
    expect(contributorTier(49)?.key).toBe('expert');
    expect(contributorTier(50)?.key).toBe('master');
    expect(contributorTier(10_000)?.key).toBe('master');
  });

  it('gives every tier a distinct star count, ascending', () => {
    // The badge has to be readable without colour, so the stars — not the
    // tint — are what separates the three.
    expect(CONTRIBUTOR_TIERS.map((t) => t.stars)).toEqual([1, 2, 3]);
    expect(new Set(CONTRIBUTOR_TIERS.map((t) => t.label)).size).toBe(3);
  });
});

describe('nextTier', () => {
  it('counts down to the next rung', () => {
    expect(nextTier(0)).toMatchObject({ remaining: 10 });
    expect(nextTier(9)).toMatchObject({ remaining: 1 });
    expect(nextTier(10)?.tier.key).toBe('expert');
    expect(nextTier(23)).toMatchObject({ remaining: 7 });
    expect(nextTier(49)).toMatchObject({ remaining: 1 });
  });

  it('is null at the top — there is nothing left to promise', () => {
    expect(nextTier(50)).toBeNull();
    expect(nextTier(500)).toBeNull();
  });
});

describe('isTierKey', () => {
  it('accepts the three keys and nothing else', () => {
    expect(isTierKey('regular')).toBe(true);
    expect(isTierKey('master')).toBe(true);
    expect(isTierKey('legend')).toBe(false);
    expect(isTierKey('')).toBe(false);
    expect(isTierKey(undefined)).toBe(false);
    expect(isTierKey(3)).toBe(false);
  });
});

describe('isMilestone', () => {
  it('is every tenth posting, and never the zeroth', () => {
    expect(isMilestone(10)).toBe(true);
    expect(isMilestone(20)).toBe(true);
    expect(isMilestone(100)).toBe(true);
    expect(isMilestone(0)).toBe(false);
    expect(isMilestone(9)).toBe(false);
    expect(isMilestone(15)).toBe(false);
  });
});

describe('tierNewlyReached', () => {
  it('names a tier the moment it is earned', () => {
    expect(tierNewlyReached(10, 0)?.key).toBe('regular');
    expect(tierNewlyReached(30, 20)?.key).toBe('expert');
    expect(tierNewlyReached(50, 40)?.key).toBe('master');
  });

  it('stays quiet on a milestone inside a tier already held', () => {
    expect(tierNewlyReached(20, 10)).toBeNull();
    expect(tierNewlyReached(40, 30)).toBeNull();
  });

  it('still names a tier the device skipped past while away', () => {
    // Cleared storage, or simply never saw the 10th toast: say 常連 once at 20
    // rather than never.
    expect(tierNewlyReached(20, 0)?.key).toBe('regular');
    expect(tierNewlyReached(50, 0)?.key).toBe('master');
  });
});

describe('milestoneMessage', () => {
  it('adds the title only when one was just earned', () => {
    expect(milestoneMessage(10, contributorTier(10))).toBe(
      '10件目の投稿、ありがとうございます！ 称号「常連」になりました',
    );
    expect(milestoneMessage(20, null)).toBe('20件目の投稿、ありがとうございます！');
  });
});

describe('contributorWindowStart', () => {
  it('starts at JST midnight, 29 days before today', () => {
    for (const now of [AFTERNOON, JUST_PAST_MIDNIGHT]) {
      const start = contributorWindowStart(now);
      expect(jstDayStart(now) - start).toBe((CONTRIBUTOR_WINDOW_DAYS - 1) * DAY);
      // The window covers today and excludes the day before it begins.
      expect(start).toBeLessThanOrEqual(now);
      expect(new Date(start + 9 * 3_600_000).toISOString()).toContain('T00:00:00');
    }
  });

  it('puts both sides of JST midnight in the same window', () => {
    expect(contributorWindowStart(AFTERNOON)).toBe(contributorWindowStart(JUST_PAST_MIDNIGHT));
  });
});

describe('buildContributors', () => {
  // One device per tier, so the badge map below has something to tell apart.
  const rows = [
    raw({ userId: 'a', postings: 35, recentDays: 8, recentPostings: 11 }),
    raw({ userId: 'b', postings: 12, recentDays: 8, recentPostings: 20 }),
    raw({ userId: 'c', postings: 200, recentDays: 3, recentPostings: 40 }),
    raw({ userId: 'd', postings: 4, recentDays: 1, recentPostings: 1 }),
    // Posted long ago, nothing inside the window.
    raw({ userId: 'e', postings: 12, recentDays: 0, recentPostings: 0 }),
  ];

  it('ranks by days first, then postings inside the window', () => {
    const res = buildContributors(rows, 'a', [], AFTERNOON);
    expect(res.top.map((r) => r.label)).toEqual(['利用者B', '利用者A', '利用者C', '利用者D']);
    expect(res.active).toBe(4);
    expect(res.windowDays).toBe(CONTRIBUTOR_WINDOW_DAYS);
    expect(res.serverNow).toBe(AFTERNOON);
  });

  it('breaks a full tie by all-time postings, then label, then id', () => {
    // Two devices really can share a 利用者X label (store.ts hands labels out
    // by count), so the id has to settle the order — a ranking that reshuffles
    // equal rows between polls looks broken.
    const tied = [
      raw({ userId: 'z', label: '利用者A', postings: 5, recentDays: 2, recentPostings: 2 }),
      raw({ userId: 'y', label: '利用者A', postings: 5, recentDays: 2, recentPostings: 2 }),
      raw({ userId: 'x', label: '利用者A', postings: 9, recentDays: 2, recentPostings: 2 }),
    ];
    // All-time postings first: x leads on 9. The rows carry no ids, so the
    // caller marker is what exposes where y and z landed.
    expect(buildContributors(tied, 'x', [], AFTERNOON).top.map((r) => r.isMe)).toEqual([
      true,
      false,
      false,
    ]);
    expect(buildContributors(tied, 'y', [], AFTERNOON).top.map((r) => r.isMe)).toEqual([
      false,
      true,
      false,
    ]);
    expect(buildContributors(tied, 'z', [], AFTERNOON).top.map((r) => r.isMe)).toEqual([
      false,
      false,
      true,
    ]);
  });

  it('leaves devices with no day in the window out of the ranking', () => {
    const res = buildContributors(rows, 'a', [], AFTERNOON);
    expect(res.top.some((r) => r.label === '利用者E')).toBe(false);
    expect(res.active).toBe(4);
  });

  it(`shows at most ${CONTRIBUTOR_TOP_N} rows`, () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      raw({ userId: `u${i}`, postings: i, recentDays: 12 - i, recentPostings: 12 - i }),
    );
    expect(buildContributors(many, '', [], AFTERNOON).top).toHaveLength(CONTRIBUTOR_TOP_N);
  });

  it('never puts a user id in a ranking row', () => {
    const res = buildContributors(rows, 'a', ['a', 'b'], AFTERNOON);
    for (const row of res.top) {
      expect(Object.keys(row).sort()).toEqual([
        'isMe',
        'label',
        'recentDays',
        'recentPostings',
        'tier',
      ]);
    }
  });

  it('marks the caller and reports their standing', () => {
    const res = buildContributors(rows, 'a', [], AFTERNOON);
    expect(res.top.filter((r) => r.isMe)).toHaveLength(1);
    expect(res.mine).toEqual({
      postings: 35,
      recentDays: 8,
      recentPostings: 11,
      rank: 2,
      tier: 'expert',
    });
  });

  it('gives a caller outside the window a tier but no rank', () => {
    const res = buildContributors(rows, 'e', [], AFTERNOON);
    expect(res.mine).toMatchObject({ postings: 12, rank: null, tier: 'regular' });
  });

  it('gives a caller who has never posted an empty record', () => {
    const res = buildContributors(rows, 'nobody', [], AFTERNOON);
    expect(res.mine).toEqual({
      postings: 0,
      recentDays: 0,
      recentPostings: 0,
      rank: null,
      tier: null,
    });
  });

  it('limits tiersByUser to the served rows plus the caller', () => {
    // The badge map is not a directory: a device the client cannot already see
    // in the report list must not appear here.
    const res = buildContributors(rows, 'e', ['a', 'c'], AFTERNOON);
    expect(Object.keys(res.tiersByUser).sort()).toEqual(['a', 'c', 'e']);
    expect(res.tiersByUser).toEqual({ a: 'expert', c: 'master', e: 'regular' });
  });

  it('leaves untitled devices out of tiersByUser entirely', () => {
    const res = buildContributors(rows, 'd', ['b', 'd'], AFTERNOON);
    expect(res.tiersByUser).toEqual({ b: 'regular' });
  });
});

describe('describeMine', () => {
  const mine = (over: Partial<Parameters<typeof describeMine>[0]>) =>
    describeMine(
      { postings: 0, recentDays: 0, recentPostings: 0, rank: null, tier: null, ...over },
      12,
      CONTRIBUTOR_WINDOW_DAYS,
    );

  it('invites a device that has never posted', () => {
    expect(mine({})).toBe(
      'あなたはまだ投稿がありません。1件目からこの表に載ります（10件で称号「常連」）。',
    );
  });

  it('states rank, window counts and the next rung', () => {
    expect(mine({ postings: 23, recentDays: 8, recentPostings: 11, rank: 3, tier: 'regular' })).toBe(
      'あなたは12端末中3位（8日・11件）。累計23件・称号「常連」（「ソムリエ」まであと7件）。',
    );
  });

  it('says so when the caller is outside the window', () => {
    expect(mine({ postings: 4 })).toBe(
      'あなたはこの30日間の投稿がまだありません。累計4件（「常連」まであと6件）。',
    );
  });

  it('stops promising a next rung at the top', () => {
    expect(mine({ postings: 140, recentDays: 20, recentPostings: 90, rank: 1, tier: 'master' })).toBe(
      'あなたは12端末中1位（20日・90件）。累計140件・称号「4Fの主」。',
    );
  });
});

describe('tierLadderNote', () => {
  it('spells the ladder the footnotes quote', () => {
    expect(tierLadderNote()).toBe('常連10件・ソムリエ30件・4Fの主50件');
  });
});
