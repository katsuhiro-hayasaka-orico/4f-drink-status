-- Web Push subscriptions: one row per browser installation that turned the
-- 通知 toggle on. The endpoint is an unguessable capability URL issued by the
-- push service (APNs/FCM/Mozilla), so it doubles as the natural primary key —
-- re-subscribing the same browser overwrites in place. user_id ties a
-- subscription to the anonymous device identity so a poster's own devices are
-- excluded from their posting's notification, mirroring the old in-tab rule.
CREATE TABLE push_subscriptions (
  endpoint   TEXT PRIMARY KEY,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions (user_id);
