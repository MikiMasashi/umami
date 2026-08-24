# Architecture Review - US-201

## Review result
- Status: Approved with testability contract critical

## Reviewed items
- 既存 route との整合
- 設定詳細/一覧の entry point
- data-test 契約
- テスト層分担
- テスト容易性の外部契約

## Decisions
1. 設定詳細ルートは `src/app/(main)/websites/[websiteId]/settings/page.tsx`
2. 一覧ルートは `src/app/(main)/websites/page.tsx`
3. data-test は `notes-*` / `website-notes-*` を採用
4. 501文字超過の詳細はコンポーネントテスト中心
5. 権限制御は UI と API の二重防御

## Review comments
- page ルート単位でのコンポーネントテスト対象が明確
- `src/test/setup.ts` の `data-test` 設定と整合している
- 一覧の省略表示ルールを固定したことで E2E の観測点が安定

## セルフレビュー（テストエンジニア視点 - テスト容易性の契約）

### ✅ 外部契約の明確性（テスト実装前に確定）

#### 1. セレクタ規約の完全性
- ✅ `data-test="notes-input"` - メモ入力欄
- ✅ `data-test="notes-save-button"` - 保存ボタン
- ✅ `data-test="notes-error-message"` - エラー表示
- ✅ `data-test="notes-success-message"` - 成功メッセージ
- ✅ `data-test="website-notes-cell-{websiteId}"` - 一覧メモセル

**判定**: コンポーネント・E2E 両層でこれらセレクタで element を取得し、テスト実装可

#### 2. 画面表示メッセージの確定値
- ✅ 成功（保存）: `メモが保存されました`
- ✅ 成功（削除）: `メモが削除されました`
- ✅ バリデーション: `メモは500文字以内です`
- ✅ 権限エラー: `メモを編集する権限がありません`
- ✅ Not Found: `対象のウェブサイトが見つかりません`

**判定**: テストでこれらの固定文言を `expect().toHaveTextContent()` で確認可能

#### 3. API エンドポイント契約
- ✅ GET `/api/websites/{websiteId}/notes`
- ✅ POST `/api/websites/{websiteId}/notes`
- ✅ エラーレスポンス: `{ "error": { "message": "...", "code": "...", "status": 400 } }`
- ✅ HTTP ステータス: 200 (成功), 400 (validation), 401 (auth), 404 (not found)

**判定**: E2E/コンポーネント両層でこれらの API 契約を前提としてテスト可能

### ⚠️ テスト層の役割分担の妥当性

| レイヤ | 責務 | US-201 での検証対象 | 判定 |
|------|------|-----|------|
| E2E | ユーザー操作の完全フロー | happy path + 権限異常系 | ✅ |
| コンポーネント | ページ単位の UI/バリデーション | 境界値・エラー表示・権限チェック | ✅ |
| ユニット | 関数/ロジック | Zod schema, 省略ロジック | 次フェーズ |

**判定**: 層分担が明確で、実装フェーズでテストが分割可能

### 🚫 却下した設計案

| 案 | 理由 | 判定 |
|---|---|---|
| 子コンポーネント分割の契約を固定 | 実装前に内部構造まで固定すると、実装フェーズでテスト書き換え不可 | 🚫 却下 |
| props/state の テスト from child component | 外部から観測できないため、実装詳細依存が発生 | 🚫 却下 |
| ページルート以下の細粒度コンポーネントテスト | scope 膨張、内部構造依存で テスト の再設計が必要 | 🚫 却下 |

## 重要: テスト容易性の契約のスコープ確定

**以下は契約に含める（外から観測可能）:**
- URL パス (ルーティング)
- HTML element (data-test, role, text)
- HTTP API (endpoint, method, status code)
- 画面に表示される固定文言

**以下は契約に含めない（実装詳細に依存）:**
- 子コンポーネントの分割方針
- 親子間の props 型・呼び出しシグネチャ
- 内部状態管理（useState/Context/Store の選択）
- CSS class 名

このスコープを守ることで、実装フェーズが UI の内部構造を自由に設計でき、
テストフェーズで書いたテストの変更を最小化できる ✅

## 最終判定

**✅ 承認 - テスト容易性の契約が明確で、E2E/コンポーネント両層での実装が可能**

次フェーズ（実装）での確認事項:
1. 設計書で確定した セレクタ・メッセージ・API パス に従って実装
2. テスト容易性の契約スコープ（外部契約のみ）を守る
3. テストコードは手順3で作成済みであり、人間レビュー済み

---
**レビュー完了**: 2026-08-18  
**レビュアー**: Test Engineer (Copilot)  
**ステータス**: ✅ 承認 → テストコード作成最終段階
