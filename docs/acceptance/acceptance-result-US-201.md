# US-201 受入検証結果（実機確認）

## 検証環境

- baseUrl: `http://localhost:3000`
- 実施日時: 2026-08-13（環境の `current_datetime` 基準）
- ブラウザ: Playwright MCP（Chromium, headless）
- ログインユーザー: `admin` / `umami`（`docker-compose` の初期管理者アカウント）
- 実行中コンテナ:
  - `umami-sample-proposed-copilot-21-umami-1`（アプリ）… `docker exec` で確認したところ `/app/package.json` の `version` は `3.2.0`。イメージは `docker-compose` 定義の `ghcr.io/umami-software/umami:latest`。
  - `umami-sample-proposed-copilot-21-db-1`（PostgreSQL 15）

## 重要な前提（検証中に判明した事実）

実行中のアプリコンテナに対して `docker exec` で `/app/prisma/schema.prisma` を確認したところ、
**`model Website` に `notes` フィールドが存在しなかった**。同様に DB コンテナに対して
`psql -c "\d website"` を実行したところ、`website` テーブルに `notes` 列は存在しなかった
（列: `website_id, name, domain, reset_at, user_id, created_at, updated_at, deleted_at, created_by, team_id, recorder_enabled, replay_config` のみ）。

一方、ローカルのソースツリー（`prisma/schema.prisma` / `prisma/migrations/21_add_website_notes/migration.sql` /
`src/app/api/websites/[websiteId]/route.ts` / `src/app/(main)/websites/[websiteId]/settings/WebsiteEditForm.tsx` /
`src/app/(main)/websites/WebsitesTable.tsx` 等）には notes 関連の実装が存在する。

つまり、**「起動済みでハーネスが疎通確認したアプリ」は公式配布イメージ（`umami:3.2.0`）そのままで動作しており、
本リポジトリのソースコード上の変更（メモ機能の実装）を反映していない**。本検証は指示に従い
「実際に動いているアプリケーションを操作して」判定するため、以下の結果は全てこの実行中インスタンスに対する
実機確認の結果である（ソースコードを読んだ限りでの推測による `satisfied` 判定は行っていない）。

## AC 判定結果一覧

| ID | 受入条件（要約） | verdict | 期待 | 実際 |
|----|----------------|---------|------|------|
| AC-1 | Website に notes 列＋マイグレーション、既存データ非破壊 | **not-satisfied** | 実DBの `website` テーブルに `notes` 列がある | 実DB・実行中コンテナのschemaいずれにも `notes` 列/フィールドが存在しない |
| AC-2 | 設定画面でメモ入力・保存・再読込後も表示 | **not-satisfied** | 設定画面に Notes 入力欄がある | 設定画面には Website ID / Name / Domain のみ、Notes 欄は存在しない |
| AC-3 | 更新API がメモを受理しレスポンスに含む、他項目を壊さない | **not-satisfied** | POST レスポンスに `notes` を含む | レスポンスに `notes` キー自体が存在しない（200は返るが保存されない） |
| AC-4 | 500字超は400エラー、500字ちょうどは保存可 | **not-satisfied** | 501文字送信で400系エラー | 501文字でも200 OK、エラーなし（notesが処理されていないため） |
| AC-5 | 一覧でメモ確認可、未設定は非表示 | **not-satisfied** | 一覧に Notes 列がありメモが見える | 一覧テーブルは Name/Domain/Created の3列のみ、Notes列自体が無い |
| AC-6 | 権限のないユーザーはメモ更新不可（401/403） | **blocked** | 権限なしユーザーのnotes更新が拒否される | notes機能自体が存在せず検証対象を構成できない |
| AC-7 | 既存ユニット/E2Eテストが引き続き合格（デグレなし） | **blocked** | `pnpm test` / 既存E2Eが green | 本計測工程の制約でテストランナー実行が禁止されており確認不能 |

## 再現手順・観測内容の詳細

### AC-1: 永続化層（DB）確認

```
docker exec umami-sample-proposed-copilot-21-umami-1 sh -c "grep -n notes /app/prisma/schema.prisma"
→ ヒットなし（model Website / model WebsiteEvent の行のみ表示され notes は出てこない）

docker exec umami-sample-proposed-copilot-21-db-1 psql -U umami -d umami -c "\d website"
→ Table "public.website" の列一覧に notes なし:
  website_id, name, domain, reset_at, user_id, created_at, updated_at,
  deleted_at, created_by, team_id, recorder_enabled, replay_config
```

