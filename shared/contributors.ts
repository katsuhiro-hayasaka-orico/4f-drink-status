/**
 * 投稿の常連さん — who keeps the board alive, and what to call them.
 *
 * The board's own aggregation deliberately ignores how much anyone posts: one
 * person, one vote, newest only. That is what makes 「コーヒー、まだある?」
 * answerable. This module is the other half — recognition for the people doing
 * the posting — and it is kept entirely out of the aggregation's way: nothing
 * here feeds `summarize`, `overallState` or any gauge.
 *
 * Two numbers, on purpose:
 *
 *   - **累計の投稿件数** earns a 称号. It only ever goes up, so it reads as a
 *     thank-you rather than a contest.
 *   - **直近30日に投稿した日数** orders the ranking. Days, not postings: a
 *     device that posts a hundred times in one afternoon still scores one day,
 *     so there is nothing to gain by inventing observations — and inventing
 *     observations is not hypothetical here (d72b958: people posted drinks
 *     they had not made just to get levels recorded). A rolling 30 days also
 *     means someone who starts today can reach the top of the list.
 *
 * Everything is per **device**, because `dsid` is per device: a cleared cookie
 * is a new contributor with no history, and two devices can share a 利用者X
 * label. Counting is therefore always by `userId`, and labels are only ever
 * displayed.
 */

/** How far back the ranking looks, in JST calendar days including today. */
export const CONTRIBUTOR_WINDOW_DAYS = 30;

/** Rows the ranking card shows. */
export const CONTRIBUTOR_TOP_N = 5;

/** A thank-you every this many postings. */
export const MILESTONE_EVERY = 10;

export interface ContributorTier {
  key: 'regular' | 'expert' | 'master' | 'sage' | 'legend';
  /** Shown beside the poster's name. */
  label: string;
  /** All-time postings needed to reach it. */
  at: number;
  /**
   * How many ★ the badge draws. Tiers are told apart by the star count first
   * and the word second — never by colour alone, which the palette cannot
   * carry across both themes and every kind of colour vision.
   */
  stars: number;
}

/**
 * Ascending by `at`; every lookup below depends on that order.
 *
 * The keys are the stable part — they go over the wire in `tiersByUser` and
 * into the badge's CSS class — while the labels are display only and can be
 * re-worded without touching anything else. 「ソムリエ」 for someone who has
 * looked into a hopper fifty times, and 「4Fの主」 for the person who has
 * become part of the floor's furniture, are meant with affection: these words
 * sit next to a real colleague's 利用者X on a page anyone can open, so the
 * joke has to be one the person wearing it would enjoy.
 *
 * `at` counts postings, all time — not days, and not anything the ranking
 * below measures. That is the scale the rungs are set against: the board had
 * taken 515 postings from 34 devices by 2026-09-11, so the first rung arrives
 * early enough to mean something while the last stays worth walking towards.
 *
 * The ladder keeps going past 4Fの主 because people were going to. A top rung
 * someone has already passed stops saying anything to them, and the cheapest
 * way to keep it saying something is to add another rung — the code here reads
 * the table rather than the three tiers it started with, so a sixth costs one
 * line (plus its badge tint, see .tier-badge in src/styles.css). Keep every
 * rung on a multiple of MILESTONE_EVERY: that is what makes the toast naming
 * it land on the posting that earns it rather than a few postings later.
 */
export const CONTRIBUTOR_TIERS: readonly ContributorTier[] = [
  { key: 'regular', label: '常連', at: 10, stars: 1 },
  { key: 'expert', label: 'ソムリエ', at: 50, stars: 2 },
  { key: 'master', label: '4Fの主', at: 100, stars: 3 },
  { key: 'sage', label: '4F仙人', at: 150, stars: 4 },
  { key: 'legend', label: '4Fの伝説', at: 200, stars: 5 },
];

export type TierKey = ContributorTier['key'];

export function isTierKey(v: unknown): v is TierKey {
  return typeof v === 'string' && CONTRIBUTOR_TIERS.some((t) => t.key === v);
}

export function tierByKey(key: TierKey): ContributorTier {
  return CONTRIBUTOR_TIERS.find((t) => t.key === key)!;
}

