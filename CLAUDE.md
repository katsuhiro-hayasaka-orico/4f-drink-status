# CLAUDE.md

2026-08-07 から約1か月このプロジェクトを担当したクラウドセッションが復旧不能な起動エラーで失われた（会話コンテキスト642kトークン分の設計議論が消失）。このファイルは **リポジトリに現に残っている事実だけから 2026-09-07 に再構成した地図** である。製品仕様は README.md（694行）が担う。ここは README の要約ではなく、**README に書かれていない暗黙知**（不変条件・落とし穴・流儀・現況）と、README/コードへの索引を担う。推測は「推測:」と明示する。それ以外は全て実物を確認した事実である。

## このプロジェクトは何か

弘済ビル4Fラウンジのドリンクマシン（WMF 1100 S）の状態を、その場にいる人の投稿から推定して表示する社内掲示板。「コーヒー、まだある?」に答えるために4階まで上がらなくて済むように、という一点のためのアプリ。投稿はログイン不要・2タップ。Vite + React + TypeScript（フロント）/ Cloudflare Workers + D1（バックエンド）。

言語は混在している。アプリ本体（`shared/` `worker/` `src/`、`scripts/preflight.mjs` `scripts/seed.mjs`）のコメントとコミットメッセージは英語、UI文言・README・CI ワークフローのコメント・`scripts/announce.mjs` `scripts/generate-vapid.mjs` のヘッダは日本語。

## アーキテクチャ地図

生の投稿行（Report）を D1 に貯め、`shared/` の純粋関数が「いま何が飲めるか」へ変換する。**判断ロジックは全て `shared/` にあり、Worker は検証・SQL・レート制限・Push 送信に徹し、コンポーネントは表示に徹する**（`worker/store.ts:230-235` が理由を明記）。`shared/` はフロントと Worker の両方が import するため、DOM 型にも workers-types にも依存できない（`tsconfig.json` / `tsconfig.worker.json` の両方の include に入る）。

| ファイル | 役割 |
| --- | --- |
| `shared/aggregate.ts` | 心臓部。集計・残照・マシンのラッチ・見出し文言（`overallState`）・行列集計。**冒頭 1-15 行のドックコメントに適用順6段階がある。まずここを読む** |
| `shared/domain.ts` | 語彙の一元管理。列挙・ラベル・`ACTION_META`（状態→ラベル/残量%）・型ガード（`isSubjectKey` `isValidReportValue` `isMoodKey` `isEventName`） |
| `shared/config.ts` | 定数（観測窓30分/行列窓10分/残照120分/undo 5秒/開放9-17時/ご意見500字・7日/内訳20件） |
| `shared/drinkReport.ts` | ドリンク投稿の受理条件（`parseDrinkReport`）と材料票への展開（`buildDrinkReportRows`） |
| `shared/drinks.ts` | RECIPES（8種）と `drinkAvailability`（材料状態→1杯の可否） |
| `shared/rhythm.ts` | 「いつ切れやすい？」曜日×時間帯の判断（good/bad分類・6段階バケット・スロット導出） |
| `shared/hours.ts` | 開放時間の唯一の判定箇所（`loungeHours`）。JST 固定 |
| `shared/time.ts` | `relativeTime`（「たった今」「12分前」「2時間前」）。**盤面唯一の時刻表記**（8行） |
| `worker/index.ts` | API の唯一の入口。`route()` は 426-508 行。`json()` / `fail()`（85-98）以外でレスポンスを作らない。SQL は1行も無い |
| `worker/store.ts` | D1 アクセスの全て（1行目「All D1 access lives here.」）。`HISTORY_WINDOW_MS`=24h(:18) / `HISTORY_LIMIT`=200(:21) / `MAX_SUBSCRIPTIONS_PER_USER`=8(:324) |
| `worker/env.ts` | **秘密とバインディングの唯一の一覧**（21行）: `DB` `ASSETS` / `SESSION_SECRET` `VAPID_PRIVATE_JWK` `VAPID_SUBJECT` `ANNOUNCE_TOKEN` `ENVIRONMENT`。新しい secret はここに足す |
| `worker/identity.ts` | HMAC 署名付き匿名クッキー `dsid`。`resolveIdentity` が識別の単一点（103行） |
| `worker/notify.ts` / `worker/push.ts` | Web Push。依存パッケージ無しで RFC 8291 aes128gcm + RFC 8292 VAPID を WebCrypto だけで実装 |
| `src/App.tsx` | 画面の組み立て。セクション順・閉館時マスク（166-190）・ダイアログ制御 |
| `src/components/Section.tsx` | **全カードの共通外枠**（25行、props: `title` `note` `footnote` `id` `ariaLabel`）。App から8箇所で使用 |
| `src/components/` | 22ファイル。命名は画面セクション名と1対1（`QueuePanel` `RhythmCard` `IngredientLevels` `DrinkAvailability` …） |
| `src/components/ReportForm.tsx` | 投稿導線（481行、最大のコンポーネント）。ドリンク報告／目撃報告／行列フォローアップ／マシン状態 |
| `src/components/MachineIllustration.tsx` | Blender レンダー画像＋SVG。座標は `src/assets/machine/layout.json` のみ参照 |
| `src/hooks/` | 6本。`useDrinkStatus.ts`（364行、UI状態の実質的な単一ソース）`useNotifications.ts`（206行、Web Push のクライアント側全部）`useTheme` `useFeedback` `useRhythm` `useInView` |
| `src/lib/api.ts` | **クライアントから API を叩く唯一の場所**。`ApiError` と `request<T>`（`credentials:'same-origin'`）。型は shared から import |
| `src/lib/` | 他に `machineLayout` `postings`（投稿行の折りたたみ）`metrics`（fire-and-forget 計測）`palette` `confidence` `qr` `shipped` `a2hs` `feedbackPrompt` |
| `src/styles.css` | 全スタイル（2373行）。クラス名は `block__element` / `block--modifier` の BEM 風。CSS 変数は役割名。ライトは `:root`、ダークは `:root[data-theme='dark']` |
| `index.html` | Google Fonts（Zen Maru Gothic）の読み込みと、初回ペイント前にテーマを確定させるインラインスクリプト（30-48） |
| `public/sw.js` | Service Worker。**push 表示専用で fetch ハンドラもキャッシュも意図的に持たない**（1-11 行に理由） |
| `scripts/` | `setup-cloudflare.sh` / `.ps1`（初回セットアップの唯一の入口）`preflight.mjs` `generate-vapid.mjs` `announce.mjs` `seed.mjs` |
| `.github/workflows/` | `ci.yml`（main 以外の push と main 宛 PR）/ `deploy.yml`（main への push で本番） |
| `tools/blender/wmf1100s.py` | マシン画像とレイアウト座標の生成元（1000行超） |
| `migrations/` | 0001 reports+users / 0002 feedback+feedback_likes / 0003 feedback.updated_at / 0004 events / 0005 reports.group_id / 0006 push_subscriptions |

