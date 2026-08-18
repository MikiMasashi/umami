# Architecture Specification

## US-201 Website notes

### 1. UI / routing design

#### Confirmed routes
- ウェブサイト一覧 URL: `/websites`
- 設定詳細 URL: `/settings/websites/{websiteId}`
- 既存 website 配下設定 URL: `/websites/{websiteId}/settings`
  - 実装上の page entry は `src/app/(main)/websites/[websiteId]/settings/page.tsx`
  - 画面本体は `src/app/(main)/settings/websites/[websiteId]/WebsiteSettingsPage.tsx`
  - `src/app/(main)/websites/[websiteId]/settings/SettingsPage.tsx` が bridge component

#### Page component entry points
- 設定詳細画面（コンポーネントテスト対象ルート）  
  `src/app/(main)/websites/[websiteId]/settings/page.tsx`
- 一覧画面（コンポーネントテスト対象ルート）  
  `src/app/(main)/websites/page.tsx`

#### UI placement
- 詳細画面: `WebsiteSettings` 内の既存 `WebsiteEditForm` セクションへ notes 入力欄を追加
- 一覧画面: `WebsitesTable` に notes 列を追加

#### UI behavior
- notes 入力欄は multiline textarea
- 500文字以下は保存可能
- 501文字以上は inline error 表示
- 保存成功時は toast 表示
- 空文字保存時は削除扱い
- 更新権限がない場合:
  - textarea は read-only または disabled
  - 保存ボタンは非表示または disabled

#### Fixed display messages
- 成功（保存）: `メモが保存されました`
- 成功（削除）: `メモが削除されました`
- バリデーション: `メモは500文字以内です`
- 権限エラー: `メモを編集する権限がありません`
- Not Found: `対象のウェブサイトが見つかりません`

### 2. Testability contract

> 外から観測できる契約のみを固定する。

#### 2.1 Selector convention
- 属性は `data-test`
- 命名規則: `{area}-{element}` または `{element}-{action}`
- story 固有セレクタは `notes-*` 接頭辞を優先
- Testing Library は `src/test/setup.ts` で `data-test` を testIdAttribute として利用

#### 2.2 Selectors for US-201
- 設定詳細:
  - `data-test="notes-input"`
  - `data-test="notes-save-button"`
  - `data-test="notes-error-message"`
  - `data-test="notes-success-message"`
  - `data-test="notes-character-count"`（表示する場合のみ）
- 一覧:
  - `data-test="website-notes-column"`
  - `data-test="website-notes-cell-{websiteId}"`
  - `data-test="website-notes-tooltip-{websiteId}"`（tooltip を採用する場合）

#### 2.3 Form identifiers
- メモ入力フィールド: `data-test="notes-input"`
- 保存ボタン: `data-test="notes-save-button"`
- エラーメッセージ: `data-test="notes-error-message"`

#### 2.4 API endpoints (complete paths)
- `GET /api/websites/{websiteId}/notes`
- `POST /api/websites/{websiteId}/notes`
- `GET /api/websites`

#### 2.5 API error response contract
```json
{
  "error": {
    "message": "メモは500文字以内です",
    "code": "VALIDATION_ERROR",
    "status": 400
  }
}
```

- validation: `400`
- unauthorized / forbidden 相当: `401`
- not found: `404`

#### 2.6 Fixed screen messages
- 成功: `メモが保存されました`
- エラー: `メモは500文字以内です`
- 削除: `メモが削除されました`

### 3. Test strategy

#### 3.1 Layer responsibilities
- E2E:
  - ユーザー操作とブラウザ統合
  - happy path / 権限異常系
- コンポーネント:
  - ページルート単位の UI 状態
  - バリデーション、境界値、API エラー表示
- ユニット:
  - Zod schema 正規化
  - notes 省略表示関数
  - API request/response mapping

#### 3.2 E2E critical journeys
- US-201-1: メモ新規入力 → 保存 → 再読み込み後も表示
- US-201-2: 一覧にメモ表示（既存サイト / 新規サイト）
- US-201-4: 権限なしユーザーは編集不可、API 更新失敗

#### 3.3 Component scenarios
- 初期表示（notes あり / なし）
- 入力・クリア
- 500文字境界で保存可
- 501文字でエラー表示
- 保存ボタンの enable/disable
- API エラー時の表示
- 既存メモ上書き
- 一覧での省略表示 / 空表示

#### 3.4 Stability rules
- テストデータは各 test で独立作成・cleanup
- selector は `data-test` と role ベース
- Playwright は web-first assertions 使用
- 並列実行に備え、共有 notes データを使わない

### 4. Architecture decision
- 既存 website 集約・既存権限関数・既存 settings route を活かす。
- 新規 notes 機能は「website の単一属性追加」として扱い、集約分割はしない。
- 一覧と詳細で同じ source of truth を DB の `website.notes` に統一する。
