/**
 * Turning a stream of individual reports into a status the lounge can trust.
 *
 * The rules, in the order they apply:
 *   1. Only reports inside the observation window count at all.
 *   2. A 補充された report resets history — nothing before it is evidence
 *      about the current state.
 *   3. One vote per person: only each user's most recent report survives.
 *   4. Votes are weighted by age, so a 25-minute-old sighting can't outvote
 *      two fresh ones.
 *   5. Two or more recent "can't make it" reports win outright — being told
 *      the machine is empty is worth more than being told it isn't.
 */

import {
  ACTION_META,
  MATERIAL_KEYS,
  QUEUE_LEVELS,
  QUEUE_META,
  QUEUE_SUBJECT,
  SUPPLY_SUBJECT_KEYS,
  type ActionKey,
  type ConfidenceKey,
  type MaterialKey,
  type QueueLevel,
  type Report,
  type StatusKey,
  type StatusOrNone,
  type SubjectKey,
  type SupplySubjectKey,
} from './domain.js';
import { OBSERVATION_WINDOW_MS, QUEUE_WINDOW_MS } from './config.js';

const MINUTE = 60_000;

/** Tie-break order when weighted totals are equal. */
const STATUS_PRIORITY: readonly StatusKey[] = ['available', 'low', 'unavailable'];

/** How much a vote counts, by how long ago it was made. */
export function weight(createdAt: number, now: number): number {
  const age = now - createdAt;
  if (age <= 10 * MINUTE) return 1;
  if (age <= 20 * MINUTE) return 0.7;
  if (age <= 30 * MINUTE) return 0.4;
  return 0;
}

/** 補充された is evidence the thing is available. */
export function toStatus(action: ActionKey): StatusKey {
  return action === 'refilled' ? 'available' : action;
}

export interface Summary {
  subject: SupplySubjectKey;
  status: StatusOrNone;
  /** `refilled` when the winning status was carried by a refill report. */
  dominantAction: ActionKey | null;
  /** Number of distinct people whose votes counted. */
  total: number;
  /** How many of them agreed with the winning status. */
  supporters: number;
  /** supporters / total, as a percentage. */
  agreement: number;
  confidence: ConfidenceKey;
  /** Timestamp of the newest counted vote, or null when there were none. */
  lastAt: number | null;
}

export function summarize(
  reports: readonly Report[],
  subject: SupplySubjectKey,
  now: number,
): Summary {
  const cutoff = now - OBSERVATION_WINDOW_MS;

  let candidates = reports
    .filter((r) => r.subject === subject && r.createdAt >= cutoff)
    .sort((a, b) => b.createdAt - a.createdAt);

  // A refill wipes the slate: only reports at or after it describe the state now.
  const refill = candidates.find((r) => r.action === 'refilled');
  if (refill) candidates = candidates.filter((r) => r.createdAt >= refill.createdAt);

  // One vote per person — `candidates` is newest-first, so the first hit wins.
  const byUser = new Map<string, Report>();
  for (const r of candidates) if (!byUser.has(r.userId)) byUser.set(r.userId, r);
  const votes = [...byUser.values()];

  if (votes.length === 0) {
    return {
      subject,
      status: 'none',
      dominantAction: null,
      total: 0,
      supporters: 0,
      agreement: 0,
      confidence: 'none',
      lastAt: null,
    };
  }

  const weighted: Record<StatusKey, number> = { available: 0, low: 0, unavailable: 0 };
  const counts: Record<StatusKey, number> = { available: 0, low: 0, unavailable: 0 };
  for (const v of votes) {
    const s = toStatus(v.action as ActionKey);
    weighted[s] += weight(v.createdAt, now);
    counts[s] += 1;
  }

  const urgent =
    votes.filter(
      (v) => toStatus(v.action as ActionKey) === 'unavailable' && now - v.createdAt <= 10 * MINUTE,
    ).length >= 2;

  const status: StatusKey = urgent
    ? 'unavailable'
    : [...STATUS_PRIORITY].sort((a, b) => weighted[b] - weighted[a])[0];

  const total = votes.length;
  const supporters = counts[status];
  const agreement = Math.round((supporters / total) * 100);
  const lastAt = Math.max(...votes.map((v) => v.createdAt));
  const age = now - lastAt;

  let confidence: ConfidenceKey = 'low';
  if (total >= 3 && agreement >= 75 && age <= 10 * MINUTE) confidence = 'high';
  else if (total >= 2 && agreement >= 60 && age <= 20 * MINUTE) confidence = 'medium';

  const dominantAction: ActionKey =
    status === 'available' && votes.some((v) => v.action === 'refilled') ? 'refilled' : status;

  return { subject, status, dominantAction, total, supporters, agreement, confidence, lastAt };
}

/**
 * Fallbacks for a subject nobody has reported on inside the window. The board
 * should never render blank, so it shows a plausible resting state instead.
 */
const DEFAULT_STATUS: Record<SupplySubjectKey, StatusKey> = {
  coffeeBeans: 'available',
  cocoaPowder: 'low',
  milkPowder: 'available',
  ice: 'available',
  machine: 'available',
};

const DEFAULT_LEVEL: Record<MaterialKey, number> = {
  coffeeBeans: 75,
  cocoaPowder: 35,
  milkPowder: 80,
  ice: 60,
};

export interface Aggregation {
  summaries: Summary[];
  statuses: Record<SupplySubjectKey, StatusKey>;
  /** Estimated remaining stock per material, 0–100. */
  levels: Record<MaterialKey, number>;
}

