-- 端末ごとの明細。出すのはラベル（掲示板の投稿者欄と同じ粒度）と日時と件数だけ。
-- user_id は SELECT しない。ラベルなし = users に無い端末（計測イベントか通知購読しか無い端末）。
-- 同じ瞬間に登録された2端末がラベルを共有することがある（worker/store.ts の ensureUserLabel）ので
-- 同じラベルの行が2つ出ることはあり得る。
--
-- touch の UNION ALL 5 項は workerd の SQLite の上限ちょうど（6 項で落ちる。summary.sql の注記）。
-- 約束: コメントは行頭 `--` の行だけ。文は1つ。
WITH
  posting AS (
    SELECT COALESCE(group_id, user_id || '@' || created_at) AS pid, user_id
      FROM reports
     GROUP BY 1, 2
  ),
  touch AS (
    SELECT user_id, created_at FROM reports
    UNION ALL SELECT user_id, created_at FROM events
    UNION ALL SELECT id,      created_at FROM users
    UNION ALL SELECT user_id, created_at FROM feedback
    UNION ALL SELECT user_id, created_at FROM push_subscriptions
  ),
  device AS (
    SELECT user_id, MIN(created_at) AS first_ms, MAX(created_at) AS last_ms
      FROM touch
     GROUP BY user_id
  )
SELECT COALESCE(u.label, '（ラベルなし：投稿もご意見もない端末）') AS label,
       strftime('%Y-%m-%d %H:%M', d.first_ms / 1000, 'unixepoch', '+9 hours') AS first_jst,
       strftime('%Y-%m-%d %H:%M', d.last_ms  / 1000, 'unixepoch', '+9 hours') AS last_jst,
       (SELECT COUNT(*) FROM posting p WHERE p.user_id = d.user_id) AS postings,
       (SELECT COUNT(*) FROM events e WHERE e.user_id = d.user_id) AS events,
       (SELECT COUNT(*) FROM events e WHERE e.user_id = d.user_id AND e.name = 'report_view') AS form_views
  FROM device d
  LEFT JOIN users u ON u.id = d.user_id
 ORDER BY d.first_ms, label;
