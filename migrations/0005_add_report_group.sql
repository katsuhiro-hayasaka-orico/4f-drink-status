-- One drink report fans out into several rows (material votes + the drink
-- verdict itself). They share a group id so undo can take the whole posting
-- back at once. Single-row reports store their own id here; historical rows
-- stay NULL and keep working — the undo path falls back to the row id.
ALTER TABLE reports ADD COLUMN group_id TEXT;

CREATE INDEX IF NOT EXISTS idx_reports_group ON reports (group_id);