`src/App.tsx` の画面の並び（243-380）: ヘッダ → A2hsBanner / MobileInvite → overview（マシンの絵＋SummaryPanel）→ **ReportForm** → 行列の待ち状況 → いつ切れやすい？ → 材料の推定残量 → ドリンクの作成可否 → ドリンクの人気度 → みんなの観測 → 投稿の内訳 → ご意見箱 → フッタ。加えてフォームが画面外のときだけ出る FAB。ReportForm が overview の直後にあるのは UI/UX 監査対応（8f28291）の結果で、`App.tsx:271-272` のコメントが理由を書いている。

## タスク別の逆引き

- **集計のしきい値を変える** → `shared/aggregate.ts` の `weight()` / `summarize()` の `urgent` と confidence 代入部 / `queueWeight()` / `summarizeQueue()` の confidence 代入部。窓の長さは `shared/config.ts`。**ゲージに出る残量%は別物**で `ACTION_META` の `level`（`shared/domain.ts:78-81`、available 70 / low 30 / unavailable 0 / refilled 100）、使用箇所は `shared/aggregate.ts:286-289`。テストは `shared/aggregate.test.ts`（61件）。
- **API を足す** → `worker/index.ts` の `route()` に分岐（順序に注意、不変条件参照）→ 返答は `json()` / `fail(status, 日本語)` のみ、本文は必ず `{ error: 日本語メッセージ }` → 入力検証は `shared/domain.ts` に `is*` 型ガードを足す（**スキーマライブラリは不使用**）→ 変更系は `snapshot()`（index.ts:100-107）をスプレッドして返す → クライアントは `src/lib/api.ts` に呼び出しを足す → 新しい secret は `worker/env.ts`、新しい表は `migrations/`（`0007_*.sql` の連番、冪等に書く）。
- **カードを足す** → `src/components/` に作り、`src/App.tsx` の `<Section title=... note=...>` の列に挿す。独自マークアップではなく `Section` で包むこと。コンポーネントテストは走らない（落とし穴の項）。
- **CI 失敗を手元で再現** → **Node 22** で `npm ci && npm test && npm run build`。`ci.yml` / `deploy.yml` はこの3つしか実行しない（`ci.yml:29,43,47,51`）。キャッシュを疑うときは workflow の key 先頭 `v1-` を上げる。

## 開発コマンド

`package.json:6-24` に16スクリプト。

