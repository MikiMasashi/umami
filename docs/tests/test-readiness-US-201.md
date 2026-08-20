# Test Readiness Record (US-201)

## 実行コマンド

1. `npx playwright test --list`
2. `npm run test:unit`

## 実行結果

### 1. `npx playwright test --list`
- 結果: 成功（収集成立）
- 列挙シナリオ数: **40**
- US-201 追加分:
  - `tests/e2e/website-notes.spec.ts` に **6 シナリオ**が列挙

### 2. `npm run test:unit`
- 結果: 失敗（期待どおり、実装未存在による失敗）
- 失敗ファイル: `src/component-tests/us201-website-notes-page.test.tsx`
- 失敗テスト数: 4

失敗内容（要約）:
1. `CT-201-01` / `CT-201-02`  
   - 理由: `data-test="input-notes"` が画面に存在しない（notes 入力 UI 未実装）。
2. `CT-201-03`  
   - 理由: 一覧に notes 文言（`Production site for JP market`）が表示されない（notes 一覧表示未実装）。
3. `CT-201-04`  
   - 理由: notes 省略表示（ellipsis）を示す DOM が存在しない（省略表示未実装）。

補足:
- 既存テスト群は大半が成功し、失敗は US-201 の新規コンポーネントテストに集中。
- 追加ライブラリ: なし
