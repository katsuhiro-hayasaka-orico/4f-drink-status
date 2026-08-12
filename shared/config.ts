/**
 * The three knobs the design tool exposed as tweakable props, fixed here at
 * their defaults. Only `autoRefresh` remains user-facing (the 自動更新 toggle
 * in the header); the other two are constants.
 */
export const CONFIG = {
  /** Show the drink-machine illustration above the summary. */
  showMachine: true,
  /** Reports older than this fall out of the aggregation entirely. */
  observationWindowMin: 30,
  /**
   * The queue gets a much shorter window. A 25-minute-old stock sighting is
   * still worth something; a 25-minute-old queue sighting tells you nothing
   * about whether to walk up there now.
   */
  queueWindowMin: 10,
  /** Initial state of the header's 自動更新 toggle. */
  autoRefresh: true,
  /** How often the client re-fetches while 自動更新 is ON. */
  refreshIntervalMs: 30_000,
  /** How long a freshly posted report can be taken back. */
  undoWindowMs: 5_000,
  /** Rows kept in the 投稿の内訳 table. */
  reportTableLimit: 20,

  /**
   * When the 4F lounge is open, as JST wall-clock hours. Every day — if this
   * ever needs to be weekdays only, `loungeHours` in shared/hours.ts is the
   * one place that decides.
   */
  openHour: 9,
  closeHour: 17,
  /** How long before closing the board starts saying 「まもなく終了」. */
  closingSoonMin: 30,

  /**
   * How long a *good* report (取れた・補充された) keeps showing after the
   * observation window has emptied. Supplies don't vanish on their own, so
   * good news ages gracefully; bad news gets no such afterglow — a shortage
   * older than the 30-minute window is exactly the reading that needs
   * re-checking, so it degrades to 情報なし instead.
   */
  availableRetentionMin: 120,
} as const;

export const OBSERVATION_WINDOW_MS = CONFIG.observationWindowMin * 60_000;
export const QUEUE_WINDOW_MS = CONFIG.queueWindowMin * 60_000;
export const AVAILABLE_RETENTION_MS = CONFIG.availableRetentionMin * 60_000;
