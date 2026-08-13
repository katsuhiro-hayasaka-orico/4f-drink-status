-- Visitor feedback about the site itself (みんなの声): a mood plus an optional
-- free-text comment, shown publicly on the board. Body may be '' for a
-- mood-only one-tap submission; those feed the mood tally but render no card.
CREATE TABLE IF NOT EXISTS feedback (
  id          TEXT PRIMARY KEY,
  mood        TEXT NOT NULL,   -- 'happy' | 'neutral' | 'sad'
  body        TEXT NOT NULL,   -- trimmed, may be ''
  user_id     TEXT NOT NULL,
  user_label  TEXT NOT NULL,
  created_at  INTEGER NOT NULL -- epoch milliseconds
);

-- The read path is "newest feedback first"; the rate limit counts a device's
-- recent rows.
CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON feedback (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_user_created_at ON feedback (user_id, created_at DESC);

-- One like per person per feedback entry, enforced by the primary key rather
-- than by application code. Liking again deletes the row (a toggle).
CREATE TABLE IF NOT EXISTS feedback_likes (
  feedback_id TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  created_at  INTEGER NOT NULL, -- epoch milliseconds
  PRIMARY KEY (feedback_id, user_id)
);
