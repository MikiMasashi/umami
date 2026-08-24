# コンポーネントテスト設計 US-201: ウェブサイトへのメモ（notes）機能

## テスト戦略

- 対象はルート単位のエントリポイント（`page.tsx` が描画するクライアントコンポーネント）に限定する。
  - `src/app/(main)/settings/websites/[websiteId]/WebsiteSettingsPage.tsx`
  - `src/app/(main)/settings/websites/WebsitesSettingsPage.tsx`
- アサーションは DOM ベース（`getByRole` / `getByTestId`（`data-test`）/ 表示文言）のみに限定し、
  子コンポーネントの分割・props シグネチャには依存しない。
- ネットワーク呼び出しは MSW（`msw/node`）でモックする。実データ取得の詳細（`useWebsiteQuery` が
  内部でどう実装されているか等）ではなく、「画面が何を表示するか」のみを検証する。
- 認証状態は `@/store/app` の `setUser` を使い、ログイン済みユーザーを事前にセットしておくことで
  `/api/auth/verify` の呼び出しを回避する（`useLoginQuery` は `enabled: !user` のため）。
- 各ページが依存する付随的な API（`/api/config`, `/api/websites/{id}/shares`,
  `/api/users/{userId}/teams` 等）は、本ストーリーの検証に影響しないダミーレスポンス
  （空データ）で応答し、テストの主眼（メモの表示・編集・保存・バリデーション・権限制御）に
  集中する。

## テスト観点

1. 詳細画面（`WebsiteSettingsPage`）でのメモの表示・編集・保存・バリデーション・権限制御
2. 一覧画面（`WebsitesSettingsPage`）でのメモ表示・省略表示・非表示

## 受け入れ条件トレーサビリティ

| 受け入れ条件 | テストケース | ファイル |
|---|---|---|
| US-201-1-1: メモ入力→保存→成功フィードバック | `saves notes and shows a success message` | WebsiteSettingsPage.test.tsx |
| US-201-1-2: 既存メモが入力欄に表示される | `renders the existing notes value in the notes field` | WebsiteSettingsPage.test.tsx |
| US-201-1-4: 空メモ保存→未設定として保存（送信内容の検証） | `submits an empty notes value when the field is cleared` | WebsiteSettingsPage.test.tsx |
| US-201-2-1: 既存サイト（メモ未設定）の詳細画面がエラーにならない | `renders an empty notes field for a website without notes` | WebsiteSettingsPage.test.tsx |
| US-201-2-2: 既存サイト（メモ未設定）の一覧行にメモ表示が出ない | `does not render any notes text for a website without notes` | WebsitesSettingsPage.test.tsx |
| US-201-3-1: メモがある行にメモ内容が表示される | `renders the notes summary for a website with notes` | WebsitesSettingsPage.test.tsx |
| US-201-3-2: 長いメモは省略表示される | `truncates a long notes value to 60 characters with an ellipsis` | WebsitesSettingsPage.test.tsx |
| US-201-3-3: メモ未設定の行には何も表示されない | `does not render any notes text for a website without notes` | WebsitesSettingsPage.test.tsx |
| US-201-4-2: 500文字超はクライアント側で拒否・エラー表示 | `shows a validation message when notes exceeds 500 characters and does not submit` | WebsiteSettingsPage.test.tsx |
| US-201-5-2: 閲覧権限のみのユーザーはメモを閲覧できるが編集・保存はできない | `disables the notes field and hides the save button when the user cannot update the website` | WebsiteSettingsPage.test.tsx |

## 前提とする設計契約（`docs/specifications/architecture-specification.md` 参照）

- `data-test="input-notes"`: メモ入力欄（`getByTestId('input-notes')` の内側の `textarea`）
- `data-test="text-notes"`: 一覧行内のメモ表示要素
- クライアント側の文字数超過エラー文言: `Notes must be 500 characters or less.`
- 保存成功時の文言: `Saved.`（既存の `messages.saved` をそのまま利用）
- API レスポンスに含まれる `notes: string | null` と、詳細取得APIのみに含まれる
  `canUpdate: boolean`
- 一覧でのメモ省略表示: 60文字を超える場合、先頭60文字 + 省略記号 `…`

## モックするAPI一覧（テスト内で `msw` によりモック）

| メソッド・パス | 用途 |
|---|---|
| `GET /api/websites/:websiteId` | 詳細画面の表示データ（`notes`, `canUpdate` を含む） |
| `POST /api/websites/:websiteId` | メモ保存の送信内容・成功/失敗レスポンスの検証 |
| `GET /api/config` | `WebsiteTrackingCode`/`WebsiteReplaySettings` が参照する設定（ダミー） |
| `GET /api/websites/:websiteId/shares` | `WebsiteShareForm` が参照する共有一覧（ダミー・空） |
| `GET /api/users/:userId/teams` | `WebsiteData` の転送可否判定に使うチーム一覧（ダミー・空） |
| `GET /api/me/websites` | 一覧画面のウェブサイト一覧データ（`notes` を含む） |