- 初回・環境の作り直しは **`npx wrangler login && ./scripts/setup-cloudflare.sh`**（Windows は `powershell -ExecutionPolicy Bypass -File scripts\setup-cloudflare.ps1`）。D1 作成 → **`wrangler.toml` の `database_id` 自動記入** → スキーマ適用 → SESSION_SECRET/VAPID 生成登録 → デプロイまで冪等（README:58-104）。
- 手元開発: `npm install` → `npm run db:migrate:local` →（必要なら）`npm run db:seed:local` の**順序依存**（seed はスキーマが無いと落ちる）。
- `npm run dev:worker`（wrangler dev, :8787）と `npm run dev`（Vite, :5173）の**2プロセス構成**。Vite が `/api` を 127.0.0.1:8787 へプロキシする（`vite.config.ts:10-19`）ので、片方だけでは API が全滅する。
- `npm run dev:worker` は**アセット一覧を起動時に読む**。`public/` にファイルを足した／`npm run build` をやり直したら Worker を再起動する。
- `npm test`（vitest run）/ `npm run test:watch` / `npm run typecheck`（tsc×2）が実質的な lint。**ESLint も Prettier も無い**（設定・依存ともに0件）。
- `npm run build` は typecheck を含む。`npm run preview` は Vite のプレビュー。8787 で本番同等確認をするなら先に build（wrangler が `./dist/client` を配る）。
- `npm run db:migrate:remote` / `npm run deploy`（= build + wrangler deploy。`predeploy` で `scripts/preflight.mjs` が走る）。
- `npm run vapid`（VAPID 鍵生成）/ `npm run announce`（お知らせ配信。環境変数 `ANNOUNCE_TOKEN` と `SITE_URL` が必須）。
- `npm run render:machine` は Blender 4.x が必要（CI に無い）。light テーマ時は `wmf1100s.blend` を上書き保存する。
- `npm run feedback` / `feedback:tally` は本番 D1 を直接叩く。**D1:Edit 権限の API トークンが必要**で、`wrangler login` の OAuth のままだと 7403（README:564 付近）。
- ローカルで push を試すには git 管理外の `.dev.vars` に `VAPID_PRIVATE_JWK=...`（README:483）。
- `npm audit` は9件（critical 1含む）出るが `npm audit --production` は0件。全て devDependencies（vite/vitest/wrangler）由来。実行時の npm 依存は `react` / `react-dom` / `qrcode` の3つだけ（`package.json:26-30`）、実行時の外部依存は Google Fonts のみ。

## API（`worker/index.ts:436-508`）

11パス／13のメソッド×パス組。`/api/` で始まらないものは全て `ASSETS` へフォールスルー（`worker/index.ts:514-516`）。**変更系は更新後の一覧（`snapshot()`）も返すのでクライアントは再取得しない**（index.ts:23-25）。

| メソッド | パス | 備考 |
| --- | --- | --- |
| GET / POST | `/api/reports` | POST は20投稿/分（`POST_RATE_LIMIT`, index.ts:74） |
| POST | `/api/reports/drink` | ドリンク報告。材料票へ展開して同一 group_id で保存 |
| GET | `/api/reports/rhythm` | 曜日×時間帯の生カウント |
| DELETE | `/api/reports/group/:gid` | undo（投稿単位） |
| DELETE | `/api/reports/:id` | undo（行単位。group_id が NULL の歴史行向け） |
| GET / POST | `/api/feedback` | GET は満足度の件数のみ。POST は5件/日（`FEEDBACK_RATE_LIMIT`, index.ts:81） |
| POST | `/api/events` | 30件/分（`EVENT_RATE_LIMIT`, index.ts:84）。GET は無い |
| GET | `/api/push/key` | 未設定時は null |
| POST | `/api/push/subscribe`・`/api/push/unsubscribe` | 購読は1 identity あたり8件まで（store.ts:324） |
| POST | `/api/push/announce` | 管理者お知らせ。認証は Bearer `ANNOUNCE_TOKEN` |

**`worker/index.ts` 冒頭のドックコメント（1-26行）の API 一覧は古く、drink / rhythm / announce が載っていない。仕様と信じないこと。**

## D1 スキーマと語彙

5テーブル。`reports` は **undo（5秒窓の行削除）以外 append-only**（`migrations/0001:1-2`）。

- `reports(id, subject, action, user_id, user_label, created_at, group_id)` — `group_id` は 0005 の後付けで**歴史行は NULL、undo はその場合 行 id にフォールバック**（`migrations/0005:1-5`）
- `users(id, label, created_at)` / `feedback(id, mood, body, user_id, user_label, created_at, updated_at)`
- `feedback_likes(feedback_id, user_id, created_at)` / `events(id, name, value, user_id, created_at)`
- `push_subscriptions(endpoint PK, p256dh, auth, user_id, created_at)`

`subject` / `action` 列に実際に入る文字列（`shared/domain.ts`）:

- `MATERIAL_KEYS = coffeeBeans | cocoaPowder | milkPowder | ice`（:18）＋ `machine`（:22）＋ `queue`（:26）
- `ACTION_KEYS = available | low | unavailable | refilled`（:32）、マシン専用の `cleaning`（:46）
- `QUEUE_LEVELS = empty | short | medium | long`（:36）
- `DRINK_KEYS` 8種 = hotCoffee / caffeLatte / caffeMocha / hotCocoa / iceCoffee / iceCaffeLatte / iceCaffeMocha / iceCocoa（:180-189）
- `SIGHTING_ACTIONS = available | low | refilled`（:261。目撃報告のボタン）

## 壊してはいけない不変条件

集計の適用順は `shared/aggregate.ts` 冒頭 1-15 行が正典。**`aggregate.ts` は編集が多く行番号がすぐ腐るので関数名で辿ること。**

