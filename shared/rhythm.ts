/**
 * いつ切れやすい？ — the weekday×hour rhythm of the machine, distilled from
 * four weeks of reports.
 *
 * The server hands over raw per-(dow, hour, subject, action) counts and this
 * module does every judgement call: which actions count as 作れる vs 切れがち,
 * the six-level diverging bucket a cell falls into, what is too thin to show
 * at full strength, and the two headline slots (要注意タイム / ねらい目).
 * Keeping it here means the worker stays a dumb GROUP BY and vitest can pin
 * all of it.
 */

import { CONFIG } from './config.js';
import { QUEUE_META, QUEUE_SUBJECT, isQueueLevel, type QueueLevel } from './domain.js';

export interface RhythmRawCell {
  /** strftime('%w') in JST: 0=Sunday … 6=Saturday. */
  dow: number;
  /** JST hour of day, 0–23. */
  hour: number;
  subject: string;
  action: string;
  n: number;
}

export interface RhythmResponse {
  cells: RhythmRawCell[];
  serverNow: number;
}

/** How far back the rhythm looks. */
export const RHYTHM_WINDOW_MS = 28 * 24 * 60 * 60 * 1000;

/** Weekdays only — the lounge is an office floor. %w values for 月–金. */
export const RHYTHM_DOWS = [1, 2, 3, 4, 5] as const;
export const RHYTHM_DAY_LABELS: Record<number, string> = {
  1: '月',
  2: '火',
  3: '水',
  4: '木',
  5: '金',
};

/** Hour-of-day columns: opening hour up to (not including) closing. */
export const RHYTHM_HOURS: number[] = Array.from(
  { length: CONFIG.closeHour - CONFIG.openHour },
  (_, i) => CONFIG.openHour + i,
);

/** Below this many verdict votes a cell renders faint — a hint, not a claim. */
export const FAINT_BELOW = 3;

/** Below this many verdict votes overall, the card shows its empty state. */
export const INSUFFICIENT_BELOW = 20;

/**
 * The verdict split. Success vouches (made/available/refilled) versus trouble
 * sightings (failed/unavailable/low/cleaning) — the same polarity the board's
 * live view uses, just accumulated. Queue rows carry no verdict; they feed
 * the crowding bars instead.
 */
const GOOD_ACTIONS = new Set(['made', 'available', 'refilled']);
const BAD_ACTIONS = new Set(['failed', 'unavailable', 'low', 'cleaning']);

export interface RhythmCell {
  dow: number;
  hour: number;
  good: number;
  bad: number;
  /** Diverging bucket 0 (reliably 作れる) … 5 (切れがち), null = no verdicts. */
  level: number | null;
  /** True when the cell has verdicts but too few to lean on. */
  faint: boolean;
}

export interface QueueLoad {
  hour: number;
  /** Mean reported head-count for the hour (QUEUE_META.people), 0 if no data. */
  avgPeople: number;
  samples: number;
}

export interface RhythmSlot {
  /** 「月・水」 — the weekday names sharing the slot. */
  days: string;
  hour: number;
  /** 「月・水 14時台」 */
  label: string;
}

export interface Rhythm {
  /** Row-major: for each dow in RHYTHM_DOWS, a cell per RHYTHM_HOURS entry. */
  heat: RhythmCell[][];
  queueLoad: QueueLoad[];
  warn: RhythmSlot | null;
  best: RhythmSlot | null;
  /** Every counted report row, queue included — the 「N件から集計」 figure. */
  totalCount: number;
  insufficient: boolean;
}

/** badRatio → one of six diverging buckets (0 green … 5 red). */
export function rhythmLevel(good: number, bad: number): number | null {
  const total = good + bad;
  if (total === 0) return null;
  const ratio = bad / total;
  if (ratio <= 0.1) return 0;
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.45) return 2;
  if (ratio <= 0.6) return 3;
  if (ratio <= 0.8) return 4;
  return 5;
}

/** 「月・水 14時台」 from a set of dows sharing one hour. */
function slotLabel(dows: number[], hour: number): RhythmSlot {
  const days = [...dows].sort((a, b) => a - b).map((d) => RHYTHM_DAY_LABELS[d]).join('・');
  return { days, hour, label: `${days} ${hour}時台` };
}

/**
 * The strongest slot on one side of the ledger: the single best-scoring cell
 * picks the hour, then every same-hour weekday within EPSILON of that score
 * joins the label (ties like 月・水 14時台 read better than a coin flip).
 * Only cells with enough votes participate, and a slot is only claimed when
 * the winning side actually dominates (score > 0.5).
 */
function topSlot(cells: RhythmCell[], score: (c: RhythmCell) => number): RhythmSlot | null {
  const EPSILON = 0.05;
  const eligible = cells.filter((c) => c.good + c.bad >= FAINT_BELOW);
  if (eligible.length === 0) return null;
  const bestCell = eligible.reduce((a, b) => (score(b) > score(a) ? b : a));
  if (score(bestCell) <= 0.5) return null;
  const dows = eligible
    .filter((c) => c.hour === bestCell.hour && score(c) >= score(bestCell) - EPSILON)
    .map((c) => c.dow);
  return slotLabel(dows, bestCell.hour);
}

export function buildRhythm(raw: readonly RhythmRawCell[]): Rhythm {
  const key = (dow: number, hour: number) => `${dow}:${hour}`;
  const byCell = new Map<string, { good: number; bad: number }>();
  const queueByHour = new Map<number, { people: number; samples: number }>();
  let totalCount = 0;

  for (const row of raw) {
    if (!RHYTHM_DAY_LABELS[row.dow]) continue;
    if (row.hour < CONFIG.openHour || row.hour >= CONFIG.closeHour) continue;
    totalCount += row.n;

    if (row.subject === QUEUE_SUBJECT) {
      if (!isQueueLevel(row.action)) continue;
      const q = queueByHour.get(row.hour) ?? { people: 0, samples: 0 };
      q.people += QUEUE_META[row.action as QueueLevel].people * row.n;
      q.samples += row.n;
      queueByHour.set(row.hour, q);
      continue;
    }

    const cell = byCell.get(key(row.dow, row.hour)) ?? { good: 0, bad: 0 };
    if (GOOD_ACTIONS.has(row.action)) cell.good += row.n;
    else if (BAD_ACTIONS.has(row.action)) cell.bad += row.n;
    byCell.set(key(row.dow, row.hour), cell);
  }

  const heat = RHYTHM_DOWS.map((dow) =>
    RHYTHM_HOURS.map((hour): RhythmCell => {
      const { good, bad } = byCell.get(key(dow, hour)) ?? { good: 0, bad: 0 };
      return {
        dow,
        hour,
        good,
        bad,
        level: rhythmLevel(good, bad),
        faint: good + bad > 0 && good + bad < FAINT_BELOW,
      };
    }),
  );

  const queueLoad = RHYTHM_HOURS.map((hour): QueueLoad => {
    const q = queueByHour.get(hour);
    return {
      hour,
      avgPeople: q && q.samples > 0 ? q.people / q.samples : 0,
      samples: q?.samples ?? 0,
    };
  });

  const flat = heat.flat();
  const verdicts = flat.reduce((sum, c) => sum + c.good + c.bad, 0);

  return {
    heat,
    queueLoad,
    warn: topSlot(flat, (c) => c.bad / (c.good + c.bad)),
    best: topSlot(flat, (c) => c.good / (c.good + c.bad)),
    totalCount,
    insufficient: verdicts < INSUFFICIENT_BELOW,
  };
}
