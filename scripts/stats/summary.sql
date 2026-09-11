-- 累計の端末数。端末 = 匿名クッキー dsid の user_id（worker/identity.ts）。
-- 出すのは件数と日時だけ。user_id・endpoint・ご意見本文は SELECT しない（Actions のログは public）。
--
-- 約束: コメントは行頭 `--` の行だけ（scripts/stats/run.mjs が行単位で落として
-- wrangler の --command に渡す）。行末コメントと /* */ は使わない。文は1つ。
--
-- 投稿の単位は COALESCE(group_id, user_id || '@' || created_at)。group_id は
-- migrations/0005 の後付けで歴史行は NULL だが、歴史行は同一 user_id・同一 created_at で
-- 並ぶ（src/lib/postings.ts の collapsePostings と同じ推測）ので、その組を1投稿と数える。
-- 単票は自分の id を group_id に持つ（worker/store.ts の insertReport）。
--
-- users.created_at は ensureUserLabel が初めて呼ばれた時刻 = 初投稿か初ご意見
-- （worker/index.ts の handlePost / handleDrinkPost / handleFeedbackPost）。閲覧だけの端末は無い。
--
-- workerd（wrangler local と本番 D1 が使う SQLite）は compound SELECT を 5 項までに制限している
-- （6 項で "too many terms in compound SELECT"。wrangler d1 execute --local で実測）。
-- 8 指標を 1 つの UNION ALL に並べると落ちるので a / b の 2 段に分けてある。touch の 5 項は上限ちょうど。
WITH
  posting AS (
    SELECT COALESCE(group_id, user_id || '@' || created_at) AS pid,
           user_id, MIN(created_at) AS created_at
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
  a AS (
    SELECT 1 AS ord, '登録端末（users：投稿かご意見で初めてラベルを得た）' AS metric,
           COUNT(*) AS devices, COUNT(*) AS n, MIN(created_at) AS first_ms, MAX(created_at) AS last_ms
      FROM users
    UNION ALL
    SELECT 2, '投稿端末（reports：現存する投稿あり。n は投稿数）',
           COUNT(DISTINCT user_id), COUNT(*), MIN(created_at), MAX(created_at)
      FROM posting
    UNION ALL
    SELECT 3, '計測端末（events：何らかの計測イベントあり。n はイベント数）',
           COUNT(DISTINCT user_id), COUNT(*), MIN(created_at), MAX(created_at)
      FROM events
    UNION ALL
    SELECT 4, 'フォーム到達端末（events.report_view。n は表示回数）',
           COUNT(DISTINCT user_id), COUNT(*), MIN(created_at), MAX(created_at)
      FROM events
     WHERE name = 'report_view'
  ),
  b AS (
    SELECT 5 AS ord, '和集合（users ∪ events）' AS metric,
           COUNT(DISTINCT user_id) AS devices, NULL AS n, MIN(created_at) AS first_ms, MAX(created_at) AS last_ms
      FROM (SELECT id AS user_id, created_at FROM users
            UNION ALL SELECT user_id, created_at FROM events)
    UNION ALL
    SELECT 6, 'ご意見を送った端末（feedback。n は件数）',
           COUNT(DISTINCT user_id), COUNT(*), MIN(created_at), MAX(created_at)
      FROM feedback
    UNION ALL
    SELECT 7, '通知購読端末（push_subscriptions。n は現存する購読数）',
           COUNT(DISTINCT user_id), COUNT(*), MIN(created_at), MAX(created_at)
      FROM push_subscriptions
    UNION ALL
    SELECT 8, '和集合（全テーブル：reports ∪ events ∪ users ∪ feedback ∪ push）',
           COUNT(DISTINCT user_id), NULL, MIN(created_at), MAX(created_at)
      FROM touch
  )
SELECT metric, devices, n,
       strftime('%Y-%m-%d %H:%M', first_ms / 1000, 'unixepoch', '+9 hours') AS first_jst,
       strftime('%Y-%m-%d %H:%M', last_ms  / 1000, 'unixepoch', '+9 hours') AS last_jst
  FROM (SELECT * FROM a UNION ALL SELECT * FROM b)
 ORDER BY ord;