- **「補充された」は履歴をリセットする。** refill より前の報告は現状の証拠として一切数えない（`summarize()` 内、aggregate.ts:102-104。テスト `discards everything before a refill`）。
- **1人1票・各人の最新のみ。** `summarize` / `summarizeDrinkReports` / `summarizeQueue` の3箇所で同型に実装（aggregate.ts:107-109, 429-431, 477-479）。フッタの「利用者ごとの最新投稿を1票として集計」（`src/App.tsx:370`）はこの規則の表示面。
- **マシンが未報告なら盲点リストの先頭に入れ、飲めると断定しない**（`overallState()`、aggregate.ts:359-373。テスト `never promises a drink while the machine itself is unreported` / `names the machine ahead of the other blind spots`。コミット bff903b）。
- **`drinkAvailability` は無知を楽観に変えない。** 1つでも未報告の材料があれば「残り少なめ」ではなく「情報なし」、マシン故障は無知にも勝つ（`shared/drinks.test.ts` 6件が全方向を固定）。
- **マシンの「作れない」はラッチする**（2026-09-07 の新仕様）。観測窓も残照上限も超えて、**厳密に新しい positive 報告（取れた・補充された・成功ドリンクが展開する machine 行）が出るまで**消えない。清掃中と残り少なめは「新しい知らせだが良い知らせではない」ので**ラッチを解除できない**（39b64ac / 5abb7e4）。ただし**遡れるのは `listRecentReports` が返す範囲まで**で、`shared/` はこの窓の外を見られない。窓は直近24時間・全対象で最大200行（`worker/store.ts` の `HISTORY_WINDOW_MS` / `HISTORY_LIMIT`）だが、**マシンの最新20行はその枠外で必ず含まれる**（`MACHINE_HISTORY_LIMIT`）。共通枠は古い行から溢れるので、この予約が無いとアウテージ行が無関係な投稿200件に押し出されてラッチが黙って解除される。
- **材料の悪い知らせには残照を与えない。** 良い知らせ（取れた・補充された）だけが最大120分持ち越され、必ず `confidence:'low'` / `total:0` / `carried:true` に落ちる（票数に数えない）。
- **投稿ゼロなら全対象 'none'。** デモ由来の既定値（75/35/80）を復活させてはいけない（`UNKNOWN_STATUSES` 前コメント、aggregate.ts:249-256）。現行の残量%は `ACTION_META`（`shared/domain.ts:78-81`）。
- 集計の重みと閾値は固定値。在庫は10分1.0/20分0.7/30分0.4（`weight()`）、高=3票以上かつ75%以上かつ10分以内、中=2票/60%/20分以内（`summarize()` の confidence）。行列は2分1.0/5分0.6/10分0.3（`queueWeight()`）、高=2票/67%/3分以内、中=50%/5分以内（`summarizeQueue()` の confidence）。
- 10分以内の「作れない」2票以上で、重み合計を無視して無条件 unavailable（`summarize()` の `urgent`）。
- **在庫の同点は楽観側**（available>low>unavailable）、**行列の同点は混雑側**（long>medium>short>empty）に倒す。どちらも `Array.prototype.sort` の安定性と `STATUS_PRIORITY` / `QUEUE_PRIORITY` の配列順に依存しているので、並べ替えると答えが静かに変わる。
- **ご意見の本文はどのエンドポイントからも返さない。** `GET /api/feedback` は満足度の件数のみ。`worker/store.ts` に本文を SELECT するクエリが1本も無く、`FeedbackResponse.feedback` は型レベルで `never[]`（`shared/domain.ts:369-374`）。
- **原因不明の失敗は材料票を1つも生まない。** 成功は使った全材料＋machine を保証し、失敗は名指しされた1つだけを告発する。この非対称が設計の核（`shared/drinkReport.ts:8-12, 101-106`、テスト14件）。
- **目撃報告に「なくなっている」を入れない。** 枯渇の断定は実際に試して失敗した人だけができる（`shared/labels.test.ts` が双方向に固定）。
- **「清掃中」はマシン専用**で `ActionKey` には入れない。`isValidReportValue`（`shared/domain.ts:166-170`）が唯一のゲート。
- **開放時間の判定は `shared/hours.ts` の `loungeHours` 1箇所**、JST 固定（閲覧者のタイムゾーンを見ない）。時間外でも投稿は受け付ける。
- **通知は undo 窓が閉じてから送る。** `SEND_DELAY_MS = CONFIG.undoWindowMs + 16_000`（21秒）は undo の DELETE 猶予（`undoWindowMs + 15_000`）より必ず1秒長い（`worker/notify.ts:25`、`worker/store.ts:180,195`）。送信直前に `groupExists` で生存を再確認し、自分の購読は除外する。
- 1投稿あたりの push は30件で頭打ち（無料プランの subrequest 上限50に収めるため。`MAX_PUSH_PER_POST`, `worker/notify.ts:32`）。**超過分は捨てられるが無言ではなく `console.warn` に出る**（notify.ts:112-114。上限+1件取得して超過を検知する設計。ただし Cloudflare のログを見ないと気づけない）。
- サーバ側の数値上限は5つ。投稿20/分・ご意見5/日・イベント30/分（index.ts:74,81,84）、購読8件/identity（store.ts:324）、取得は24時間・最大200行（store.ts:18,21）。**集計は30分窓なのに取得は24時間ぶん**という非対称はラッチと残照のための前提。
- **計測イベントは許可リストの4つだけ**（cta_click / report_view / post_done / post_undone）。自由記述は保存しない。「許可リストがプライバシーポリシーそのもの」（`shared/domain.ts:376-390`）。
- **1投稿＝1グループ。** 単票も自分の id を group_id に入れるので、undo・レート制限・通知が単票とドリンク報告を同じコードパスで扱える（`worker/store.ts:110-118`）。レート制限は行ではなくグループを数える。
- `/api/reports/drink`・`/rhythm`・`/group/:gid` は `/api/reports/:id` パターンより**先に判定しなければならない**（`worker/index.ts:442-443` に明記）。
- **マシンの絵の窓座標は `src/assets/machine/layout.json` が唯一の真実**（生成物・手編集禁止）。`src/lib/machineLayout.test.ts`（6件）が「窓同士が重ならない」「中身が満杯〜空を超えて動かない」「読み取りが対応するガラスの上にある」を固定。
- マシンの絵のドリンク名は `DRINK_LABELS` から引く SVG テキストで、画像に焼き込まない（可否カードとの表記一致の構造的保証）。
- `worker/push.test.ts`（9件）/ `worker/notify.test.ts`（5件）が固定している契約: RFC 8291/8292 の厳密なバイト列、https 以外のエンドポイント拒否、鍵形状の検証、公開鍵のみの JWK 拒否、通知本文は**ドリンク行を引用し材料票を引用しない**。
- `DRINK_KEYS` は D1 の subject 列に入るので **`shared/domain.ts:174-179` が「never rename them casually」と明示的に警告**している。**推測:** `SUBJECT_KEYS` / `ACTION_KEYS` も同じ列に入る以上、同じ制約がかかるはず（コード上の明文はこの1件だけで、rhythm 集計への波及も明文なし）。
- 匿名IDの識別は `worker/identity.ts` の `resolveIdentity` に閉じる（Cloudflare Access へ移行してもここだけ変える）。
- VAPID 秘密鍵は wrangler secret にのみ置く（リポジトリは public）。

