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
} as const;

export const OBSERVATION_WINDOW_MS = CONFIG.observationWindowMin * 60_000;
export const QUEUE_WINDOW_MS = CONFIG.queueWindowMin * 60_000;
