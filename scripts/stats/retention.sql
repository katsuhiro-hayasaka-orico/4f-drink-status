-- 投稿端末の週次継続（reports のみ。report_view の意味変更に影響されない）。
-- 投稿のまとめ方は trend.sql と同じ。展開行・複数投稿でも1端末は週に1回だけ数える。
-- retained = 前週にも当週にも投稿、retention_pct = retained / prev_posters * 100。
-- returning_posters = 当週に投稿、前週は未投稿、それ以前に投稿歴あり（新規は含めない）。
-- 当週は途中。前週が0端末なら率は NULL（Markdown では空欄）。開始週も部分週になり得る。
-- 週は JST 月曜起点。無投稿週も出す。LIMIT 400 は壊れた日時への暴走止め（週数）。
-- 約束: コメントは行頭 `--` の行だけ。文は1つ。端末ID・ラベルは結果に出さない。
WITH RECURSIVE
  posting AS (
    SELECT COALESCE(group_id, user_id || '@' || created_at) AS pid, user_id,
           date(MIN(created_at) / 1000, 'unixepoch', '+9 hours') AS day
      FROM reports
     GROUP BY 1, 2
  ),
  weekly AS (
    SELECT DISTINCT user_id,
           date(day, '-' || ((CAST(strftime('%w', day) AS INTEGER) + 6) % 7) || ' days') AS week
      FROM posting
     WHERE day <= date('now', '+9 hours')
  ),
  first_post AS (
    SELECT user_id, MIN(week) AS week FROM weekly GROUP BY user_id
  ),
  bounds AS (
    SELECT MIN(week) AS start_week,
           date('now', '+9 hours', 'weekday 0', '-6 days') AS current_week
      FROM (SELECT '2026-08-03' AS week UNION ALL SELECT week FROM first_post)
  ),
  weeks(week) AS (
    SELECT start_week FROM bounds
    UNION ALL
    SELECT date(week, '+7 days') FROM weeks WHERE week < (SELECT current_week FROM bounds)
    LIMIT 400
  ),
  counts AS (
    SELECT w.week, COUNT(c.user_id) AS posters,
           COUNT(p.user_id) AS retained,
           SUM(CASE WHEN p.user_id IS NULL AND f.week < date(w.week, '-7 days') THEN 1 ELSE 0 END) AS returning_posters
      FROM weeks w
      LEFT JOIN weekly c ON c.week = w.week
      LEFT JOIN weekly p ON p.user_id = c.user_id AND p.week = date(w.week, '-7 days')
      LEFT JOIN first_post f ON f.user_id = c.user_id
     GROUP BY w.week
  )
SELECT c.week, date(c.week, '-7 days') AS prev_week,
       CASE WHEN c.week = (SELECT current_week FROM bounds) THEN '途中' ELSE '確定' END AS status,
       COALESCE(p.posters, 0) AS prev_posters, c.posters, c.retained,
       ROUND(100.0 * c.retained / NULLIF(p.posters, 0), 1) AS retention_pct,
       c.returning_posters
  FROM counts c
  LEFT JOIN counts p ON p.week = date(c.week, '-7 days')
 ORDER BY c.week;
