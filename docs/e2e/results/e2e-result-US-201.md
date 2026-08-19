# E2E実行結果 US-201

## 実行概要

| 項目 | 内容 |
| --- | --- |
| 実行日時 | 2026-08-19 |
| 対象 | `tests/e2e/website-notes.spec.ts` / `tests/e2e` 全体 |
| 実行環境 | Windows_NT / Chromium / Playwright |
| DB | PostgreSQL 15 (`localhost:55432`) |
| 主要環境変数 | `DATABASE_URL` はDocker ComposeのPostgreSQL (`localhost:55432`) を指定、`APP_SECRET=playwright-secret` |

## 実行コマンドと結果

| コマンド | 結果 | 補足 |
| --- | --- | --- |
| `pnpm test:e2e -- website-notes.spec.ts` | 失敗 | 初回実行。`DATABASE_URL is not set.` によりアプリ起動後の `/api/auth/login` がHTTP 500を返した。環境変数未設定が原因。 |
| `pnpm update-db` | 成功 | テストDBへ21件のPrismaマイグレーションを適用。 |
| `pnpm build-db` | 成功 | Prismaクライアントを生成。 |
| `pnpm check-db` | 成功 | DB接続、DBバージョン、マイグレーション状態を確認。 |
| `pnpm test:e2e -- website-notes.spec.ts` | 成功 | US-201の4シナリオすべて成功。`4 passed (41.3s)` |
| `pnpm test:e2e` | 失敗 | 全体では `14 passed`, `8 failed`, `16 did not run`。US-201の4シナリオは全体実行でもすべて成功。 |

## US-201 E2Eシナリオ結果

| ID | シナリオ | 結果 | 備考 |
| --- | --- | --- | --- |
| E2E-US-201-01 | Webサイト編集ページから500文字以下のメモを保存し、再読み込みする。 | 合格 | 単独実行・全体実行ともに成功。 |
| E2E-US-201-02 | メモがあるWebサイトにのみ一覧上の要約を表示する。 | 合格 | 単独実行・全体実行ともに成功。 |
| E2E-US-201-03 | UIと直接APIの両方で501文字のメモを拒否する。 | 合格 | 単独実行・全体実行ともに成功。 |
| E2E-US-201-04 | メモをクリアし、権限のない直接更新をブロックする。 | 合格 | 単独実行・全体実行ともに成功。 |

## 受入条件との対応結果

| 受け入れ条件 | 対応E2Eシナリオ | 合否 |
| --- | --- | --- |
| US-201-1 AC1 | E2E-US-201-01 | 合格 |
| US-201-1 AC2 | E2E-US-201-01 | 合格 |
| US-201-1 AC3 | E2E-US-201-02 | 合格 |
| US-201-1 AC4 | E2E-US-201-04 | 合格 |
| US-201-2 AC1 | E2E-US-201-02 | 合格 |
| US-201-2 AC2 | E2E-US-201-02 | 合格 |
| US-201-2 AC3 | E2E-US-201-02 | 合格 |
| US-201-3 AC1 | E2E-US-201-03 | 合格 |
| US-201-3 AC2 | E2E-US-201-01 | 合格 |
| US-201-3 AC3 | E2E-US-201-03 | 合格 |
| US-201-4 AC1 | E2E-US-201-04 | 合格 |
| US-201-4 AC2 | E2E-US-201-04 | 合格 |
| US-201-4 AC3 | E2E-US-201-01 | 合格 |

## 検出した欠陥・失敗の切り分け

### US-201

US-201対象シナリオの欠陥は検出されなかった。

### 実行環境

| ID | 事象 | 原因 | 影響 |
| --- | --- | --- | --- |
| ENV-001 | 初回のUS-201単独E2Eが4件失敗。`/api/auth/login` がHTTP 500を返した。 | `DATABASE_URL` 未設定によりアプリ側で `DATABASE_URL is not set.` が発生。 | テスト環境設定の問題。DB起動、マイグレーション、Prisma生成、環境変数設定後はUS-201単独E2Eが成功。 |

### US-201以外の既存E2E失敗

| ID | 失敗テスト | 事象 | 切り分け |
| --- | --- | --- | --- |
| E2E-EXISTING-001 | `tests/e2e/api-team.spec.ts` - `Team API tests creates a team` | ユーザー作成の期待HTTP 200に対してHTTP 400。 | 同一ユーザー名 `playwright1` を使う既存APIテストと並列実行時にデータ衝突している可能性が高い。US-201シナリオは独自データ名を使っており成功。 |
| E2E-EXISTING-002 | `tests/e2e/api-user.spec.ts` - `returns all users when admin access is used` | ユーザー一覧レスポンスに `password` プロパティが含まれず失敗。 | APIの現在レスポンス仕様と既存テスト期待値の不一致。US-201とは無関係。 |
| E2E-EXISTING-003 | `tests/e2e/login.spec.ts` - `logs user in with correct credentials and logs user out` | ログイン後URLが期待値 `/dashboard` ではなく `/`。 | 現在のログイン後遷移仕様と既存テスト期待値の不一致。US-201とは無関係。 |
| E2E-EXISTING-004 | `tests/e2e/login.spec.ts` - `shows validation for blank inputs or incorrect credentials` | `getByText(/Required/i)` が2要素に一致し strict mode violation。 | セレクタが複数エラー表示に対して一意でない既存テスト不備。US-201とは無関係。 |
| E2E-EXISTING-005 | `tests/e2e/user.spec.ts` - `adds a user` | `Create user` テキストが表示されず失敗。 | 既存UIテストの画面遷移または期待文言が現在UIと不一致。US-201とは無関係。 |
| E2E-EXISTING-006 | `tests/e2e/website.spec.ts` - `adds a website` | `button-website-add` を待機中にタイムアウト。 | 既存UIテストの前提データ、権限、またはセレクタが現在UIと不一致。US-201とは無関係。 |
| E2E-EXISTING-007 | `tests/e2e/website.spec.ts` - `edits a website` | `link-button-edit` を待機中にタイムアウト。 | 既存UIテストの前提データまたはセレクタが現在UIと不一致。US-201とは無関係。 |
| E2E-EXISTING-008 | `tests/e2e/website.spec.ts` - `deletes a website` | `link-button-edit` を待機中にタイムアウト。 | 既存UIテストの前提データまたはセレクタが現在UIと不一致。US-201とは無関係。 |
