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
  SUBJECT_KEYS,
  type ActionKey,
  type ConfidenceKey,
  type MaterialKey,
  type Report,
  type StatusKey,
  type StatusOrNone,
  type SubjectKey,
} from './domain.js';
import { OBSERVATION_WINDOW_MS } from './config.js';

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
  subject: SubjectKey;
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

export function summarize(reports: readonly Report[], subject: SubjectKey, now: number): Summary {
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
    const s = toStatus(v.action);
    weighted[s] += weight(v.createdAt, now);
    counts[s] += 1;
  }

  const urgent =
    votes.filter((v) => toStatus(v.action) === 'unavailable' && now - v.createdAt <= 10 * MINUTE)
      .length >= 2;

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
const DEFAULT_STATUS: Record<SubjectKey, StatusKey> = {
  coffeeBeans: 'available',
  cocoaPowder: 'low',
  milkPowder: 'available',
  machine: 'available',
};

const DEFAULT_LEVEL: Record<MaterialKey, number> = {
  coffeeBeans: 75,
  cocoaPowder: 35,
  milkPowder: 80,
};

export interface Aggregation {
  summaries: Summary[];
  statuses: Record<SubjectKey, StatusKey>;
  /** Estimated remaining stock per material, 0–100. */
  levels: Record<MaterialKey, number>;
}

export function aggregate(reports: readonly Report[], now: number): Aggregation {
  const summaries = SUBJECT_KEYS.map((k) => summarize(reports, k, now));
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
  statuses: Record<SubjectKey, StatusKey>,
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
export function focusSummary(summaries: readonly Summary[], statuses: Record<SubjectKey, StatusKey>) {
  const materials = summaries.filter((s) => s.subject !== 'machine');
  return (
    materials.find((s) => statuses[s.subject] === 'unavailable') ??
    materials.find((s) => statuses[s.subject] === 'low') ??
    [...materials].sort((a, b) => a.agreement - b.agreement)[0]
  );
}
