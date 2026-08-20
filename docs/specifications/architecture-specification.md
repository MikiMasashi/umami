# Architecture Specification

## US-201: Website Notes

### 1. アーキテクチャ概要
- **UI レイヤ**: Website 設定画面で notes 入力・保存、Website 一覧で notes 表示/省略表示。
- **API レイヤ**: `/api/websites` / `/api/websites/{websiteId}` に notes 入出力を追加。
- **データレイヤ**: `website.notes`（nullable, max 500）。
- **認可**: 既存 `canUpdateWebsite` に統合し、権限がない更新は拒否。

### 2. コンポーネント間インターフェース
- 設定画面: `app/(main)/websites/[websiteId]/settings/page.tsx` を入口に編集 UI が notes を扱う。
- 一覧画面: `app/(main)/websites/page.tsx` を入口に notes ありサイトのみ表示。
- 内部の子コンポーネント分割/props は契約対象外（実装裁量）。

### 3. 処理フロー
1. 設定画面で notes を入力し保存。
2. UI は `POST /api/websites/{websiteId}` に notes を送信。
3. API は認可 + 500 文字上限を検証して DB 永続化。
4. 一覧/詳細 API で notes を返却。
5. 一覧画面は notes 非空のみ表示し、長文は UI で省略表示。

## 4. テスト容易性の契約（固定）

この節は「実装前テスト」のための外部観測契約であり、後続フェーズで変更しない。

### 4.1 ルーティング（Path ↔ Page）

| Path | ページエントリポイント |
|---|---|
| `/websites/:websiteId/settings` | `src/app/(main)/websites/[websiteId]/settings/page.tsx` |
| `/websites` | `src/app/(main)/websites/page.tsx` |
| `/settings/websites` | `src/app/(main)/settings/websites/page.tsx` |

### 4.2 テスト用セレクタ規約
- 形式: `data-test="<kind>-<domain>-<target>"`（kebab-case）
- 既存に合わせて `input-*`, `button-*`, `text-*` を優先。
- 一覧行に依存する要素は `-<websiteId>` サフィックスを許容。

このストーリーで使用する `data-test` 一覧:

| 用途 | `data-test` |
|---|---|
| notes 入力欄（FormField） | `input-notes` |
| notes 保存ボタン | `button-submit`（既存再利用） |
| notes 文字数エラー表示 | `text-notes-error` |
| 一覧の notes 表示 | `website-notes-preview` |
| 一覧の notes 表示（行単位） | `website-notes-preview-<websiteId>` |

### 4.3 フォーム項目識別子

| 項目 | name 属性 | UI 種別 |
|---|---|---|
| Website notes | `notes` | `textarea` |

### 4.4 画面表示エラーメッセージ（固定文言）

| ケース | 表示文言 |
|---|---|
| notes 501 文字以上 | `Notes must be 500 characters or less.` |
| 更新権限なし | `You do not have permission to update website notes.` |
| 保存対象 Website 不在 | `Website not found.` |

### 4.5 API エラー形式と HTTP ステータス

共通:
```json
{
  "error": {
    "message": "Bad request",
    "code": "bad-request",
    "status": 400
  }
}
```

| ケース | HTTP | code |
|---|---:|---|
| notes 500 文字超過 | 400 | `bad-request` |
| 権限なし更新 | 401 | `unauthorized` |
| Website 不在 | 400 | `bad-request` |

### 4.6 コンポーネントテストのエントリポイント

| 目的 | モジュールパス |
|---|---|
| notes 編集画面 | `src/app/(main)/websites/[websiteId]/settings/page.tsx` |
| notes 一覧画面 | `src/app/(main)/websites/page.tsx` |

### 5. 根拠
- test-engineer 観点: URL/DOM/HTTP を固定し、内部実装変更に強いテストを優先。
- backend-architect 観点: 認可と入力検証を API 契約で明示し、サーバー側保証を担保。
- frontend-engineer 観点: 画面観測可能な `data-test`/文言を固定し、UI 実装の自由度を維持。
