# E2E テスト実行結果: US-201（ウェブサイトのメモ）

- 実行日時: 2026-08-17
- 対象: `tests/e2e/notes.spec.ts`
- 設計書: `docs/e2e/e2e-US-201.md`
- ランナー: Playwright（chromium, 1 worker, `testDir: ./tests/e2e`, `testIdAttribute: 'data-test'`）
- 実行コマンド: `npx playwright test notes.spec.ts --reporter=list`

## 1. 実行環境

| 項目 | 内容 |
| --- | --- |
| アプリ | umami 3.2.0（`npm run dev` / Next.js 16.2.6 Turbopack, `http://localhost:3000`） |
| DB | PostgreSQL 15（docker, `localhost:55432`, DB=umami, migrate 済み・admin ユーザ有） |
| 認証 | admin / umami（`user_id=41e2b680-648e-4b09-bcd7-3e2b10c06264`） |
| Web サーバ | 既存起動サーバを利用（`PLAYWRIGHT_SKIP_WEB_SERVER=1`） |

### セットアップ上の注意（実装欠陥ではない環境要因）

- 初回実行時、全 8 テストが `/api/auth/login` の HTTP 500 で失敗した。
  原因は Prisma クライアント未生成（`@/generated/prisma/client` が解決不可）。
  `prisma generate`（`src/generated/prisma` を生成）後にサーバ再起動で解消。
  ※ 実装ソースは変更していない。ビルド生成物の準備不足による環境要因。

## 2. 最終実行結果（サマリ）

**8 passed / 0 failed**（ウォーム実行）。全受入条件 AC-1〜AC-9 を充足。

```
✓ AC-1/AC-2: enter, save and persist notes on the settings detail page (6.2s)
✓ AC-3: the list shows notes for a website that has them (3.5s)
✓ AC-4: the list shows no notes cell for a website without notes (2.2s)
✓ AC-5: a notes value at the 500-character limit can be saved (4.7s)
✓ AC-6: a notes value over 500 characters is rejected (UI error and server 400) (4.4s)
✓ AC-7: a user without update permission cannot change notes (server 401) (1.3s)
✓ AC-9: clearing notes returns the website to the unset state (6.1s)
✓ AC-8: a legacy website without notes keeps working (list, detail, rename) (6.5s)
8 passed (40.7s)
```

## 3. 受入条件ごとの合否（対応表）

| AC | シナリオ（test 名） | 主な確認 | 判定 |
| --- | --- | --- | --- |
| AC-1 | AC-1/AC-2: enter, save and persist notes | 詳細画面でメモ入力→保存が成功 | ✅ Pass |
| AC-2 | AC-1/AC-2: enter, save and persist notes | 再読込後もメモが保持される | ✅ Pass |
| AC-3 | AC-3: the list shows notes | 一覧行に `website-notes` が本文込みで表示 | ✅ Pass |
| AC-4 | AC-4: the list shows no notes cell | メモなし行に `website-notes` が無い | ✅ Pass |
| AC-5 | AC-5: 500-character limit can be saved | 500 文字保存成功・エラー無し | ✅ Pass |
| AC-6 | AC-6: over 500 characters is rejected | UI エラー文言表示 + サーバ 400 | ✅ Pass |
| AC-7 | AC-7: without update permission (401) | view-only ユーザの更新が 401・値不変 | ✅ Pass |
| AC-8 | AC-8: legacy website keeps working | 一覧/詳細/リネームが従来どおり | ✅ Pass |
| AC-9 | AC-9: clearing notes | 空保存後に一覧で非表示 | ✅ Pass |

充足率: **9 / 9（100%）**

## 4. 検出した欠陥

- 実装に起因する機能欠陥: **なし**（AC-1〜AC-9 全て充足）。

## 5. 失敗の切り分け（初回フル実行での 2 件）

ウォーム実行では全件 Pass だが、初回フル実行（コールド）で 2 件が失敗した。
いずれも実装欠陥ではなく、初回コンパイル遅延に起因するフレーキーと確認した。

| test | 初回フル実行 | 単独再実行 | 判定 | 原因 |
| --- | --- | --- | --- | --- |
| AC-1/AC-2 | ✘ Test timeout 30000ms | ✓ Pass (6.4s) | フレーキー | `/settings/websites/[id]` 初回 Turbopack コンパイル遅延で 30s 超過。ウォーム後 6s で成功 |
| AC-3 | ✘ `website-notes` not found (5s) | ✓ Pass (3.6s) | フレーキー | 先行テストのタイムアウト直後で一覧描画待ちが 5s 以内に収まらず。ウォーム後は安定して表示 |

### 安定化に関する所見（テストエンジニア観点・実装変更は不要）

- 初回コンパイルの重い Next.js/Turbopack 環境では、`webServer` を事前ウォームアップ
  （主要ルートへ 1 回 GET）してから実行すると、初回コールドのタイムアウトを回避できる。
- もしくは詳細ページ系テストのタイムアウトを引き上げる、または CI の
  `retries`（本 config は CI 時 2）に委ねることで隠蔽ではなくコールドスタート起因の
  ブレを吸収できる。恒久対策は「初回ウォームアップ」を推奨。

## 6. 再現手順

```powershell
# 1. DB（起動済みを利用 / なければ docker compose up -d db）
# 2. Prisma クライアント生成（未生成の場合のみ）
$env:DATABASE_URL="postgresql://umami:umami@localhost:55432/umami"
npx prisma generate

# 3. dev サーバ起動
$env:APP_SECRET="<任意のランダム文字列>"; npm run dev

# 4. E2E 実行（既存サーバ利用）
$env:PLAYWRIGHT_SKIP_WEB_SERVER="1"
npx playwright test notes.spec.ts --reporter=list
```
