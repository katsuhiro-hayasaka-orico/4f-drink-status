-- Feedback entries can now be edited by their author. A public entry that
-- changed after people liked it should say so, hence the timestamp rather
-- than a silent overwrite. NULL = never edited.
ALTER TABLE feedback ADD COLUMN updated_at INTEGER;
