-- 投稿の内訳（投稿 = グループ単位）。
-- 分類: グループにドリンク行（action が made / failed = shared/domain.ts の DRINK_RESULTS。
-- この値を持つのはドリンク行だけ）があればドリンク報告。無ければ単票なので subject で
-- 行列 / マシン / 目撃（材料の残量）に分ける。ドリンク判定を先にするのが肝心で、
-- ドリンク報告のグループには machine 行が混じる（shared/drinkReport.ts の buildDrinkReportRows）。
-- CASE ではなく IIF を使うのは、wrangler のローカル SQL 分割器が CASE...END を
-- 複文の目印として追跡する癖を避けるため。
--
-- 約束: コメントは行頭 `--` の行だけ。文は1つ。
WITH
  posting AS (
    SELECT COALESCE(group_id, user_id || '@' || created_at) AS pid,
           user_id,
           MIN(created_at) AS created_at,
           MAX(action IN ('made', 'failed')) AS is_drink,
           MAX(action = 'made')               AS is_made,
           MAX(subject = 'queue')             AS is_queue,
           MAX(subject = 'machine')           AS is_machine
      FROM reports
     GROUP BY 1, 2
  ),
  labels(ord, kind) AS (
    VALUES (1, 'ドリンク報告（作れた）'),
           (2, 'ドリンク報告（作れなかった）'),
           (3, '目撃（材料の残量）'),
           (4, 'マシン'),
           (5, '行列'),
           (6, 'ご意見'),
           (7, '通知購読（現存する購読）')
  ),
  classified AS (
    SELECT user_id, created_at,
           IIF(is_drink, IIF(is_made, 1, 2), IIF(is_queue, 5, IIF(is_machine, 4, 3))) AS ord
      FROM posting
    UNION ALL SELECT user_id, created_at, 6 FROM feedback
    UNION ALL SELECT user_id, created_at, 7 FROM push_subscriptions
  )
SELECT l.kind,
       COUNT(c.user_id)          AS n,
       COUNT(DISTINCT c.user_id) AS devices,
       strftime('%Y-%m-%d %H:%M', MIN(c.created_at) / 1000, 'unixepoch', '+9 hours') AS first_jst,
       strftime('%Y-%m-%d %H:%M', MAX(c.created_at) / 1000, 'unixepoch', '+9 hours') AS last_jst
  FROM labels l
  LEFT JOIN classified c ON c.ord = l.ord
 GROUP BY l.ord, l.kind
 ORDER BY l.ord;
