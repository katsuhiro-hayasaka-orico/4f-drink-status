/**
 * Domain vocabulary shared by the Worker API and the React client.
 *
 * Reports come in two kinds, and keeping them apart matters:
 *
 *   - **Supply reports** say something about stock or the machine itself
 *     (取れた / 残り少なめ / 作れない / 補充された).
 *   - **Queue reports** say how many people are waiting.
 *
 * They share a table and a voting model, but nothing else: 「補充された」 is
 * meaningless for a queue, 「6人以上」 is meaningless for cocoa, and a queue
 * observation goes stale in minutes where a stock observation stays useful
 * for half an hour. The types below keep the two from being mixed up, and
 * the API validates against exactly these tables.
 */

/** Consumables with a level, in display order. */
export const MATERIAL_KEYS = ['coffeeBeans', 'cocoaPowder', 'milkPowder', 'ice'] as const;
export type MaterialKey = (typeof MATERIAL_KEYS)[number];

/** Everything reported with an `ActionKey`: the materials plus the machine. */
export const SUPPLY_SUBJECT_KEYS = [...MATERIAL_KEYS, 'machine'] as const;
export type SupplySubjectKey = (typeof SUPPLY_SUBJECT_KEYS)[number];

/** The queue is reported with a `QueueLevel` instead. */
export const QUEUE_SUBJECT = 'queue';

/** Every subject a report can be about — used for chips and filters. */
export const SUBJECT_KEYS = [...SUPPLY_SUBJECT_KEYS, QUEUE_SUBJECT] as const;
export type SubjectKey = (typeof SUBJECT_KEYS)[number];

export const ACTION_KEYS = ['available', 'low', 'unavailable', 'refilled'] as const;
export type ActionKey = (typeof ACTION_KEYS)[number];

/** How busy the machine is. `none` here means "nobody waiting", not "no data". */
export const QUEUE_LEVELS = ['empty', 'short', 'medium', 'long'] as const;
export type QueueLevel = (typeof QUEUE_LEVELS)[number];

/** What a report's `action` column can hold, depending on its subject. */
export type ReportValue = ActionKey | QueueLevel;

/** What an aggregated supply subject resolves to. `none` means "no usable reports". */
export type StatusKey = 'available' | 'low' | 'unavailable';
export type StatusOrNone = StatusKey | 'none';

export type ConfidenceKey = 'high' | 'medium' | 'low' | 'none';

export const SUBJECT_LABELS: Record<SubjectKey, string> = {
  coffeeBeans: 'コーヒー豆',
  cocoaPowder: 'ココア',
  milkPowder: 'ミルク',
  ice: '氷',
  machine: 'マシン全体',
  queue: '行列',
};

export interface ActionMeta {
  /** Button copy in the report form. */
  label: string;
  /** Short form used in the breakdown table and observation copy. */
  quote: string;
  /** Estimated remaining stock this report implies, in percent. */
  level: number;
  mark: string;
}

export const ACTION_META: Record<ActionKey, ActionMeta> = {
  available: { label: '取れた・作れた', quote: '取れた', level: 70, mark: '✓' },
  low: { label: '残り少なめ', quote: '残り少なめ', level: 30, mark: '!' },
  unavailable: { label: '売り切れ・作れない', quote: '作れない', level: 0, mark: '×' },
  refilled: { label: '補充された', quote: '補充された', level: 100, mark: '↻' },
};

export interface QueueMeta {
  /** Button copy in the report form. */
  label: string;
  /** Short form for the breakdown table. */
  quote: string;
  /** Headline copy in the queue panel. */
  headline: string;
  /** Rough wait, phrased as a range because the estimate deserves no more precision. */
  wait: string;
  mark: string;
  /** Reuses the status palette rather than inventing a second colour scale. */
  tone: StatusKey;
  /** Representative head count, for the illustration and for ordering. */
  people: number;
}

/**
 * Wait estimates assume roughly 45 seconds per drink, which is about what the
 * machine takes including the walk-up. Deliberately coarse — nobody needs to
 * know whether it's 3 or 4 minutes, only whether it's worth going now.
 */
export const QUEUE_META: Record<QueueLevel, QueueMeta> = {
  empty: {
    label: '誰も並んでいない',
    quote: '0人',
    headline: '待たずに使えます',
    wait: '待ち時間なし',
    mark: '○',
    tone: 'available',
    people: 0,
  },
  short: {
    label: '1〜2人待ち',
    quote: '1〜2人',
    headline: '少し待ちます',
    wait: '目安 1〜2分',
    mark: '1',
    tone: 'available',
    people: 2,
  },
  medium: {
    label: '3〜5人待ち',
    quote: '3〜5人',
    headline: '混んでいます',
    wait: '目安 3〜4分',
    mark: '3',
    tone: 'low',
    people: 4,
  },
  long: {
    label: '6人以上待ち',
    quote: '6人以上',
    headline: 'かなり混んでいます',
    wait: '目安 5分以上',
    mark: '6',
    tone: 'unavailable',
    people: 6,
  },
};