## 設計判断とその理由

残照とラッチの理由は README:239-281、マシンの絵の「額縁」設計は README:327-374、UI/UX 監査対応は README:584-608 に書かれている。ここでは README に無い経緯だけ残す。

- **投稿はドリンク起点**（e427a1b）。人はマシンをホッパーではなくドリンクとして経験するから。材料の残量票はサーバーが導出する。
- **目撃報告を材料→状態の2タップに組み替え、「十分にある」を追加**（d72b958）。以前は満杯のホッパーが見えている人に言う手段が無く、残量記録目的で作っていないドリンクを「作った」と偽投稿する回避策が生まれていた。ご意見箱の声が発端。
- **マシンだけラッチが逆向き**（39b64ac→5abb7e4）。壊れたマシンは自分で直らない。実際のボードで「53分前に2人が作れないと言った直後に『いま飲めます』」が出たのが発端。5abb7e4 はその修正の穴（清掃中がラッチを解除でき「掃除中と言うほうが黙っているより良く読める」状態だった）を adversarial review で潰したもの。
- **ご意見箱は収集は公開・閲覧は管理者のみ**（3c4eeb2）。公開ページの自由記述には個人情報が書き込まれ得るため、外部への流出経路を持たない設計にした。編集・削除・いいねは API/UI ごと撤去。
- **通知は「見られているタブでは出さない」抑制を撤回**（b686a91）。掲示板は壁掛けディスプレイのように開きっぱなしにされる。最初の設計判断が現場で否定された例。
- **Service Worker はキャッシュを持たない**（`public/sw.js:4-10`）。「アプリはオンライン専用として作ってあり、キャッシュ層は staleness バグの第二の発生源になる」。オフライン対応は意図的な不在なので、足す前にこの判断を覆す根拠が要る。
- **通知は購読そのものが状態**で localStorage を使わない（`src/hooks/useNotifications.ts:12-15`）。ブラウザ設定で許可を取り消されてもボタンの表示と食い違わないため。
- **CSS 変数は色名でなく役割名**（`--selected-bg`, `--on-status`）。選択中のチップはライトでは最暗面、ダークでは最明面になり文字色も反転するので、`--espresso` のような名前では表現できない。
- **ライト用とダーク用のレンダーを両方マウントし CSS の visibility で切替**。href の差し替えは新画像が届くまで枠が消えて中身が宙に浮く。
- **Web Push は自前実装**。依存パッケージも外部ベンダー契約も不要にし、Cloudflare 無料プラン（Queues 不使用）で動かすため。
- **デプロイは wrangler-action でなく npx**（bca4bce）。アクションは自前で wrangler を取りに行くので、テストを通した固定版と別の版で本番に出てしまう。
- **CI は node_modules 自体をキャッシュし restore-keys を使わない**（340569e）。部分一致で古い node_modules を拾うと、依存を足した回だけ静かに壊れる。作り直したいときは key 先頭の `v1-` を上げる。
- **お知らせトークンは使い捨て**、不一致・未設定・メソッド違いは全て 404（存在自体を明かさない）。

## 落とし穴

