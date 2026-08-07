-- Every observation anyone has posted. Rows are append-only except for the
-- 5-second undo window, which deletes the row outright.
CREATE TABLE IF NOT EXISTS reports (
  id          TEXT PRIMARY KEY,
  subject     TEXT NOT NULL,
  action      TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  user_label  TEXT NOT NULL,
  created_at  INTEGER NOT NULL -- epoch milliseconds
);

-- The read path is always "recent reports, newest first", optionally narrowed
-- to one subject.
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_subject_created_at ON reports (subject, created_at DESC);

-- One row per device. Exists so a person keeps the same 利用者X label across
-- visits, and so labels can be handed out without collisions.
CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);
