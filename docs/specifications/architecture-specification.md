# アーキテクチャ設計仕様書: umami

- 対象プロダクト: umami
- 管理方針: ストーリーをまたいで蓄積する最終成果物
- 最終更新: US-201

---

## 1. 全体構成

| レイヤ | 技術 / 位置 | 役割 |
| --- | --- | --- |
| UI（ページ） | Next.js App Router `src/app/(main)/**/page.tsx` + ルート単位のページモジュール | ルーティング・画面合成 |
| UI（部品） | `@umami/react-zen`（Form/FormField/TextField 等）、`src/components/**` | 再利用 UI |
| データ取得 | `@tanstack/react-query` + `src/components/hooks/**` | サーバ状態の取得・更新・キャッシュ無効化 |
| API | `src/app/api/**/route.ts` | ルートハンドラ（zod 検証 + 権限 + 応答整形） |
| ドメイン/永続化 | `src/queries/prisma/**` + Prisma + PostgreSQL | データアクセス |
| 権限 | `src/permissions/**` | 認可判定（サーバ側） |

状態の外部化（テスト容易性）方針:
- サーバ状態は react-query 経由でのみ取得し、コンポーネントは URL/DOM/HTTP を境界に持つ。
- 認証ユーザ・設定はグローバルストア（`src/store/app.ts`）に保持し、テストで注入可能。

---

## 2. US-201 のアーキテクチャ上の位置づけ

メモ機能は**新しい層・新しいエンドポイント・新しい権限体系を導入しない**。既存の
「ウェブサイト取得/更新」経路に `notes` を 1 フィールド追加する形で実装する。

```
[settings 詳細ページ] WebsiteSettingsPage
  └ WebsiteProvider (GET /api/websites/{id})
      └ WebsiteSettings
          └ WebsiteEditForm  … notes 入力欄をここに追加（POST /api/websites/{id}）

[一覧ページ] WebsitesSettingsPage / WebsitesPage
  └ WebsitesDataTable (GET /api/(me|users/{id}|teams/{id})/websites)
      └ WebsitesTable  … notes 表示セルをここに追加
```

> 注意: 上記の子コンポーネント分割（WebsiteEditForm / WebsitesTable への追加位置）は
> **実装フェーズの裁量**であり、テスト容易性の契約には含めない（§4 参照）。

---

## 3. 横断的関心事

- バリデーション: クライアント（react-hook-form の `rules`）とサーバ（zod）の二重化。
  文言・上限（500 codepoints）は両者で一致させる。
- セキュリティ: 権限判定はサーバ側 `canUpdateWebsite`。表示は React エスケープに従う。
- キャッシュ: 更新後は `useModified().touch('websites')` / `touch('website:{id}')` で
  一覧・詳細のキャッシュを無効化する（既存パターン）。
- パフォーマンス: `notes` は既存の取得列に追加するのみ。追加クエリ・N+1 を発生させない。

---

## 4. テスト容易性の契約（Testability Contract） — US-201

> 本節は「実装が無い状態でレビュー済みテストを書く」ための**確定契約**である。
> ここに書かれた値は実装フェーズで変更してはならない。
> **契約は外から観測できるもの（URL・DOM・HTTP）に限る。** 子コンポーネントの分割方針・
> props 署名は契約に含めない（実装フェーズの裁量）。

### 4.1 ルーティング（パス ↔ ページ）

| パス | ページ（ファイル） | 役割 |
| --- | --- | --- |
| `/settings/websites` | `src/app/(main)/settings/websites/page.tsx` → `WebsitesSettingsPage` | ウェブサイト一覧（設定） |
| `/settings/websites/{websiteId}` | `src/app/(main)/settings/websites/[websiteId]/page.tsx` → `WebsiteSettingsPage` | ウェブサイト設定の詳細（メモ編集を含む） |
| `/websites` | `src/app/(main)/websites/page.tsx` → `WebsitesPage` | ウェブサイト一覧（メイン） |
| `/websites/{websiteId}/settings` | `src/app/(main)/websites/[websiteId]/settings/page.tsx` → `SettingsPage` | 設定（同じ編集フォームを描画） |