- **`shared/` の import は必ず拡張子 `.js` 付き**（`from './domain.js'`）。ソースは .ts だが `moduleResolution:'bundler'` + `verbatimModuleSyntax`。落とすと動かない。
- **`CONFIG.undoWindowMs` を触るとサーバー側が3箇所同時に動く**（undo の DELETE 猶予 +15秒、push 遅延 +16秒、クライアントUI）。`ctx.waitUntil` の30秒予算を食い潰すと通知が黙って届かなくなる。
- **`shared/feedback.test.ts` と `shared/labels.test.ts` は `shared/domain.ts` のテスト**。同名の実装ファイルは存在しない。ファイル名だけ見て「domain.ts は未テスト」と誤判定しやすい。
- **コンポーネントテストは書いても走らない。** `vitest.config.ts` の include が `*.test.ts` のみ（.tsx 無し）、environment は node、jsdom も testing-library も入っていない。
- **`npm run db:seed:local` は冪等ではなく破壊的**。出力 SQL の先頭が `DELETE FROM reports;`（`scripts/seed.mjs:45`）。手で作った検証データがあるなら流さない。さらに seed の INSERT は `group_id` を書かない（seed.mjs:58-62）ので seed 行は group_id NULL になり、クライアントのグルーピングと undo の挙動が本番の行と異なる。
- **seed を流してもリズムカードと人気度は空**。seed は18行しか入れず判定票が15（`INSUFFICIENT_BELOW=20` 未満）、しかもドリンク行が0件（ピボット前のまま）。
- **`node scripts/announce.mjs "本文"` は動かない。** `--title` を省略すると `titleIdx = -1` → filter が `i !== 0` になり本文が落ちて body が undefined（使い方表示で exit 1）。README の「### 管理者からのお知らせ配信」節とスクリプト自身は `--title` を任意と書いているが実際には必須。
- `POST /api/push/announce` の応答順は **404（トークン不一致・未設定・メソッド違い）→ 503（VAPID 未設定）→ 400（本文長）**。README の「本文を空にして 400 なら認証は通っている」という切り分けは **VAPID 設定済みの環境でのみ**成立する。
- **CI のデプロイ経路は `scripts/preflight.mjs` を通らない。** `predeploy` は npm フックなので手元の `npm run deploy` でしか走らず、`deploy.yml` は `npx wrangler deploy` を直接叩く。
- `wrangler.toml:19` のコメントは「Replace with the id printed by ...」のままだが 20行目には実 ID がコミット済み。別環境では `./scripts/setup-cloudflare.sh` が自動で書き込む（:66,73）ので**手で直す必要は無い**。コメントだけが取り残されている。
- **`migrations/0006` だけ `CREATE TABLE`（IF NOT EXISTS 無し、:7）。** `deploy.yml:61-63` のコメントは「全て冪等」と書いている。wrangler が適用済みを飛ばすので実運用では表面化しないが、手で流し直すと落ちる。**新規マイグレーションを冪等に書くことは本番デプロイの前提。**
- クライアントの localStorage キーは3つ。`drink-status-theme`（`useTheme.ts:11`、`index.html:39` のインラインも同じキーを読む）、`drink-status-feedback-prompted`（`lib/feedbackPrompt.ts:13`）、`drink-status-a2hs-dismissed`（`lib/a2hs.ts:9`）。「バナーが出ない」「ご意見ダイアログが開かない」の第一容疑者。
- **`public/sw.js` は push を受けたら必ず1件通知を表示する**（ペイロードが壊れていても既定文で）。表示しないと iOS がプッシュ許可を停止する。
- 通知の **tag が衝突すると無言で置き換わる**（バナーも音も出ない）。有効化確認は `drink-status-hello`、投稿は `drink-status-reports`、お知らせは `drink-status-announce`。過去に同 tag で「有効化したのに何も来ない」事故が起きた（6e40bae）。
- 「通知が来ない」の切り分けはまず3点。約21秒待つ／自分の投稿は自分に届かない／iPhone はホーム画面アイコンから開かないとボタンすら出ない。
- **VAPID 鍵を作り直すと既存の購読が全て無効**になり全員が ON し直す。setup スクリプトが既存鍵を上書きしないのはこのため。
- `wrangler secret put ANNOUNCE_TOKEN` はプロンプトへの手貼りで不可視文字が混入し「Success なのに認証が通らない」事故になる。変数＋パイプで渡す。`CLOUDFLARE_API_TOKEN` が環境に残っていると secret put 自体が失敗する。
- **Blender は CI に無い**。絵を描き直したら生成物（WebP 3枚＋layout.json）をコミットする。PNG マスターと `*.blend1` は .gitignore。
- `wmf1100s.py` の窓定数だけ書き換えて再レンダーを忘れても **テストは緑のまま通る**（`machineLayout.test.ts` はコミット済み layout.json しか見ない）。
- `SESSION_SECRET` 未設定時は開発用固定鍵へ**無警告でフォールバック**する（`worker/identity.ts:18,27`）。本番で未設定なら誰でもクッキーを偽造できる。
- 楽観行の id は `crypto.randomUUID()` なので、**セキュアコンテキスト（https / localhost）でないと投稿時に例外**になる。
- `useDrinkStatus` の `now` useMemo は依存に `reports`/`tick` を持つが本体で使っていない。**意図的な無効化トリガー**なので「不要な依存」として消すと「N分前」が固まる。
- 閉館中のマスクは `src/App.tsx:166-190` にあり `shared/` 側には無い。shared のテストだけ読むと閉館時の挙動を見落とす。
- `machineCleaning` フラグは shared が計算せず App が組み立てる（`App.tsx:179`）。`overallState` へは直接（:182）、`drinkAvailability` へは `DrinkAvailability.tsx`（App.tsx:323 で props、同 60/107 行で呼ぶ）を経由して届く。
- rhythm の JST 変換は `shared/hours.ts` ではなく **SQL の `strftime '+9 hours'`**（`worker/store.ts:239-240`）にもう1箇所ある。
- `hoursLabel` の区切りは en dash（U+2013）。ハイフンに置き換えるとテストが落ちる。

