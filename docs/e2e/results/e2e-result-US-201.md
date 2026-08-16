# E2E 実行結果: US-201 ウェブサイトへのメモ（notes）機能

対象プロダクト: **umami** / 担当: test-engineer
入力: `tests/e2e/api-website-notes.spec.ts`, `tests/e2e/notes-website.spec.ts`, `docs/e2e/e2e-US-201.md`

本書は US-201「登録済みウェブサイトへの自由記述メモ（notes）」の E2E テストを実機（実 Next.js サーバ + 実 PostgreSQL）で実行した結果と、受入条件ごとの合否・検出した欠陥を記録する。**実装・テストコードは変更していない（結果の記録のみ）。**

---

## 1. 実行サマリ

| 項目 | 値 |
| --- | --- |
| 実行日時 | 2026-08-16 |
| 対象 spec | `api-website-notes.spec.ts`（12 tests）, `notes-website.spec.ts`（7 tests） |
| 総テスト数 | **19** |
| 最終結果 | **19 passed / 0 failed**（全合格） |
| ランナー | Playwright（`@playwright/test` ^1.60.0） / Chromium |
| ベース URL | `http://localhost:3000`（`PLAYWRIGHT_SKIP_WEB_SERVER=1` で稼働中サーバへ実行） |

> 補足: 初回実行では UI spec の先頭 1 件（AC-1.1/1.2）が **タイムアウトで fail** したが、これは実装欠陥ではなく **開発サーバ（Turbopack）の初回コンパイル遅延**が原因。ルートをウォームアップ後に UI spec を再実行し **7/7 合格**を確認した（詳細は §4・§5）。切り分け結果として US-201 の全受入条件は充足。

---

## 2. 実行環境（再現手順）

E2E 実行のためのランタイム環境が未起動だったため、以下を用意して実行した（実装・テスト・受入条件ファイルは未変更）。

1. **DB 起動**: `docker compose up -d db`（`postgres:15-alpine` / ホスト `55432` / `umami/umami/umami`、健全性 healthy 確認）。
2. **接続設定**: リポジトリ直下に `.env`（gitignore 対象）を作成。
   `DATABASE_URL=postgresql://umami:umami@localhost:55432/umami`, `APP_SECRET=...`
3. **スキーマ適用**: `prisma generate` + `prisma migrate deploy`。
   US-201 のマイグレーション **`21_add_website_notes`** を含む全 21 マイグレーションが適用済み。
4. **既定ユーザ**: マイグレーションにより既定管理者 `admin`（id `41e2b680-648e-4b09-bcd7-3e2b10c06264`, role=admin）が存在。helpers.ts の期待値と一致。
5. **アプリ起動**: `pnpm dev`（Next.js 16 / Turbopack、`/api/heartbeat` が 200）。
6. **テスト実行**:
   ```
   PLAYWRIGHT_SKIP_WEB_SERVER=1 PLAYWRIGHT_BASE_URL=http://localhost:3000 \
     pnpm exec playwright test api-website-notes.spec.ts notes-website.spec.ts
   ```

---

## 3. 受入条件ごとの合否（トレーサビリティ対応表）

| AC | 内容 | シナリオ | 種別 | 結果 |
| --- | --- | --- | --- | --- |
| AC-1.1 | 入力・保存＋フィードバック | U1, A2 | UI + API | ✅ PASS |
| AC-1.2 | 再読み込みで保持 | U1, A3 | UI + API | ✅ PASS |
| AC-1.3 | 上書き保存 | U2, A2 | UI + API | ✅ PASS |
| AC-1.4 | 空→未設定（null） | U3, A7, A9 | UI + API | ✅ PASS |
| AC-2.1 | 500 文字は許可 | U4, A4 | UI + API | ✅ PASS |
| AC-2.2 | 501 文字は拒否（400 / クライアントブロック） | U5, A5 | UI + API | ✅ PASS |
| AC-2.3 | 境界=500（500可/501不可、トリム後判定） | A4, A5, A6 | API | ✅ PASS |
| AC-3.1 | 一覧でメモ確認可 | U6 | UI | ✅ PASS |
| AC-3.2 | 長文は省略表示（レイアウト非破壊） | U6 | UI | ✅ PASS |
| AC-3.3 | 未設定は一切表示しない | U7 | UI | ✅ PASS |
| AC-4.1 | 権限なしの更新は認可エラー（401） | A11 | API | ✅ PASS |
| AC-4.2 | サイト更新権限と同一ルール | A11 | API | ✅ PASS |
| AC-4.3 | 閲覧はサイト閲覧権限準拠（401） | A12 | API | ✅ PASS |
| AC-5.1 | 既存（未設定）サイトがエラーなく動作 | A1, U7 | API + UI | ✅ PASS |
| AC-5.2 | 未指定更新で notes 保持 | A10 | API | ✅ PASS |
| AC-5.3 | notes は nullable/optional | A1 | API | ✅ PASS |
| Q5 | トリム/空白のみは未設定 | U3, A6, A7, A8 | UI + API | ✅ PASS |
| Q6 | 改行可・一覧は1行省略 | U6 | UI | ✅ PASS |

