-- ローカル検証用の fixture。本番に流さないこと。scripts/stats/stats.test.ts と手動検証が共用する。
-- id は statsfx- 接頭辞で、冒頭の DELETE で冪等（seed.mjs と違い他の行には触れない）。
-- 時刻は JST を UTC 秒に直して ms にする: (strftime('%s','YYYY-MM-DD HH:MM:SS') - 32400) * 1000
DELETE FROM reports WHERE id LIKE 'statsfx-%';
DELETE FROM users WHERE id LIKE 'statsfx-%';
DELETE FROM events WHERE id LIKE 'statsfx-%';
DELETE FROM feedback WHERE id LIKE 'statsfx-%';
DELETE FROM push_subscriptions WHERE endpoint LIKE 'https://statsfx.invalid/%';

-- A: 歴史行（group_id NULL）の単票2件（目撃と行列）
INSERT INTO users VALUES ('statsfx-A', '利用者A', (strftime('%s','2026-08-07 10:00:00') - 32400) * 1000);
INSERT INTO reports (id, subject, action, user_id, user_label, created_at, group_id) VALUES
  ('statsfx-a1', 'coffeeBeans', 'available', 'statsfx-A', '利用者A', (strftime('%s','2026-08-07 10:00:00') - 32400) * 1000, NULL),
  ('statsfx-a2', 'queue',       'short',     'statsfx-A', '利用者A', (strftime('%s','2026-08-08 11:00:00') - 32400) * 1000, NULL);

-- H: 歴史行だがドリンク展開の形（同一 created_at・同一 user_id・group_id NULL）→ 1件の「作れた」
INSERT INTO users VALUES ('statsfx-H', '利用者H', (strftime('%s','2026-08-10 09:30:00') - 32400) * 1000);
INSERT INTO reports (id, subject, action, user_id, user_label, created_at, group_id) VALUES
  ('statsfx-h1', 'hotCocoa',    'made',      'statsfx-H', '利用者H', (strftime('%s','2026-08-10 09:30:00') - 32400) * 1000, NULL),
  ('statsfx-h2', 'cocoaPowder', 'available', 'statsfx-H', '利用者H', (strftime('%s','2026-08-10 09:30:00') - 32400) * 1000, NULL),
  ('statsfx-h3', 'milkPowder',  'available', 'statsfx-H', '利用者H', (strftime('%s','2026-08-10 09:30:00') - 32400) * 1000, NULL),
  ('statsfx-h4', 'machine',     'available', 'statsfx-H', '利用者H', (strftime('%s','2026-08-10 09:30:00') - 32400) * 1000, NULL);

-- B: 現行のドリンク報告2件（group_id あり）＋ 計測イベント3件 ＋ 通知購読
INSERT INTO users VALUES ('statsfx-B', '利用者B', (strftime('%s','2026-08-14 12:00:00') - 32400) * 1000);
INSERT INTO events (id, name, value, user_id, created_at) VALUES
  ('statsfx-e1', 'cta_click',   NULL, 'statsfx-B', (strftime('%s','2026-08-14 11:58:00') - 32400) * 1000),
  ('statsfx-e2', 'report_view', NULL, 'statsfx-B', (strftime('%s','2026-08-14 11:59:00') - 32400) * 1000),
  ('statsfx-e3', 'post_done',   30,   'statsfx-B', (strftime('%s','2026-08-14 12:00:00') - 32400) * 1000);
INSERT INTO reports (id, subject, action, user_id, user_label, created_at, group_id) VALUES
  ('statsfx-b1', 'hotCoffee',   'made',      'statsfx-B', '利用者B', (strftime('%s','2026-08-14 12:00:00') - 32400) * 1000, 'statsfx-g1'),
  ('statsfx-b2', 'coffeeBeans', 'available', 'statsfx-B', '利用者B', (strftime('%s','2026-08-14 12:00:00') - 32400) * 1000, 'statsfx-g1'),
  ('statsfx-b3', 'machine',     'available', 'statsfx-B', '利用者B', (strftime('%s','2026-08-14 12:00:00') - 32400) * 1000, 'statsfx-g1'),
  ('statsfx-b4', 'iceCoffee',   'made',      'statsfx-B', '利用者B', (strftime('%s','2026-09-10 13:00:00') - 32400) * 1000, 'statsfx-g3'),
  ('statsfx-b5', 'coffeeBeans', 'low',       'statsfx-B', '利用者B', (strftime('%s','2026-09-10 13:00:00') - 32400) * 1000, 'statsfx-g3'),
  ('statsfx-b6', 'ice',         'available', 'statsfx-B', '利用者B', (strftime('%s','2026-09-10 13:00:00') - 32400) * 1000, 'statsfx-g3'),
  ('statsfx-b7', 'machine',     'available', 'statsfx-B', '利用者B', (strftime('%s','2026-09-10 13:00:00') - 32400) * 1000, 'statsfx-g3');
INSERT INTO push_subscriptions VALUES ('https://statsfx.invalid/B', 'k', 'a', 'statsfx-B', (strftime('%s','2026-09-10 13:00:00') - 32400) * 1000);

-- C: 作れなかった（原因マシン）
INSERT INTO users VALUES ('statsfx-C', '利用者C', (strftime('%s','2026-08-20 15:00:00') - 32400) * 1000);
INSERT INTO reports (id, subject, action, user_id, user_label, created_at, group_id) VALUES
  ('statsfx-c1', 'caffeLatte', 'failed',      'statsfx-C', '利用者C', (strftime('%s','2026-08-20 15:00:00') - 32400) * 1000, 'statsfx-g2'),
  ('statsfx-c2', 'machine',    'unavailable', 'statsfx-C', '利用者C', (strftime('%s','2026-08-20 15:00:00') - 32400) * 1000, 'statsfx-g2');

-- D: マシン単票（group_id = 自分の id）
INSERT INTO users VALUES ('statsfx-D', '利用者D', (strftime('%s','2026-08-25 09:00:00') - 32400) * 1000);
INSERT INTO reports (id, subject, action, user_id, user_label, created_at, group_id) VALUES
  ('statsfx-d1', 'machine', 'cleaning', 'statsfx-D', '利用者D', (strftime('%s','2026-08-25 09:00:00') - 32400) * 1000, 'statsfx-d1');

-- E: 計測イベントだけ（フォームまで来て投稿しなかった端末）
INSERT INTO events (id, name, value, user_id, created_at) VALUES
  ('statsfx-e4', 'report_view', NULL, 'statsfx-E', (strftime('%s','2026-08-26 10:00:00') - 32400) * 1000),
  ('statsfx-e5', 'cta_click',   NULL, 'statsfx-E', (strftime('%s','2026-08-26 10:00:00') - 32400) * 1000);

-- F: ご意見だけ（users には登録される）
INSERT INTO users VALUES ('statsfx-F', '利用者F', (strftime('%s','2026-09-01 14:00:00') - 32400) * 1000);
INSERT INTO feedback (id, mood, body, user_id, user_label, created_at) VALUES
  ('statsfx-f1', 'happy', '（本文は出力に現れてはいけない）', 'statsfx-F', '利用者F', (strftime('%s','2026-09-01 14:00:00') - 32400) * 1000);

-- G: 通知購読だけ
INSERT INTO push_subscriptions VALUES ('https://statsfx.invalid/G', 'k', 'a', 'statsfx-G', (strftime('%s','2026-09-03 08:00:00') - 32400) * 1000);
