# コンポーネントテスト設計: US-201（ウェブサイトのメモ）

- 対象:
  - `src/component-tests/notes-website-settings.test.tsx`（設定詳細）
  - `src/component-tests/notes-website-list.test.tsx`（一覧）
  - 共通支援: `src/component-tests/support/server.ts`（MSW）
- ランナー: Vitest（`vitest.config.ts`, `include: ['src/**/*.test.{ts,tsx}']`, `environment: jsdom`）
- エントリポイント（ルート単位のページモジュール）:
  - `WebsiteSettingsPage`（route `/settings/websites/{websiteId}`）
  - `WebsitesSettingsPage`（route `/settings/websites`）

---

## 1. 方針

- **描画対象はルート単位のページモジュールのみ**。子コンポーネント（`WebsiteEditForm` 等）を
  直接描画しない。
- **アサーションは DOM ベース（role / `data-test` / 表示文言）のみ**。props 署名・内部構造・
  子コンポーネントの呼ばれ方に依存しない。
- サーバ通信は MSW（`support/server.ts`）でスタブ。認証ユーザ・設定は
  `src/store/app.ts` の `setUser` / `setConfig` で注入。
- トースト等 jsdom で描画されない UI は検証対象にしない（→ E2E に委譲）。

## 2. テスト観点

| 観点 | 内容 |
| --- | --- |
| 入力可能性 | メモ欄が存在し、テキストを入力すると値が反映される（FR-1） |
| 永続値の表示 | サーバが返した `notes` が入力欄に表示される（FR-2/AC-2 の描画面） |
| 境界値 | 500 文字は長さエラー非表示、501 文字は長さエラー文言表示（FR-3） |
| クリア | 空にしても長さエラーが出ない（FR-7） |
| 後方互換 | `notes` 未設定でもページが壊れず空欄で描画（FR-6/AC-8） |
| 権限 | 更新権限なしユーザには読み取り専用（`readonly`）で表示（FR-5/OQ-4） |
| 一覧表示 | メモありは `website-notes` に本文表示、メモなしは非表示（FR-4） |

## 3. シナリオ ↔ 受入条件トレーサビリティ

| テスト | 確認内容 | AC | FR/NFR |
| --- | --- | --- | --- |
| C-1 renders an editable notes field | `input-notes` に入力可能、`button-submit` 有効 | AC-1 | FR-1 |
| C-2 shows the persisted notes value | サーバ `notes` が textarea に反映 | AC-2 | FR-2 |
| C-3 500-character limit shows no error | 500 文字で長さエラー文言なし | AC-5 | FR-3 |
| C-4 over 500 characters shows the error | 501 文字で `Notes must be 500 characters or less.` 表示 | AC-6 | FR-3, NFR-2 |
| C-5 notes can be cleared to empty | 空保存で長さエラーなし・値が空 | AC-9 | FR-7 |
| C-6 legacy website renders empty field | `notes` 未設定で空欄描画・例外なし | AC-8 | FR-6 |
| C-7 no update permission → read-only | view-only ユーザで textarea が `readonly` | AC-7 | FR-5 |
| C-8 list shows notes | `website-notes` に本文表示 | AC-3 | FR-4 |
| C-9 list shows no notes cell when empty | メモなし行に `website-notes` 無し（存在数 1） | AC-4 | FR-4, FR-6 |

網羅: AC-1〜AC-9 の全条件をコンポーネント層でも観測（ただし AC-1 の「通知」と AC-6/AC-7 の
サーバ側拒否は E2E が正、コンポーネントは DOM 観測できる範囲を担保）。

## 4. 契約依存（DOM 観測点）

- `data-test="input-notes"`（内部に `role="textbox"` の `<textarea>`）
- `data-test="button-submit"`（既存）
- `data-test="website-notes"`（一覧・非空行のみ）
- 表示文言: `Notes must be 500 characters or less.`

## 5. 既知の限界

- 保存成功トーストは jsdom 非対応のため未検証（E2E で担保）。
- 一覧の省略表示（切り詰め長・全文確認手段）は OQ-3 未決のため、文言長は検証しない。