## 開発の流儀

- **ブランチ名**は `<type>/<内容>`。実例 `feat/machine-render`、`fix/shipped-order`、`chore/deploy-pinned-wrangler`、`perf/cache-node-modules`。2026-08-31 までは `feat/4f-drink-status` を全機能で使い回していたが、9月以降は内容を表す名前に変わっている（後者に倣う）。
- **コミット件名**は Conventional Commits 形式で英語。実例 `fix(aggregate): only good news clears a latched outage`。
- **コミット本文**は英語の長文で「なぜそうしたか・何を却下したか・どう検証したか」を書く。5abb7e4 は症状を3行の表で示してから修正方針を述べている。**コード中に TODO/FIXME/HACK は一切置かない**（grep で0件）— 未完了を印で残さず、決着済みの判断をドックコメントに書くのが方針。
- **コミット末尾に trailer 2行を置く**: `Co-Authored-By: <モデル名> <noreply@anthropic.com>` と `Claude-Session: https://claude.ai/code/session_...`（実例は 359e30c の本文末尾）。非マージコミットは例外なく持つ。マージは61件中23件で、`Merge <ブランチ名>: <要約>` 形式には付ける（直近の実例 978f2b3）。持たない38件は、人手のバンドル同期 `Merge branch 'main' of C:\Users\innov\...`（28件）と、初期の `Merge feat/4f-drink-status: ...`（10件）。**新しいマージには付ける。**
- **マージ件名**は `Merge <ブランチ名>: <要約>`。実例 `Merge feat/machine-render: WMF 1100 S as a Blender render`。
- 仕様を変えたら **README.md の該当節も同時に直す**（機能追加コミットのほぼ全てが README を同時に更新している）。
- 人間（katsuhiro-hayasaka-orico）の29コミットは、28件が `Merge branch 'main' of C:\Users\innov\4f-drink-status.bundle`（Windows ローカルからのバンドル同期、内容変更なし）＋ `cbee93b Set D1 database id`（wrangler.toml 1行のみ）。**実装コミットは全て Claude 名義**なので、**推測:** 実装の設計意図はコミット本文と README 以外に人証が存在しない可能性が高い。

## 現況（2026-09-07 時点）

- **SHA をここに書かない**。すぐ腐るので現在地は毎回コマンドで取る: `git fetch origin main && git log --oneline -5 origin/main && git rev-list --left-right --count origin/main...HEAD`。デプロイ履歴は Actions の Deploy ワークフローを見る。
- **マシン集計の一連の修正は 2026-09-07 に本番反映済み**（Deploy 2回、いずれも全ステップ success）。内訳は4コミット: `bff903b` 未報告のマシンを正常扱いしない / `39b64ac` 壊れたマシンはラッチする / `5abb7e4` 良い知らせだけがラッチを解除する / `7c85126` ラッチの根拠行を共通200件枠の外に出す（+ 最終観測の逆行と確からしさピルの対象ずれ）。D1 のマイグレーション追加は無くスキーマは不変。
- **どのデプロイも実機での目視確認はしていない**。本番URLが不明なため（「文脈が失われた範囲」参照）、根拠は CI と、`worker/store.ts` の SQL についてはローカル D1 での実行結果のみ。
- テストは **13ファイル150件が全通過**（aggregate 61 / drinkReport 14 / hours 11 / rhythm 10 / labels 9 / drinks 6 / feedback 5、push 9 / notify 5、machineLayout 6 / shipped 6 / a2hs 5 / postings 3）。`npm run typecheck` もエラーなし。作業用の一時テストを `src/` `shared/` `worker/` 配下に置くと `vitest.config.ts:6` の include に拾われて件数が増える。
- 直近の作業の流れは、9/3 Blender レンダー化 → 9/4 目撃導線の作り直し・CI/デプロイの足回り整備 → 9/7 集計ロジックのバグ修正3連。UI の作り込みからロジックの正しさへ軸足が移っている。
- コミット trailer から、**失われたセッションは `https://claude.ai/code/session_01Pq73qark1HNzZuwCmf9PXq`**（72コミットが持つ）。現行セッションは `session_01Au31ns5hDxA7y21maRPVci`（直近3件）。`git log --format='%h %(trailers:key=Claude-Session,valueonly)'` でどのコミットがどちらの産物か機械的に判別できる。

## 次に着手すべきもの

1. **`scripts/announce.mjs` の引数パースのバグ**（影響:運用）。`--title` を省略すると本文が落ちる。README の該当節とスクリプトのヘッダも同時に直す。
2. **Worker にテストが1本も無い**（影響:開発）。`index.ts`（528行）`store.ts`（450行）`identity.ts`（103行）。ルーティング順序・3種のレート制限・undo の所有者チェック・HMAC 署名検証が回帰検知されない。`worker/push.test.ts` が WebCrypto でテストを書けているので技術的障壁はない。