ローカルソースの `prisma/schema.prisma`（69-71行付近）には
`notes String? @db.VarChar(500)` が存在し、`prisma/migrations/21_add_website_notes/migration.sql` に
`ALTER TABLE "website" ADD COLUMN "notes" VARCHAR(500);` が存在することも確認したが、
**実行中のアプリ・DBには反映されていない**ため、実機での判定は not-satisfied とした。

### AC-2: 設定画面での入力・保存・再読込

1. `http://localhost:3000/login` で `admin` / `umami` でログイン。
2. 「Add website」で `Test Site` / `test-site.example.com` を作成。
3. `/websites/{id}/settings` に遷移し `browser_snapshot` で確認。

観測結果（抜粋）:
```
- Website ID: textbox "047cdc8c-..."
- Name: textbox "Test Site"
- Domain: textbox "test-site.example.com"
- button "Save" [disabled]
```
Notes ラベル・入力欄は表示されない。`document.body.innerHTML.includes('input-notes')` を
`browser_evaluate` で実行した結果も `false`。

### AC-3・AC-4: 更新APIの挙動

ログイン後の `localStorage.getItem('umami.auth')` のトークンを使い、`browser_evaluate` から
`fetch` で API を直接呼び出して確認（画面操作でNotes欄自体が無いため、API単体で検証）。

```js
// 通常のnotes送信
POST /api/websites/{id}  body: { name, domain, notes: "hello world notes" }
→ 200 OK, レスポンス body に notes キーなし

// 501文字のnotes送信
POST /api/websites/{id}  body: { name, domain, notes: "a".repeat(501) }
→ 200 OK（エラーなし）, レスポンス body に notes キーなし

// 直後の GET
GET /api/websites/{id}
→ 200 OK, レスポンス body に notes キーなし（保存されていないことを確認）
```

### AC-5: 一覧表示

`/websites` 一覧ページを `browser_snapshot` および `browser_take_screenshot`（フルページ）で確認。
テーブルヘッダーは `Name / Domain / Created` の3列のみで `Notes` 列が存在しない。
一覧取得API（`GET /api/users/{userId}/websites`）のレスポンスをネットワークログから確認したところ、
返却されるオブジェクトに `notes` フィールド自体が含まれていなかった:

```json
{"data":[{"id":"047cdc8c-...","name":"Test Site","domain":"test-site.example.com","resetAt":null,"userId":"...","teamId":null,"createdBy":"...","createdAt":"...","updatedAt":"...","deletedAt":null,"recorderEnabled":false,"replayConfig":null,"user":{...},"shareId":null}],"count":1,...}
```

### AC-6: 権限チェック（blocked の理由）

AC-1〜AC-5 の結果から、実行中アプリには notes という更新対象自体が存在しない
（API がフィールドを受理・返却せず、DB にも列が無い）ことが確認できた。
このため「権限のないユーザーがメモを更新しようとした場合に拒否されるか」という
検証対象そのものを実機上で構成することができず、判定に到達できなかった（blocked）。
なお、既存の `canUpdateWebsite` に基づく Name/Domain の更新可否自体は本検証のスコープ外
（AC-6 は notes 固有の認可を問うもの）。

### AC-7: 既存テストの回帰（blocked の理由）

本計測工程の指示（`npx playwright test` 等のテストランナーは使用しない、Playwright MCP による
実機操作のみで判定する）に従い、`pnpm test` および `pnpm test:e2e`（`tests/e2e/website.spec.ts` 等）を
実行していない。また `docs/e2e/results` の既存実行結果も本ACの根拠として採用しない方針のため、
ブラウザ操作のみでは「既存テストスイート全体がデグレしていないか」を直接検証する手段がなく、
判定に到達できなかった（blocked）。

## 判定に迷った点・保守的に倒した理由

- ローカルソースコードには notes 機能の実装（schema／マイグレーション／API／UI）が一通り揃っているように見えたが、
  「計測は実際に動いているアプリを操作して行う」という本工程の方針に厳密に従い、ソースコードの内容を根拠に
  `satisfied` とすることはしなかった。`docker exec` で実行中コンテナ自体のファイル・DBスキーマを直接確認し、
  実行中インスタンスには notes 実装が一切反映されていない（公式配布イメージそのまま）ことを実証した上で
  全て `not-satisfied` / `blocked` とした。
- AC-6・AC-7 は「検証対象の機能／実行手段が実機上に存在しない・使用不可」という理由で `not-satisfied` ではなく
  `blocked` とした（何かを試して「期待と異なる結果」を得たわけではなく、検証行為自体が成立しなかったため）。
