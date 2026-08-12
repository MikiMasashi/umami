# 全体アーキテクチャ仕様書

このドキュメントはストーリーをまたいで蓄積される、umami の全体アーキテクチャ設計の最終成果物である。

## US-201: ウェブサイトへのメモ（notes）機能

### アーキテクチャ方針・根拠

- 既存のレイヤ構成（Next.js App Router のページ/クライアントコンポーネント →
  `@umami/react-zen` の `Form`/`FormField` → `useUpdateQuery`/`useWebsiteQuery`（TanStack Query）
  → `app/api/websites/[websiteId]/route.ts`（zod検証・権限チェック）→ `queries/prisma/website.ts`
  → Prisma）を踏襲し、新しいレイヤやモジュールは追加しない。
- 理由: メモは既存の `Website` エンティティの属性の一つに過ぎず、既存の CRUD フローに乗せることで
  実装・レビューコストを最小化できる（非機能要件「一貫性」「保守性」）。新しい状態管理層や
  専用ストアを導入する理由がない。
- 権限制御は「サーバー側の最終防衛（`canUpdateWebsite`）」を正とし、フロントエンドの表示制御
  （編集フォームの活性・非活性）は API レスポンスの `canUpdate` フラグに追従するのみとする。
  フロントエンドが独自に権限ロジックを再実装しない（権限ロジックの単一情報源を維持する）。
- 却下した代替案: メモ入力を独立した画面・独立したフォーム送信（別の "Notes" タブ）に分離する。
  → 却下。要件は「ウェブサイト設定の詳細画面」内での入力・編集・保存であり、既存の
  `WebsiteEditForm`（name/domain を保存するフォーム）に統合するほうが、1回の保存操作で完結し
  UXもシンプル（既存の保存フィードバック・エラーハンドリングの導線をそのまま使える）。

---

## テスト容易性の契約（US-201）

実装が存在しない状態でテストコードを書き切るため、外部から観測可能な契約を以下に確定する。
**子コンポーネントの分割方針・props シグネチャはここに含めない**（実装フェーズの裁量に委ねる）。

### 1. ルーティング（パス ↔ ページ）

| パス | ページモジュール（コンポーネントテストのエントリポイント） | 用途 |
|---|---|---|
| `/settings/websites` | `src/app/(main)/settings/websites/WebsitesSettingsPage.tsx` | ウェブサイト一覧（メモ概要を表示） |
| `/settings/websites/{websiteId}` | `src/app/(main)/settings/websites/[websiteId]/WebsiteSettingsPage.tsx` | ウェブサイト設定の詳細画面（メモの入力・編集・保存） |
| `/websites/{websiteId}/settings` | `src/app/(main)/websites/[websiteId]/settings/SettingsPage.tsx`（内部で上記 `WebsiteSettingsPage` を描画） | 詳細画面への別導線（同一機能） |

E2E・コンポーネントテストの正のシナリオは `/settings/websites` および
`/settings/websites/{websiteId}` を基準とする（既存の `tests/e2e/website.spec.ts` が
`/settings/websites` を使用しているため、既存資産との一貫性を優先する）。

各 `page.tsx`（Next.js のルートファイル）は `params` を await して上記のページモジュールに
`websiteId`（または `teamId`）を渡すだけの薄いラッパーであり、変更・テスト対象としない。
コンポーネントテストは上記の「ページモジュール」（`'use client'` を持つルート単位のコンポーネント）
を直接 `render()` することで、Next.js のサーバーコンポーネント境界を経由せずに検証する。

### 2. テスト用セレクタ規約（`data-test`）

命名規則: `{element-type}-{purpose}`（ケバブケース）。既存の踏襲例:
`input-name`, `input-domain`, `button-submit`, `button-delete`, `text-field-websiteId`,
`button-website-add`, `link-button-edit`。

本ストーリーで新規に使用する `data-test` 一覧:

| data-test | 要素 | 用途 |
|---|---|---|
| `input-notes` | `FormField` の `data-test` 属性（`WebsiteEditForm` 内） | メモ入力欄（複数行テキスト） |
| `text-notes` | 一覧の行内のメモ表示要素 | 一覧でのメモ概要表示（コンポーネントテストから `data-test` で取得） |

一覧のテーブルセルについては、既存の E2E テストが `td[label="Name"]` のように
`DataColumn` の `label` プロパティ（列見出しの表示テキスト）でロケートする方式を既に採用しているため
（`tests/e2e/website.spec.ts` 参照）、メモ列も同様に **列見出しラベルは "Notes"** とし、
E2E からは `page.locator('td[label="Notes"]')` でロケートする。`data-test="text-notes"` は
コンポーネントテスト（Testing Library）側で行単位の中身を検証する際に使用する。

### 3. フォーム項目の識別子

| 項目 | `name`（react-hook-form のフィールド名） | 上限文字数 |
|---|---|---|
| メモ | `notes` | 500文字 |

- 入力欄は複数行テキスト入力（`TextField` の `asTextArea` 相当、または同等のテキストエリア）とする。
  具体的な内部実装（コンポーネント名・props）は実装フェーズの裁量とする。
- 空文字列での保存は許可され、「未設定」（`null`）として扱われる。

### 4. 画面に表示するエラーメッセージ文言

| 状況 | 表示文言（完全一致） | 表示位置 |
|---|---|---|
| メモが500文字を超えた状態で保存を試みた（クライアント側検証） | `Notes must be 500 characters or less.` | `notes` フィールドの直下（既存の `domain` フィールドの `pattern` バリデーションエラーと同じ表示パターン。react-zen の `FormField` はバリデーションエラーメッセージをフィールド直下にプレーンテキストとして表示する） |

- この文言は `src/components/messages.ts` の `messages` に
  `notesTooLong: 'message.notes-too-long'` として追加し、
  `public/intl/messages/en-US.json` に `"notes-too-long": "Notes must be 500 characters or less."`
  を追加することを実装フェーズに要求する（本フェーズでは追加しない。テストは実装されるまで
  この文言が存在せず失敗する）。
- 保存成功時のフィードバック文言は既存の `messages.saved`（"Saved."）をそのまま使う
  （新規追加は不要。既存の `WebsiteEditForm` の `toast(t(messages.saved))` をメモ保存時にも
  そのまま利用する設計とする）。

### 5. API のエラーレスポンス形式と HTTP ステータス

`docs/specifications/api-specification.md` の該当セクションを正とする。要点:

| ケース | HTTPステータス | `error.code` |
|---|---|---|
| メモが500文字超でサーバー側検証に失敗 | 400 | `bad-request` |
| 更新権限がないユーザーによる更新リクエスト | 401 | `unauthorized` |

### 6. コンポーネントテストのエントリポイント（ルート単位のページモジュールのパス）

- `src/app/(main)/settings/websites/[websiteId]/WebsiteSettingsPage.tsx`
- `src/app/(main)/settings/websites/WebsitesSettingsPage.tsx`

コンポーネントテストはこれらのモジュールを起点として `render()` し、内部の子コンポーネント
（`WebsiteEditForm`, `WebsitesDataTable`, `WebsitesTable` 等）がどのように分割されているかには
依存せず、DOM（role / `data-test` / 表示文言）のみをアサーションの対象とする。
