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
  type DrinkKey,
  type DrinkResult,
  type MaterialKey,
  type QueueLevel,
  type Report,
  type StatusKey,
  type StatusOrNone,
  type SubjectKey,
  type SupplySubjectKey,
} from './domain.js';
import {
  AVAILABLE_RETENTION_MS,
  CONFIG,
  OBSERVATION_WINDOW_MS,
  QUEUE_WINDOW_MS,
} from './config.js';

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
  /**
   * True when this reading is an afterglow: the observation window is empty
   * and the status shown is the last good report, carried forward. Carried
   * readings have no in-window votes (total 0) and are always 低 confidence.
   */
  carried?: boolean;
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
    // 残照: how long the last report outlives the empty window depends on
    // what it said. 取れた／補充された keeps showing — supplies don't vanish
    // on their own — at 低 confidence with its honest timestamp, until
    // availableRetentionMin. 残り少なめ／作れない gets no afterglow: a stale
    // shortage is exactly the reading that needs re-checking, so it becomes
    // 情報なし rather than scaring people away for hours.
    const retentionCutoff = now - AVAILABLE_RETENTION_MS;
    const recent = reports
      .filter((r) => r.subject === subject && r.createdAt >= retentionCutoff)
      .sort((a, b) => b.createdAt - a.createdAt)[0];
    if (recent && toStatus(recent.action as ActionKey) === 'available') {
      return {
        subject,
        status: 'available',
        dominantAction: recent.action === 'refilled' ? 'refilled' : 'available',
        // Not counted as in-window votes: the header's 「過去30分の有効観測」
        // must not claim a two-hour-old sighting as fresh evidence.
        total: 0,
        supporters: 0,
        agreement: 0,
        confidence: 'low',
        lastAt: recent.createdAt,
        carried: true,
      };
    }
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
 * What the board shows when it knows nothing: 情報なし, plainly. Earlier
 * versions substituted plausible-looking resting values inherited from the
 * design mock (75/35/80, cocoa conspicuously "low"), which meant an empty
 * morning board confidently reported shortages nobody had observed. A board
 * built on other people's eyes should say so when there are none.
 */
export const UNKNOWN_STATUSES: Record<SupplySubjectKey, StatusOrNone> = {
  coffeeBeans: 'none',
  cocoaPowder: 'none',
  milkPowder: 'none',
  ice: 'none',
  machine: 'none',
};

export const UNKNOWN_LEVELS: Record<MaterialKey, number | null> = {
  coffeeBeans: null,
  cocoaPowder: null,
  milkPowder: null,
  ice: null,
};

export interface Aggregation {
  summaries: Summary[];
  statuses: Record<SupplySubjectKey, StatusOrNone>;
  /** Estimated remaining stock per material, 0–100 — null when unreported. */
  levels: Record<MaterialKey, number | null>;
}

export function aggregate(reports: readonly Report[], now: number): Aggregation {
  const summaries = SUPPLY_SUBJECT_KEYS.map((k) => summarize(reports, k, now));
  const statuses = { ...UNKNOWN_STATUSES };
  const levels = { ...UNKNOWN_LEVELS };

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
  tone: StatusOrNone;
}

/**
 * Bad news wins over missing news: a confirmed shortage is reported even if
 * other materials are unreported, because 「情報がありません」 must never
 * hide a problem someone has actually seen. Only a board with no usable
 * reports at all says it knows nothing.
 */
export function overallState(
  statuses: Record<SupplySubjectKey, StatusOrNone>,
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

  const unknown = MATERIAL_KEYS.filter((k) => statuses[k] === 'none');
  if (unknown.length === MATERIAL_KEYS.length && statuses.machine === 'none') {
    return {
      label: '情報がありません',
      reason: `過去${CONFIG.observationWindowMin}分に有効な投稿がありません`,
      tone: 'none',
    };
  }
  if (unknown.length > 0) {
    // The headline's precision must match the data's: a green 利用できます
    // over a board with unreported materials reads as vouching for them.
    // Name what is known, name what isn't.
    return {
      label: '確認済みの材料は利用できます',
      reason: `${unknown.map((k) => subjectLabels[k]).join('・')}は情報がありません`,
      tone: 'available',
    };
  }
  return {
    label: '利用できます',
    reason: '各材料は十分にあります',
    tone: 'available',
  };
}

/**
 * The material the header's 確からしさ metric speaks for: whatever is most
 * worth worrying about, falling back to whichever reading is shakiest.
 */
export function focusSummary(
  summaries: readonly Summary[],
  statuses: Record<SupplySubjectKey, StatusOrNone>,
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

/* ----------------------------------------------------------------- drinks -- */

/**
 * The direct verdict on one drink: did people get it out of the machine?
 * Same window, one vote per person, same age weighting as supply votes.
 * Ties break toward failed — being told it didn't pour outweighs optimism.
 * No afterglow here: a made report's long-term effect lives on through the
 * material votes it expanded into.
 */
export function summarizeDrinkReports(
  reports: readonly Report[],
  drink: DrinkKey,
  now: number,
): DrinkResult | null {
  const cutoff = now - OBSERVATION_WINDOW_MS;
  const candidates = reports
    .filter((r) => r.subject === drink && r.createdAt >= cutoff)
    .sort((a, b) => b.createdAt - a.createdAt);

  const byUser = new Map<string, Report>();
  for (const r of candidates) if (!byUser.has(r.userId)) byUser.set(r.userId, r);
  if (byUser.size === 0) return null;

  let made = 0;
  let failed = 0;
  for (const v of byUser.values()) {
    const w = weight(v.createdAt, now);
    if (v.action === 'made') made += w;
    else failed += w;
  }
  return made > failed ? 'made' : 'failed';
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
