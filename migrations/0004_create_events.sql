-- Anonymous usage events, from the UI/UX audit's measurement ask: do people
-- find the report form (report_view), do they use the CTA (cta_click), do
-- they finish (post_done, value = seconds from page load), do they take a
-- post back (post_undone). The name allowlist lives in shared/domain.ts;
-- nothing free-form is ever stored. Read with wrangler — there is no GET.
CREATE TABLE IF NOT EXISTS events (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  value       INTEGER,         -- optional metric payload, NULL for most events
  user_id     TEXT NOT NULL,
  created_at  INTEGER NOT NULL -- epoch milliseconds
);

CREATE INDEX IF NOT EXISTS idx_events_name_created_at ON events (name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_user_created_at ON events (user_id, created_at DESC);
