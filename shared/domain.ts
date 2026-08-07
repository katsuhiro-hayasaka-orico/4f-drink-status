/**
 * Domain vocabulary shared by the Worker API and the React client.
 *
 * Everything a report can be *about* (`SubjectKey`) and everything it can
 * *say* (`ActionKey`) is enumerated here, so the API can validate payloads
 * against the same table the UI renders from.
 */

export const SUBJECT_KEYS = ['coffeeBeans', 'cocoaPowder', 'milkPowder', 'machine'] as const;
export type SubjectKey = (typeof SUBJECT_KEYS)[number];

/** The three consumables, in display order. `machine` is deliberately excluded. */
export const MATERIAL_KEYS = ['coffeeBeans', 'cocoaPowder', 'milkPowder'] as const;
export type MaterialKey = (typeof MATERIAL_KEYS)[number];

export const ACTION_KEYS = ['available', 'low', 'unavailable', 'refilled'] as const;
export type ActionKey = (typeof ACTION_KEYS)[number];

/** What an aggregated subject resolves to. `none` means "no usable reports". */
export type StatusKey = 'available' | 'low' | 'unavailable';
export type StatusOrNone = StatusKey | 'none';

export type ConfidenceKey = 'high' | 'medium' | 'low' | 'none';

export const SUBJECT_LABELS: Record<SubjectKey, string> = {
  coffeeBeans: 'コーヒー豆',
  cocoaPowder: 'ココア',
  milkPowder: 'ミルク',
  machine: 'マシン全体',
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

export function isSubjectKey(v: unknown): v is SubjectKey {
  return typeof v === 'string' && (SUBJECT_KEYS as readonly string[]).includes(v);
}

export function isActionKey(v: unknown): v is ActionKey {
  return typeof v === 'string' && (ACTION_KEYS as readonly string[]).includes(v);
}

/** A single observation posted by one person. */
export interface Report {
  id: string;
  subject: SubjectKey;
  action: ActionKey;
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
