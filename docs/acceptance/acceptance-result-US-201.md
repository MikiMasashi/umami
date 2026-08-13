# US-201 受入条件充足率 検証結果

## 検証環境

- baseUrl: `http://localhost:3000`
- 実施日時: 2026-08-13 (JST) 11:10 頃〜
- ブラウザ: Chromium（`@playwright/test` の `chromium.launch()` により実機起動。
  当初指示された `mcp__playwright__*`（Playwright MCP）ツールが本セッションの利用可能ツール一覧に
  現れなかったため（`harness/mcp/playwright.json` に定義はあるが、実際に呼び出し可能な関数として
  公開されていなかった）、同一の Playwright エンジンをライブラリとして直接呼び出し、実ブラウザ
  （Chromium, headless）でログイン画面への実操作・スクリーンショット取得を行った。
  `npx playwright test` 等のテストランナー、および開発チームが書いた `tests/e2e/*.spec.ts` は
  一切実行していない）。
- API確認: `curl` による直接リクエスト（ブラウザで到達できない箇所の裏付けとして使用）
- DB確認: `docker exec` + `psql`、および `npx prisma migrate deploy`（AC-1 のスキーマ／既存データ確認）

## 重大な環境上の制約（測定に影響）

検証対象アプリ（`pnpm dev` で起動済みの Next.js サーバー、プロセス起動時刻 2026-08-13 11:08 頃）は、
`GET /` `GET /api/heartbeat` 等の静的応答は 200 を返すが、DB接続を要する API
（`POST /api/auth/login`、`GET /api/websites` など）はすべて **HTTP 500** を返す。
レスポンス本文には Next.js のエラーページとして次のスタックが含まれていた。

```
"message":"DATABASE_URL is not set."
"stack":"Error: DATABASE_URL is not set.\n    at getClient (...\\.next\\dev\\server\\chunks\\[root-of-the-server]__0hta884._.js:2774:15)\n ..."
```

`docker ps` で確認できる稼働中の PostgreSQL コンテナは `umami-sample-existing-copilot-21-db-1`
（別バリアント「existing」用と思われる命名、ポート `5433->5432`）のみであり、起動済みサーバーの
プロセス環境変数には `DATABASE_URL` が設定されていない状態だった（複数回・時間を空けてリトライしても
再現）。

この検証は「実装・テスト・設定・環境を変更しない」計測工程であり、かつ「自分でサーバを起動しない」
という制約があるため、この環境不備を修正することはできない（書き込み許可も `docs/acceptance` 配下のみ）。
そのため、**ログイン・API呼び出し・認証後の画面遷移を要する AC-2〜AC-6、および AC-7 の E2E 相当部分は
すべて `blocked`** とした。AC-1 のみ、ファイル・DB・マイグレーション実行という「サーバー越しのHTTPを
介さない」手段で直接確認できたため判定できた。AC-7 のユニットテスト部分（`pnpm test`）はDB接続を
必要としない（モック使用）ため実行・確認できた。

## AC 判定表

| ID | 受入条件（要約） | 判定 | 期待 | 実際 |
|----|------------------|------|------|------|
| AC-1 | notes 列の永続化＋マイグレーション＋既存データ非破壊 | **satisfied** | Website に notes(nullable, max500) 列があり、マイグレーションがあり、既存データが壊れない | schema.prisma:70 に `notes String? @db.VarChar(500)`。`prisma/migrations/21_add_website_notes/migration.sql` に `ALTER TABLE "website" ADD COLUMN "notes" VARCHAR(500);`。対象DBに対し `prisma migrate deploy` 実行→ `No pending migrations to apply.`（適用済み）。psql で既存5件の website レコードを確認→ notes 列はすべて NULL/空のまま、他カラムも保持されている |
| AC-2 | 設定画面でメモ入力→保存→リロードでも表示 | **blocked** | ログイン後、メモ欄に入力・保存・リロードで保持を確認 | ログイン自体が失敗（画面に `Unexpected token '<', "<!DOCTYPE "... is not valid JSON` 表示、`POST /api/auth/login` は HTTP 500）。設定画面に到達できず未確認 |
| AC-3 | 更新API がメモを受理し他項目を壊さない | **blocked** | notes 込みの POST が成功し、レスポンスに notes/name/domain が含まれる | 認証トークンが取得できない（ログインAPIが500）ため、認証必須の更新APIを呼べず未確認 |
| AC-4 | 501文字は400系エラー、500文字ちょうどは保存可 | **blocked** | 501文字は拒否・500文字は保存可、UIでもエラーが分かる | 認証できないためAPI/UIいずれも試行不可、未確認 |
| AC-5 | 一覧でメモ確認、未設定は非表示（null/undefinedの生表示なし） | **blocked** | 一覧にメモが表示され、未設定は空欄 | ログイン不可のため一覧画面（認証必須）に到達できず未確認 |
| AC-6 | 権限のないユーザーはメモ更新不可（401/403） | **blocked** | 権限のないユーザーの更新試行が401/403で拒否される | 管理者ですらログインできない（500）ため、権限なしユーザーの作成・ログイン自体ができず、未認証時も401/403ではなく500が先に発生し切り分け不能 |
| AC-7 | 既存ユニットテスト・E2Eがデグレなく合格 | **blocked** | ユニットテスト・E2E相当の既存機能がともに合格 | `pnpm test` は 22ファイル/102件すべて成功（ユニットテスト部分は確認できた）。ただしE2E相当の実機回帰確認（ログイン・一覧・設定画面操作）はサーバーのDB接続不可により一切実行できず、全体としては判定不能（`blocked`） |