/** The highest tier this many postings has earned, or null below the first. */
export function contributorTier(postings: number): ContributorTier | null {
  let found: ContributorTier | null = null;
  for (const tier of CONTRIBUTOR_TIERS) {
    if (postings >= tier.at) found = tier;
  }
  return found;
}

/** The next tier up and how many postings away it is, or null at the top. */
export function nextTier(postings: number): { tier: ContributorTier; remaining: number } | null {
  const tier = CONTRIBUTOR_TIERS.find((t) => postings < t.at);
  return tier ? { tier, remaining: tier.at - postings } : null;
}

export function isMilestone(postings: number): boolean {
  return postings > 0 && postings % MILESTONE_EVERY === 0;
}

/**
 * The tier to name in a milestone's message: the one this count has reached,
 * unless the last celebrated count had already reached it.
 *
 * Takes the previous celebration rather than `postings - 10` so a device that
 * was away — undoing, clearing storage, or simply never seeing the 10th
 * toast — still gets told about 常連 once when it comes back at 30.
 */
export function tierNewlyReached(
  postings: number,
  lastCelebrated: number,
): ContributorTier | null {
  const now = contributorTier(postings);
  if (!now) return null;
  const before = contributorTier(lastCelebrated);
  return before?.key === now.key ? null : now;
}

export function milestoneMessage(postings: number, tier: ContributorTier | null): string {
  const head = `${postings}件目の投稿、ありがとうございます！`;
  return tier ? `${head} 称号「${tier.label}」になりました` : head;
}

/* ------------------------------------------------------------- the window -- */

const DAY_MS = 86_400_000;
const JST_OFFSET_MS = 9 * 3_600_000;

/** Start of the JST calendar day `now` falls in, as epoch milliseconds. */
export function jstDayStart(now: number): number {
  return Math.floor((now + JST_OFFSET_MS) / DAY_MS) * DAY_MS - JST_OFFSET_MS;
}

/**
 * First instant of the ranking window: midnight JST, `days - 1` days before
 * today. Calendar days rather than a rolling 30×24h because the card says
 * 「30日中N日」 and the bar is drawn against that denominator — a rolling
 * window would let a day be counted at one end and fall out mid-afternoon.
 */
export function contributorWindowStart(now: number, days = CONTRIBUTOR_WINDOW_DAYS): number {
  return jstDayStart(now) - (days - 1) * DAY_MS;
}

/* -------------------------------------------------------------- the wire -- */

/** One device's counts, straight out of the GROUP BY. Worker-side only. */
export interface ContributorRaw {
  userId: string;
  label: string;
  /** All-time postings (groups, not rows). */
  postings: number;
  /** JST days inside the window on which this device posted. */
  recentDays: number;
  /** Postings inside the window. */
  recentPostings: number;
}

/**
 * A row of the ranking, as it goes over the wire.
 *
 * Carries no `userId` and no all-time count: the board already publishes who
 * posted what in the last 24 hours, and a public page has no reason to also
 * publish a per-device history for everyone else. What other people get is a
 * label, a 称号, and their standing in the window.
 */
export interface ContributorRow {
  label: string;
  isMe: boolean;
  tier: TierKey | null;
  recentDays: number;
  recentPostings: number;
}

/** The caller's own numbers. Scoped to the caller — never anyone else's. */
export interface MyContribution {
  postings: number;
  recentDays: number;
  recentPostings: number;
  /** Position among devices active in the window, or null when outside it. */
  rank: number | null;
  tier: TierKey | null;
}

export interface ContributorsResponse {
  windowDays: number;
  /** Devices that posted on at least one day inside the window. */
  active: number;
  top: ContributorRow[];
  mine: MyContribution;
  /**
   * 称号 for the posters the client can already see — the user ids in the
   * served reports, plus the caller. Restricted to those so the badge lookup
   * cannot become a directory of every device that ever posted. Devices
   * without a tier are left out entirely.
   */
  tiersByUser: Record<string, TierKey>;
  serverNow: number;
}

