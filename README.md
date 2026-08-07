# 4Fドリンク速報

弘済ビル4Fラウンジのドリンクマシンの状態を、そこにいる人の投稿から推定して表示する掲示板です。

「コーヒー、まだある?」に答えるために4階まで上がらなくて済むように——という一点のためのアプリで、
投稿は**ログイン不要・2タップ**、集計は**利用者ごとの最新投稿を1票**として行います。

Vite + React + TypeScript のフロントエンドと、Cloudflare Workers + D1 のバックエンドで動作します。

---

## 動かす

```bash
npm install

# ① D1 データベースを作り、出力された database_id を wrangler.toml に書く
npx wrangler d1 create drink-status

# ② スキーマを流す（ローカル）
npm run db:migrate:local

# ③ 開発用のサンプル投稿を入れる（任意）
npm run db:seed:local
```

開発サーバーは2通りあります。

| コマンド | 用途 |
| --- | --- |
| `npm run dev` | Vite の HMR で UI を作り込むとき。`/api` は `wrangler dev` にプロキシされるので、**別ターミナルで `npm run dev:worker` も起動**してください |
| `npm run dev:worker` | Worker と D1 をローカルで動かす（`http://localhost:8787`）。`npm run build` 済みなら本番と同じ構成で通しで確認できます |

その他:

```bash
npm run typecheck   # アプリと Worker の両方を型チェック
npm test            # 集計ロジックのユニットテスト
npm run build       # 型チェック → dist/client へビルド
```

## デプロイ

初回は次の1本で完了します（D1 の作成 → `wrangler.toml` への ID 書き込み → スキーマ適用 →
`SESSION_SECRET` の生成と登録 → ビルド → デプロイ）。何度実行しても同じ状態に収束します。

```bash
npx wrangler login          # ブラウザが開きます。ヘッドレス環境では代わりに
                            # CLOUDFLARE_API_TOKEN を設定してください
./scripts/setup-cloudflare.sh
```

2回目以降、コードだけを更新する場合は次で十分です。

```bash
npm run deploy
```

手動で行う場合は以下と同等です。

```bash
npx wrangler d1 create drink-status      # 出力された database_id を wrangler.toml に記入
npm run db:migrate:remote
npx wrangler secret put SESSION_SECRET   # 匿名IDクッキーの署名鍵（必須）
npm run deploy
```

`SESSION_SECRET` を設定しないと開発用の既定値が使われ、クッキーの署名を誰でも偽造できます。
本番では必ず設定してください。セットアップスクリプトは未設定の場合のみ、ランダムな32バイトを
生成して登録します。

### CI やヘッドレス環境からデプロイする場合

`wrangler login` は対話的な OAuth なので使えません。API トークンを環境変数で渡してください。

```bash
export CLOUDFLARE_API_TOKEN=...   # 履歴に残さないよう注意
./scripts/setup-cloudflare.sh
```

トークンに必要な権限（Cloudflare ダッシュボード → My Profile → API Tokens → Create Token →
Create Custom Token）:

| 種別 | 権限 | レベル |
| --- | --- | --- |
| Account | Workers Scripts | Edit |
| Account | D1 | Edit |
| Account | Account Settings | Read |

ネットワークが制限された環境では、`api.cloudflare.com` への外向き通信を許可する必要があります。

## つくり

```
index.html            エントリ
src/                  React クライアント
  App.tsx             画面の組み立て
  components/         各セクション（MachineIllustration がマシンの絵）
  hooks/              useDrinkStatus — 取得・自動更新・楽観的投稿・取り消し
  lib/                API クライアントと配色
shared/               クライアントと Worker が共有する純粋ロジック
  domain.ts           対象・状態・Report 型（API のバリデーションもここが基準）
  aggregate.ts        集計ルール本体
  drinks.ts           レシピと作成可否
  config.ts           集計ウィンドウなどの定数
worker/               Cloudflare Worker
  index.ts            ルーティング
  identity.ts         匿名端末IDの発行と検証
  store.ts            D1 アクセス
migrations/           D1 スキーマ
HANDOFF.md            元のデザイン受け渡し手順
chats/, project/      Claude Design から書き出したデザイン一式（参照用）
```

## 集計ルール

`shared/aggregate.ts` に実装、`shared/aggregate.test.ts` に全ルールのテストがあります。

1. **過去30分の投稿だけ**を対象にします。
2. **「補充された」でリセット** — 補充より前の投稿は、いまの状態の証拠にはなりません。
3. **1人1票** — 同じ人の投稿は最新のものだけを数えます。
4. **新しい投稿ほど重い** — 10分以内は1.0、20分以内は0.7、30分以内は0.4。
   25分前の目撃談が、直近2件をひっくり返さないようにするためです。
5. **「作れない」が10分以内に2件以上あれば無条件で不可** — 空だという報告は、
   空でないという報告より重く扱います。ただし1件だけでは多数派を覆しません。

確からしさは投稿者数・一致率・鮮度の3つで決まります。

| | 条件 |
| --- | --- |
| 高 | 3人以上 ／ 一致率75%以上 ／ 最終観測10分以内 |
| 中 | 2人以上 ／ 一致率60%以上 ／ 最終観測20分以内 |
| 低 | 上記以外 |

材料の推定残量は投稿の種類に対応します（取れた 70% ／ 残り少なめ 30% ／ 作れない 0% ／ 補充された 100%）。
対象の投稿が30分以内に1件もない場合は、画面が空にならないよう既定値を表示します。

## 利用者の識別

ログインはありません。初回アクセス時に Worker が端末ごとのランダムなIDを発行し、
**HMAC-SHA256 で署名した httpOnly クッキー**に入れて返します。この署名があるため、
クッキーを書き換えて他人になりすましたり、票を水増ししたりはできません
（署名が合わないIDは破棄され、新しいIDが発行されます）。

表示名は初回投稿時に「利用者A」「利用者B」…と自動で割り当てられ、自分の投稿だけは
「利用者（あなた）」と表示されます。個人を特定する情報は保存しません。

Cloudflare Access に切り替える場合、識別は `worker/identity.ts` の `resolveIdentity` に
閉じているので、そこで検証済みJWTを読むように変えれば済みます。

## API

| | |
| --- | --- |
| `GET /api/reports` | 直近24時間の投稿（最大200件）と、呼び出し元のIDおよびサーバー時刻 |
| `POST /api/reports` | 投稿する。本文は `{ subject, action }` |
| `DELETE /api/reports/:id` | 取り消す。**自分の投稿**を、**取り消し可能時間内**に限る |

投稿と取り消しは更新後の一覧も返すので、クライアントは往復1回で描画し直せます。
不正な `subject` / `action` は400、1分あたり20件を超える投稿は429を返します。

## 元のデザインとの違い

`project/4F Drink Status.dc.html` のプロトタイプを実装したものです。見た目は踏襲していますが、
以下は意図的に変えています。

- **保存先** — localStorage から D1 へ。投稿がラウンジ全体で共有されるようになりました。
- **投稿者** — 固定のダミーから、署名付き匿名IDへ。
- **「このアプリについて」の文面** — Azure 前提の記述を、実際の構成（Cloudflare）に合わせました。
- **デザインツールのツマミ** — マシンの絵の表示と集計ウィンドウは `shared/config.ts` の定数に固定。
  ヘッダーの自動更新 ON/OFF だけは操作できるままにしています。

ヘッダーの「デモ」バッジは `src/components/Header.tsx` の `BADGE` を `null` にすると消えます。
