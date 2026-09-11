-- 日別・週別の推移（JST）。週は月曜起点で、period にはその週の月曜を出す。
-- 日付の枠は 2026-08-07（初回デプロイ）と最初の活動日の早い方から今日（JST）まで。
-- 活動ゼロの日も 0 で出す（再帰 CTE。LIMIT 400 は created_at が壊れていたときの暴走止め）。
--
--   new_users    = users.created_at がその期間（投稿かご意見で初めてラベルを得た端末）
--   new_seen     = 5表のどれかに初めて現れた端末（閲覧計測だけの端末も含む）
--   active       = reports ∪ events に user_id が現れた端末
--   posters      = reports に現れた端末、postings = 投稿数（グループ単位）
--   form_viewers = report_view を送った端末、events = イベント件数
--
-- report_view の意味は 2026-09-09 に変わっている（〜09-08 は投稿欄が画面に入ったとき、
-- 09-09〜 は投稿欄を展開したとき）。その前後で form_viewers を直接つなげないこと。
--
-- touch の UNION ALL 5 項は workerd の SQLite の上限ちょうど（6 項で落ちる。summary.sql の注記）。
-- 約束: コメントは行頭 `--` の行だけ。文は1つ。
WITH RECURSIVE
  touch AS (
    SELECT user_id, created_at FROM reports
    UNION ALL SELECT user_id, created_at FROM events
    UNION ALL SELECT id,      created_at FROM users
    UNION ALL SELECT user_id, created_at FROM feedback
    UNION ALL SELECT user_id, created_at FROM push_subscriptions
  ),
  first_seen AS (
    SELECT user_id, date(MIN(created_at) / 1000, 'unixepoch', '+9 hours') AS day
      FROM touch
     GROUP BY user_id
  ),
  bounds AS (
    SELECT MIN(day) AS start_day, date('now', '+9 hours') AS end_day
      FROM (SELECT '2026-08-07' AS day UNION ALL SELECT day FROM first_seen)
  ),
  days(day) AS (
    SELECT start_day FROM bounds
    UNION ALL
    SELECT date(day, '+1 day') FROM days WHERE day < (SELECT end_day FROM bounds)
    LIMIT 400
  ),
  periods AS (
    SELECT '日' AS grain, day AS period, day AS from_day, day AS to_day FROM days
    UNION ALL
    SELECT '週', week_start, week_start, date(week_start, '+6 days')
      FROM (SELECT DISTINCT date(day, '-' || ((CAST(strftime('%w', day) AS INTEGER) + 6) % 7) || ' days') AS week_start
              FROM days)
  ),
  users_d AS (
    SELECT date(created_at / 1000, 'unixepoch', '+9 hours') AS day FROM users
  ),
  posting AS (
    SELECT COALESCE(group_id, user_id || '@' || created_at) AS pid, user_id,
           date(MIN(created_at) / 1000, 'unixepoch', '+9 hours') AS day
      FROM reports
     GROUP BY 1, 2
  ),
  active AS (
    SELECT user_id, date(created_at / 1000, 'unixepoch', '+9 hours') AS day FROM reports
    UNION ALL
    SELECT user_id, date(created_at / 1000, 'unixepoch', '+9 hours') FROM events
  ),
  ev AS (
    SELECT name, user_id, date(created_at / 1000, 'unixepoch', '+9 hours') AS day FROM events
  )
SELECT p.grain, p.period,
       substr('日月火水木金土', CAST(strftime('%w', p.period) AS INTEGER) + 1, 1) AS dow,
       (SELECT COUNT(*) FROM users_d u WHERE u.day BETWEEN p.from_day AND p.to_day) AS new_users,
       (SELECT COUNT(*) FROM first_seen f WHERE f.day BETWEEN p.from_day AND p.to_day) AS new_seen,
       (SELECT COUNT(DISTINCT user_id) FROM active a WHERE a.day BETWEEN p.from_day AND p.to_day) AS active,
       (SELECT COUNT(DISTINCT user_id) FROM posting q WHERE q.day BETWEEN p.from_day AND p.to_day) AS posters,
       (SELECT COUNT(*) FROM posting q WHERE q.day BETWEEN p.from_day AND p.to_day) AS postings,
       (SELECT COUNT(DISTINCT user_id) FROM ev e WHERE e.day BETWEEN p.from_day AND p.to_day AND e.name = 'report_view') AS form_viewers,
       (SELECT COUNT(*) FROM ev e WHERE e.day BETWEEN p.from_day AND p.to_day) AS events
  FROM periods p
 ORDER BY p.grain, p.period;
