# US-201 E2Eテスト実行結果

- 実行日時: 2026-08-20
- 対象: `tests/e2e/website-notes-us201.spec.ts`
- 実行コマンド:
  - `npm run test:e2e -- website-notes-us201.spec.ts`
  - `npm run build-db-client` 実行後に再度 `npm run test:e2e -- website-notes-us201.spec.ts`

## 総合結果

**失敗（環境起因でテスト継続不可）**

- 4件中: 1件失敗 / 3件未実行
- 失敗起点: `loginViaApi` で `/api/auth/login` が `500` を返却し、最初のシナリオ開始前に停止

## 受入条件 合否対応表

| 受入条件 | 対応シナリオ | 判定 | 根拠 |
|---|---|---|---|
| AC-01 設定画面での保存 | E2E-US201-01 | NG | 認証API (`/api/auth/login`) が 500 となりシナリオ開始不可 |
| AC-02 文字数上限 | E2E-US201-02 | NG | 前提の初回シナリオ失敗でテストラン停止（未実行） |
| AC-03 一覧表示（notes あり） | E2E-US201-01 | NG | 認証API 500 により検証ステップ到達不可 |
| AC-04 一覧表示（notes なし） | E2E-US201-01 | NG | 認証API 500 により検証ステップ到達不可 |
| AC-05 権限制御 | E2E-US201-03 | NG | 前提の初回シナリオ失敗でテストラン停止（未実行） |
| AC-06 既存データ互換 | E2E-US201-04 | NG | 前提の初回シナリオ失敗でテストラン停止（未実行） |

## 検出した欠陥（切り分け）

| ID | 区分 | 事象 | 影響 | 原因切り分け |
|---|---|---|---|---|
| DEF-US201-001 | 実行環境 | `npm run build-db-client` が失敗 | Prisma Client未生成のまま | `DATABASE_URL` 未設定により `prisma generate` が `PrismaConfigEnvError: Cannot resolve environment variable: DATABASE_URL` で失敗 |
| DEF-US201-002 | 実行環境 | Webサーバ起動時に `@/generated/prisma/client` の解決失敗 | `/api/auth/login` が 500 となり E2E 開始不可 | DEF-US201-001により `src/generated/prisma/client` が存在せず、Next.js コンパイルで module not found |

## 主要エラー抜粋

```text
Failed to load config file ... PrismaConfigEnvError: Cannot resolve environment variable: DATABASE_URL.
Module not found: Can't resolve '@/generated/prisma/client'
Expected: 200
Received: 500 (POST /api/auth/login)
```