export function aggregate(reports: readonly Report[], now: number): Aggregation {
  const summaries = SUPPLY_SUBJECT_KEYS.map((k) => summarize(reports, k, now));
  const statuses = { ...DEFAULT_STATUS };
  const levels = { ...DEFAULT_LEVEL };

  for (const s of summaries) {
    if (s.status === 'none') continue;
    statuses[s.subject] = s.status;
    if (s.subject !== 'machine') {
      levels[s.subject] =
        s.dominantAction === 'refilled' ? 100 : ACTION_META[s.status].level;
    }
  }

  return { summaries, statuses, levels };
}

export interface Overall {
  label: string;
  reason: string;
  tone: StatusKey;
}

export function overallState(
  statuses: Record<SupplySubjectKey, StatusKey>,
  subjectLabels: Record<SubjectKey, string>,
): Overall {
  if (statuses.machine === 'unavailable') {
    return {
      label: 'マシンを利用できません',
      reason: 'マシン全体の利用不可報告があります',
      tone: 'unavailable',
    };
  }
  if (MATERIAL_KEYS.some((k) => statuses[k] === 'unavailable')) {
    return { label: '一部利用できません', reason: '一部材料が不足しています', tone: 'unavailable' };
  }
  const low = MATERIAL_KEYS.find((k) => statuses[k] === 'low');
  if (low) {
    return {
      label: '一部残り少なめ',
      reason: `${subjectLabels[low]}がそろそろなくなりそうです。お早めにどうぞ。`,
      tone: 'low',
    };
  }
  return { label: '利用できます', reason: '各材料は十分にあります', tone: 'available' };
}

/**
 * The material the header's 確からしさ metric speaks for: whatever is most
 * worth worrying about, falling back to whichever reading is shakiest.
 */
export function focusSummary(
  summaries: readonly Summary[],
  statuses: Record<SupplySubjectKey, StatusKey>,
) {
  const materials = summaries.filter((s) => s.subject !== 'machine');
  // The shakiest-reading fallback only considers materials people have
  // actually reported on. A material with no reports has 0% agreement, which
  // would otherwise win every time and peg the headline metric to 「情報なし」
  // however solid the rest of the board is.
  const reported = materials.filter((s) => s.total > 0);
  return (
    materials.find((s) => statuses[s.subject] === 'unavailable') ??
    materials.find((s) => statuses[s.subject] === 'low') ??
    [...reported].sort((a, b) => a.agreement - b.agreement)[0] ??
    materials[0]
  );
}

/* ------------------------------------------------------------------ queue -- */

export interface QueueSummary {
  /** null when nobody has reported inside the (short) queue window. */
  level: QueueLevel | null;
  total: number;
  supporters: number;
  agreement: number;
  confidence: ConfidenceKey;
  lastAt: number | null;
}

/**
 * Queue votes decay far faster than stock votes: full weight for two minutes,
 * then a steep slide to nothing at ten. Someone's five-minute-old glance still
 * counts for something, but it must never outweigh what someone can see now.
 */
export function queueWeight(createdAt: number, now: number): number {
  const age = now - createdAt;
  if (age <= 2 * MINUTE) return 1;
  if (age <= 5 * MINUTE) return 0.6;
  if (age <= 10 * MINUTE) return 0.3;
  return 0;
}

/** Busiest-first, so ties resolve toward the more cautious answer. */
const QUEUE_PRIORITY: readonly QueueLevel[] = ['long', 'medium', 'short', 'empty'];

export function summarizeQueue(reports: readonly Report[], now: number): QueueSummary {
  const cutoff = now - QUEUE_WINDOW_MS;
  const candidates = reports
    .filter((r) => r.subject === QUEUE_SUBJECT && r.createdAt >= cutoff)
    .sort((a, b) => b.createdAt - a.createdAt);

  const byUser = new Map<string, Report>();
  for (const r of candidates) if (!byUser.has(r.userId)) byUser.set(r.userId, r);
  const votes = [...byUser.values()];

  if (votes.length === 0) {
    return { level: null, total: 0, supporters: 0, agreement: 0, confidence: 'none', lastAt: null };
  }

  const weighted = Object.fromEntries(QUEUE_LEVELS.map((l) => [l, 0])) as Record<QueueLevel, number>;
  const counts = Object.fromEntries(QUEUE_LEVELS.map((l) => [l, 0])) as Record<QueueLevel, number>;
  for (const v of votes) {
    const level = v.action as QueueLevel;
    weighted[level] += queueWeight(v.createdAt, now);
    counts[level] += 1;
  }

  const level = [...QUEUE_PRIORITY].sort((a, b) => weighted[b] - weighted[a])[0];
  const total = votes.length;
  const supporters = counts[level];
  const agreement = Math.round((supporters / total) * 100);
  const lastAt = Math.max(...votes.map((v) => v.createdAt));
  const age = now - lastAt;

  // Stricter freshness than supply: a queue reading nobody has confirmed in
  // the last few minutes is a guess, however many people once agreed on it.
  let confidence: ConfidenceKey = 'low';
  if (total >= 2 && agreement >= 67 && age <= 3 * MINUTE) confidence = 'high';
  else if (agreement >= 50 && age <= 5 * MINUTE) confidence = 'medium';

  return { level, total, supporters, agreement, confidence, lastAt };
}

/**
 * Whether the queue is worth mentioning next to the machine's status. An empty
 * or barely-there queue is the expected case and doesn't need calling out.
 */
export function queueIsNotable(summary: QueueSummary): boolean {
  return summary.level !== null && QUEUE_META[summary.level].tone !== 'available';
}