## 既知の負債（把握のみ）

- 廃止機能のデッドスキーマ。`feedback_likes`（0002）と `feedback.updated_at`（0003）はコード参照0件だが新規環境でも作られる。
- `CONFIG.feedbackListLimit`（値30）はどこからも参照されていないデッド設定（`shared/config.ts:64`）。コメントも公開一覧時代のまま。
- `src/hooks/` 6本と全コンポーネントにテストが無い。特に `useDrinkStatus.ts`。書くには jsdom / testing-library の基盤追加から必要。
- ヘッダーの「デモ」バッジが出たまま（`src/components/Header.tsx:32`、`/** Set to null once this stops being a pilot. */`）。
- README:685 が参照する `project/4F Drink Status.dc.html` は 359e30c で削除済み（次節から読める）。
- README は `CLOUDFLARE_API_TOKEN` を「手元/ヘッドレスの環境変数」としては説明している（README:105-118、必要権限の表つき）が、**GitHub の repository secret として登録が要ることと、main への push で本番に出ることには一切触れていない**（README に `.github` / Actions / ci.yml / deploy.yml の記述は0件）。`scripts/preflight.mjs` も未記載。
- `listRecentReports` が `group_id` を SELECT していないため、クライアントは `userId:createdAt` でグルーピングを推測している（`src/lib/postings.ts:15`）。サーバーに正確な情報があるのに使っていない。
- README の「UI/UX 監査対応（2026-08）」節と「つくり」ディレクトリツリーが実装に追随していない。
- 「ご意見から改善した機能」リストが `FeedbackBox.tsx` のハードコード配列で、1件足すたびにコード変更とデプロイが要る。
- 3つのダイアログにフォーカストラップとフォーカス復帰が無い。PWA マニフェストのアイコンは 180x180 の1枚だけ。
- `worker/push.ts:60` のコメントが「Tokens are cached per origin」と書いているがキャッシュは存在せず、購読1件ごとに署名している。
- `ReportForm.tsx:437` が材料未選択時に `actionLabelFor(sighting ?? 'coffeeBeans', action)` とダミー subject を渡す。現状は全材料でラベル共通なので実害なし。
- 削除したデザインバンドル（チャットログとアップロード画像）が public リポジトリの過去コミットに残っている。履歴の書き換えは未実施。
- rhythm は平日（月〜金）のみ集計するが `loungeHours` は毎日9-17時。この非対称が意図的か未整理かはリポジトリからは判断できない。

## 復元可能な一次資料

失われた設計議論の**代替として読める一次資料が git 履歴に残っている**。追加は e2f5c96（`Claude Design handoff: ドリンク管理UI三方向案`, 2026-08-07）、削除は 359e30c。tip には無いので次で読む。

```
git show e2f5c96:chats/chat1.md                                   # 111行。最初期の設計会話ログ
git show '359e30c^:HANDOFF.md'                                    # 25行
git show '359e30c^:project/4F Drink Status.dc.html'               # 581行。README:683-694「元のデザインとの違い」が参照する元プロトタイプ
git show '359e30c^:project/Design Options.dc.html'                # 187行
git show '359e30c^:project/uploads/4f-drink-status-demo-v3.html'  # 1388行
```

## 文脈が失われた範囲（人に聞くべき事項）

- **本番URLがリポジトリのどこにも無い。** 全文検索しても workers.dev サブドメインもカスタムドメインも出てこない（外部 URL は Google Fonts、FCM のテスト定数、GitHub リポジトリ URL のみ）。worker 名は `yonf-drink-status`（`wrangler.toml:1`）だが account subdomain が不明。**「デプロイ後の実機確認」（README:518-528）・`npm run announce`（SITE_URL 必須）・通知の動作確認は、URL を人に聞くまで実行できない。**
- **コミット本文が繰り返し言及する Playwright / E2E 検証がリポジトリに存在しない**（package.json にも .github/ にも記述なし）。都度手で書いて回していたと見られ、その手順・検証観点は残っていない。回帰を守っているのは vitest の150件だけ。
- **利用者からの未反映の要望を記録する場所がリポジトリ内に無い。** 反映済み3件は `FeedbackBox.tsx` にあるが、未反映のものは本番 D1 のご意見本文としてのみ存在し `npm run feedback` を叩かないと読めない。GitHub Issue も0件。したがって「次に何を作る約束をしていたか」はリポジトリからは一件も判定できない。
- **UI/UX 監査（2026-08）の原文が無い。** README とコミット本文に要約が残るだけで、誰がいつどの範囲を見たのか、未対応の指摘が残っているのかは不明。
- **「デモ」バッジを外す判断（＝パイロット終了の定義）**が誰の・どの条件の判断だったか。
- **本番の運用実態**。実際の利用者数、購読者数（30件上限に達しているか）、ラウンジの実際の開放曜日。
- `wrangler.toml` にコミット済みの `database_id` / `account_id` が指す環境の位置づけ（本番専用か、ステージングがあるか）。