export function isSubjectKey(v: unknown): v is SubjectKey {
  return typeof v === 'string' && (SUBJECT_KEYS as readonly string[]).includes(v);
}

export function isSupplySubjectKey(v: unknown): v is SupplySubjectKey {
  return typeof v === 'string' && (SUPPLY_SUBJECT_KEYS as readonly string[]).includes(v);
}

export function isActionKey(v: unknown): v is ActionKey {
  return typeof v === 'string' && (ACTION_KEYS as readonly string[]).includes(v);
}

export function isQueueLevel(v: unknown): v is QueueLevel {
  return typeof v === 'string' && (QUEUE_LEVELS as readonly string[]).includes(v);
}

/**
 * The one place that decides whether a (subject, value) pair makes sense.
 * Both the API and the client go through here, so a queue report can never
 * carry 「補充された」 and cocoa can never be 「6人以上」.
 */
export function isValidReportValue(subject: SubjectKey, value: unknown): value is ReportValue {
  return subject === QUEUE_SUBJECT ? isQueueLevel(value) : isActionKey(value);
}

export function isQueueReport(report: { subject: SubjectKey }): boolean {
  return report.subject === QUEUE_SUBJECT;
}

/** The label shown for a report's value in the breakdown table. */
export function reportValueQuote(subject: SubjectKey, value: ReportValue): string {
  return subject === QUEUE_SUBJECT
    ? QUEUE_META[value as QueueLevel].quote
    : ACTION_META[value as ActionKey].quote;
}

/** A single observation posted by one person. */
export interface Report {
  id: string;
  subject: SubjectKey;
  /** An `ActionKey` for supply subjects, a `QueueLevel` for the queue. */
  action: ReportValue;
  /** Opaque per-device identifier; the unit of "one vote". */
  userId: string;
  /** Human-readable name shown in the breakdown table, e.g. 利用者A. */
  userLabel: string;
  /** Epoch milliseconds. */
  createdAt: number;
}

export interface ReportsResponse {
  reports: Report[];
  /** The caller's own userId, so the client can label its own posts. */
  me: string;
  /** Server clock at response time — used to keep relative times honest. */
  serverNow: number;
}

/* -------------------------------------------------------------- feedback -- */

/**
 * Feedback about the site itself (みんなの声), separate from machine reports:
 * a three-step mood plus an optional free-text comment. The list is public,
 * so the wire types below carry no user ids — whether an entry is "mine" or
 * already liked is folded into booleans server-side.
 */

export const MOOD_KEYS = ['happy', 'neutral', 'sad'] as const;
export type MoodKey = (typeof MOOD_KEYS)[number];

export interface MoodMeta {
  emoji: string;
  label: string;
}

export const MOOD_META: Record<MoodKey, MoodMeta> = {
  happy: { emoji: '😊', label: '満足' },
  neutral: { emoji: '😐', label: 'ふつう' },
  sad: { emoji: '😞', label: '不満' },
};

export function isMoodKey(v: unknown): v is MoodKey {
  return typeof v === 'string' && (MOOD_KEYS as readonly string[]).includes(v);
}

/**
 * The one place that decides what a feedback comment may contain. Both the
 * API and the form go through here. Returns the trimmed body, or null when
 * the value is not usable ('' is fine — that's a mood-only submission).
 */
export function normalizeFeedbackBody(v: unknown, maxLength: number): string | null {
  if (typeof v !== 'string') return null;
  const body = v.trim();
  return body.length > maxLength ? null : body;
}

/** One public feedback entry, as the client sees it. */
export interface FeedbackEntry {
  id: string;
  mood: MoodKey;
  /** Trimmed comment; '' means the person only tapped a mood. */
  body: string;
  /** 利用者A etc. — the same anonymous label the breakdown table uses. */
  userLabel: string;
  /** Epoch milliseconds. */
  createdAt: number;
  /** How many people currently like this entry. */
  likes: number;
  /** Whether the requesting device likes it — folded in so no ids leak. */
  likedByMe: boolean;
  /** Whether the requesting device wrote it. */
  mine: boolean;
}

export interface FeedbackResponse {
  feedback: FeedbackEntry[];
  serverNow: number;
}