**充足率: 18/18 受入条件（AC-1.x〜AC-5.x + Q5/Q6）すべて PASS。**

---

## 4. テストケース別の結果

### 4.1 API 契約 E2E — `api-website-notes.spec.ts`（12/12 PASS）

| # | テスト | AC | 結果 | 実行時間 |
| --- | --- | --- | --- | --- |
| A1 | AC-5.3 new website has notes = null | AC-5.1/5.3 | ✅ | 11.5s |
| A2 | AC-1.3 saves and overwrites notes | AC-1.1/1.3 | ✅ | 0.80s |
| A3 | AC-1.2 persisted notes returned by GET | AC-1.2 | ✅ | 0.30s |
| A4 | AC-2.1 accepts exactly 500 chars | AC-2.1/2.3 | ✅ | 0.26s |
| A5 | AC-2.2 rejects 501 chars with 400 | AC-2.2/2.3 | ✅ | 0.07s |
| A6 | AC-2.3 trims before length check | AC-2.3/Q5 | ✅ | 0.10s |
| A7 | AC-1.4 empty string stored as null | AC-1.4/Q5 | ✅ | 0.28s |
| A8 | Q5 whitespace-only stored as null | Q5 | ✅ | 0.60s |
| A9 | AC-1.4 explicit null unsets notes | AC-1.4 | ✅ | 0.26s |
| A10 | AC-5.2 omitting notes preserves value | AC-5.2 | ✅ | 0.43s |
| A11 | AC-4.1 update w/o permission → 401 | AC-4.1/4.2 | ✅ | 0.16s |
| A12 | AC-4.3 read w/o permission → 401 | AC-4.3 | ✅ | 0.10s |

### 4.2 UI E2E — `notes-website.spec.ts`（7/7 PASS、ウォームアップ後の再実行にて）

| # | テスト | AC | 結果 | 実行時間 |
| --- | --- | --- | --- | --- |
| U1 | AC-1.1/1.2 saves & persists after reload | AC-1.1/1.2 | ✅ | 10.3s |
| U2 | AC-1.3 overwrites existing notes | AC-1.3 | ✅ | 6.2s |
| U3 | AC-1.4 clearing notes saved as empty | AC-1.4/Q5 | ✅ | 8.7s |
| U4 | AC-2.1 accepts exactly 500 chars | AC-2.1 | ✅ | 7.4s |
| U5 | AC-2.2 blocks 501 chars, not persisted | AC-2.2 | ✅ | 9.1s |
| U6 | AC-3.1/3.2 truncated single-line note | AC-3.1/3.2/Q6 | ✅ | 6.8s |
| U7 | AC-3.3 nothing for website without notes | AC-3.3 | ✅ | 4.0s |

---

## 5. 検出した欠陥・不安定要因の切り分け

| ID | 事象 | 分類 | 原因 | 実装欠陥か | 対応 |
| --- | --- | --- | --- | --- | --- |
| OBS-1 | 初回実行時、UI U1（AC-1.1/1.2）が `page.goto` タイムアウト（`net::ERR_ABORTED` / 35s）で fail。serial モードのため後続 U2〜U7 は skip。 | テスト基盤（フレーキー） | 開発サーバ（Turbopack）の `/settings/websites/[id]` **初回オンデマンドコンパイル**が Playwright の 30s テストタイムアウトを超過。 | **いいえ**（実装の欠陥ではない） | 当該ルートをウォームアップ（HTTP 200 確認）後に UI spec を再実行 → **7/7 合格**。実装欠陥なしと確定。 |

### 検出された機能欠陥
**なし。** US-201 の全受入条件（AC-1.x〜AC-5.x、Q5/Q6）は API・UI 双方で充足を確認した。

### 参考: 安定性に関する所見（実装欠陥ではない / 記録のみ）
- OBS-1 は開発（`pnpm dev` / Turbopack）特有の初回コンパイル遅延であり、実装の不具合ではない。`next build` + `next start`（本番モード）での実行、初回ルートのウォームアップ、または UI テストの `test.setTimeout` 引き上げで回避可能。CI では本番ビルドまたはウォームアップ手順を推奨。

---

## 6. 制約の遵守確認

- [x] `stories/US-201/acceptance-criteria.md` は読み込んでいない。
- [x] `src` / `prisma` の実装・テストは変更していない（結果記録のみ）。
- [x] 受入条件ファイル・要件/設計ファイルは編集していない。
- [x] 追加ライブラリ・依存バージョン変更なし（既存 `@playwright/test` を使用）。
- [x] E2E 実行のためのランタイム（DB 起動・`.env`（gitignore 対象）・マイグレーション適用・dev サーバ起動）のみ用意。