/**
 * Ordering: days in the window first, then postings in the window, then
 * all-time postings, then label and id.
 *
 * The last two exist for determinism rather than meaning — two devices really
 * can share a 利用者X label (store.ts hands labels out by count), and a list
 * that reshuffles equal rows between polls looks broken.
 */
function compare(a: ContributorRaw, b: ContributorRaw): number {
  return (
    b.recentDays - a.recentDays ||
    b.recentPostings - a.recentPostings ||
    b.postings - a.postings ||
    a.label.localeCompare(b.label) ||
    (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0)
  );
}

const EMPTY_MINE: MyContribution = {
  postings: 0,
  recentDays: 0,
  recentPostings: 0,
  rank: null,
  tier: null,
};

/**
 * Turn per-device counts into what the client may see.
 *
 * `visibleUserIds` is the set of posters already present in the same response's
 * report rows; `me` is always added to it, since the caller's own badge has to
 * appear on their own optimistic row.
 */
export function buildContributors(
  raw: readonly ContributorRaw[],
  me: string,
  visibleUserIds: Iterable<string>,
  now: number,
): ContributorsResponse {
  const ranked = raw.filter((r) => r.recentDays > 0).sort(compare);
  const mineRaw = raw.find((r) => r.userId === me);
  const myIndex = ranked.findIndex((r) => r.userId === me);

  const tiersByUser: Record<string, TierKey> = {};
  const visible = new Set(visibleUserIds);
  visible.add(me);
  for (const r of raw) {
    if (!visible.has(r.userId)) continue;
    const tier = contributorTier(r.postings);
    if (tier) tiersByUser[r.userId] = tier.key;
  }

  return {
    windowDays: CONTRIBUTOR_WINDOW_DAYS,
    active: ranked.length,
    top: ranked.slice(0, CONTRIBUTOR_TOP_N).map((r) => ({
      label: r.label,
      isMe: r.userId === me,
      tier: contributorTier(r.postings)?.key ?? null,
      recentDays: r.recentDays,
      recentPostings: r.recentPostings,
    })),
    mine: mineRaw
      ? {
          postings: mineRaw.postings,
          recentDays: mineRaw.recentDays,
          recentPostings: mineRaw.recentPostings,
          rank: myIndex >= 0 ? myIndex + 1 : null,
          tier: contributorTier(mineRaw.postings)?.key ?? null,
        }
      : EMPTY_MINE,
    tiersByUser,
    serverNow: now,
  };
}

/** 「「4Fの主」まであと38件」 — or nothing, at the top of the ladder. */
function nextTierNote(postings: number): string {
  const next = nextTier(postings);
  return next ? `（「${next.tier.label}」まであと${next.remaining}件）` : '';
}

/** The one line under the ranking, written from the caller's point of view. */
export function describeMine(mine: MyContribution, active: number, windowDays: number): string {
  const tier = mine.tier ? tierByKey(mine.tier) : null;
  const standing = tier ? `累計${mine.postings}件・称号「${tier.label}」` : `累計${mine.postings}件`;

  if (mine.postings === 0) {
    return `あなたはまだ投稿がありません。1件目からこの表に載ります（${CONTRIBUTOR_TIERS[0].at}件で称号「${CONTRIBUTOR_TIERS[0].label}」）。`;
  }
  if (mine.rank === null) {
    return `あなたはこの${windowDays}日間の投稿がまだありません。${standing}${nextTierNote(mine.postings)}。`;
  }
  return `あなたは${active}端末中${mine.rank}位（${mine.recentDays}日・${mine.recentPostings}件）。${standing}${nextTierNote(mine.postings)}。`;
}

/** 「常連10件・ソムリエ50件・…」 — the whole ladder, for a footnote. */
export function tierLadderNote(): string {
  return CONTRIBUTOR_TIERS.map((t) => `${t.label}${t.at}件`).join('・');
}

/**
 * What a badge says to a screen reader. The visual badge is stars plus a word;
 * this spells out what the word was earned by, so the meaning does not depend
 * on having seen the footnote under the ranking.
 */
export function tierDescription(tier: ContributorTier): string {
  return `称号：${tier.label}（投稿${tier.at}件以上）`;
}