## not-satisfied / blocked の再現手順と観測内容

### AC-2, AC-5（画面到達不可）
1. Chromium ブラウザで `http://localhost:3000/login` を開く。
2. Username: `admin` / Password: `umami` を入力し「Login」ボタンをクリック。
3. 期待: `/dashboard` 等へ遷移。
4. 実際: 画面上部に赤い警告バナー `Unexpected token '<', "<!DOCTYPE "... is not valid JSON` が表示され、
   ログイン画面のまま遷移しない。スクリーンショット: `docs/acceptance/ac2-login-failure.png`。
5. 直接API確認:
   ```
   curl -s -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"umami"}' -i
   ```
   → `HTTP/1.1 500 Internal Server Error`、本文に `"message":"DATABASE_URL is not set."` を含む Next.js
   エラーページ HTML が返る（3回リトライ、時間を空けても再現性あり）。
6. `curl http://localhost:3000/api/websites` も同様に 500。

### AC-3, AC-4, AC-6（認証必須API）
- 上記ログイン失敗によりトークンを取得できず、`POST /api/websites/{id}` の name/domain/notes 同時更新、
  501/500文字境界確認、権限なしユーザーでの401/403確認のいずれも実行不能だった。

### AC-7（ユニットテストは合格、E2E相当は未確認）
```
pnpm test
...
 Test Files  22 passed (22)
      Tests  102 passed (102)
```
ユニットテスト（`src/tests/website-notes-route.test.ts`、`src/tests/website-create-notes-route.test.ts`、
`src/component-tests/WebsiteSettingsPage.test.tsx` 等含む）はすべて成功した。
ただし、これらは開発チームが書いたテストであり、本検証プロセスの方針
（「開発チームのテスト結果を受入根拠にしない」「実機で自分で確かめる」）に照らすと、AC-7 の
「E2E（`tests/e2e/website.spec.ts` 等）が引き続き合格する」という部分は実機ブラウザでの
回帰確認が必須と判断した。しかし環境の DB 接続不備によりログインからして失敗するため、
実機での回帰確認そのものが実行不能であり、AC-7 全体を `blocked` とした。

## 判定に迷った点・保守的に倒した理由

- AC-1 は本来「マイグレーションファイルの有無」と「`pnpm update-db` が通ること」で判定してよいと
  `stories/US-201/acceptance-criteria.md` の計測メモに明記されているため、HTTP経由のUI操作を介さず
  ファイル閲覧・DB直接確認・`prisma migrate deploy` 実行で `satisfied` と判定した。他のACはいずれも
  UI/API操作を伴う確認が前提のため、環境不備がある以上 `satisfied` と推測することはせず、すべて
  `blocked` とした。
- AC-6 は「未認証/権限外リクエストが401/403相当を返すか」を問うが、実際に観測したのは500
  （DB未接続起因）だった。500 は 401/403 の代わりにはならず、かつ実装の欠陥と断定できる状態でも
  ないため（環境要因の可能性が高い）、`satisfied`/`not-satisfied` いずれにも倒さず `blocked` とした。
- AC-7 についてはユニットテスト（`pnpm test`）は実行・確認できたが、指示の禁止事項
  「開発チームのE2Eテストを実行して合否の代わりにしない」「`docs/e2e/results` の実行結果を根拠に
  satisfied と判定しない」を踏まえ、E2E相当は実機ブラウザで自分で確認する方針を貫いた。しかし
  環境不備により実行できなかったため、部分的な成功（ユニットテスト）のみをもって `satisfied` とは
  せず、保守的に `blocked` とした。
- Playwright MCP ツール（`mcp__playwright__*`）が本セッションの利用可能ツールとして提供されて
  いなかったため、同じ Playwright エンジンをライブラリとして直接呼び出し、実際に Chromium を起動して
  ログイン画面を操作・スクリーンショット取得する方式で代替した。これは「テストランナー
  （`npx playwright test`）の実行結果を根拠にする」ことには該当しない（テストコードは一切実行して
  いない、単に実ブラウザを1操作ずつ手動相当で動かしただけ）。