メモの編集はいずれの設定ルートでも同じ `WebsiteEditForm` を描画する。E2E・コンポーネント
テストは代表として **`/settings/websites/{websiteId}`（詳細）** と
**`/settings/websites`（一覧）** を用いる。

### 4.2 テスト用セレクタ規約（`data-test`）

- 命名規則: `kebab-case`。入力欄は `input-<name>`、ボタンは `button-<action>`、
  表示要素は `text-<subject>` または `<subject>-<detail>`。Playwright の
  `testIdAttribute` は `data-test`（`playwright.config.ts`）、コンポーネントテストも
  `configure({ testIdAttribute: 'data-test' })`（`src/test/setup.ts`）で統一。

US-201 で使用するセレクタ一覧:

| data-test | 場所 | 説明 |
| --- | --- | --- |
| `input-notes` | 設定詳細（編集フォーム） | メモ入力欄（複数行）。内部に `role="textbox"`（`<textarea>`）を持つ |
| `button-submit` | 設定詳細（編集フォーム） | 保存ボタン（**既存**を再利用） |
| `input-name` | 設定詳細（編集フォーム） | 名前入力欄（**既存**、後方互換確認に使用） |
| `text-field-websiteId` | 設定詳細（編集フォーム） | websiteId 表示（**既存**） |
| `website-notes` | 一覧の各行 | メモ表示セル。**メモが非空の行にのみ描画**し、メモ本文（長い場合は省略表示可）を含む |

### 4.3 フォーム項目の識別子

| 画面項目 | フォーム `name` | data-test | 対応データ列 |
| --- | --- | --- | --- |
| メモ | `notes` | `input-notes` | `Website.notes`（`VARCHAR(500)`, NULL 許容） |

- 型: 複数行テキスト（`<textarea>`）。任意入力。
- 上限: 500 コードポイント（OQ-1）。トリム後空は未設定（`null`）扱い（OQ-2）。

### 4.4 画面に表示するエラーメッセージ文言

| 事象 | 文言（英語 UI, 完全一致） |
| --- | --- |
| メモが 500 文字を超過 | `Notes must be 500 characters or less.` |

- クライアント（react-hook-form の `rules.maxLength.message` 相当）・サーバ（zod の
  `.max(500, { message })`）双方で同一文言を用いる。

### 4.5 API のエラーレスポンス形式と HTTP ステータス

更新エンドポイント `POST /api/websites/{websiteId}`（`notes` を含む）:

| 事象 | HTTP | ボディ（要点） |
| --- | --- | --- |
| メモ 501 codepoints 以上 | 400 | `{ error: { code: "bad-request", status: 400, properties: { notes: { errors: [ "Notes must be 500 characters or less." ] } } } }` |
| 更新権限なし | 401 | `{ error: { code: "unauthorized", status: 401, message: "Unauthorized" } }` |
| 正常 | 200 | 更新後の website（`notes` を含む） |

（形式は `src/lib/response.ts` / `parseRequest` の既存仕様に準拠。詳細は
`docs/specifications/api-specification.md` §2.3）

### 4.6 コンポーネントテストのエントリポイント（ルート単位のページモジュール）

| ルート | エントリポイント（import パス） |
| --- | --- |
| `/settings/websites/{websiteId}` | `@/app/(main)/settings/websites/[websiteId]/WebsiteSettingsPage` （export `WebsiteSettingsPage`） |
| `/settings/websites` | `@/app/(main)/settings/websites/WebsitesSettingsPage` （export `WebsitesSettingsPage`） |

- テストはこの**ルート単位のページモジュール**を描画対象とし、内部の子コンポーネントを
  直接描画しない。アサーションは DOM（role / `data-test` / 表示文言）のみに依存する。
- サーバ通信は MSW（`src/component-tests/support/server.ts`）でスタブする。
- 認証ユーザ・設定は `src/store/app.ts` の `setUser` / `setConfig` で注入する。

---

## 5. 決定の根拠（要約）

- **既存更新経路の拡張**を選択（専用エンドポイント新設を回避）→ 権限・キャッシュ・退行の
  観点で最小コスト・最小リスク。
- **契約を URL/DOM/HTTP に限定** → 実装フェーズが子コンポーネント構成を自由に選べ、
  「レビュー済みテストを変更しない」制約と両立する。
