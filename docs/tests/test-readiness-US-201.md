# テスト準備状況（Test Readiness）: US-201

本書は「テストが実装未存在のために失敗している」ことの確認記録である（手順6）。

---

## 1. 実行環境・コマンド

| 目的 | コマンド | 備考 |
| --- | --- | --- |
| E2E の収集確認 | `PLAYWRIGHT_SKIP_WEB_SERVER=1 npx playwright test --list tests/e2e/notes.spec.ts` | 稼働サーバ不要。構文・収集のみ確認 |
| コンポーネントテスト実行 | `npx vitest run src/component-tests` | `package.json` に `test:unit` は存在しないため、Vitest を直接起動（`test` スクリプト= `vitest run` と等価） |
| 退行確認（全 Vitest） | `npx vitest run` | 既存テストに影響が無いことを確認 |

> 注: 指示の `npm run test:unit` は当リポジトリに未定義。設定ファイルは変更しない制約に従い、
> スクリプト追加はせず `npx vitest run`（= `npm test`）で代替した。

---

## 2. E2E（Playwright）— 収集結果

`npx playwright test --list tests/e2e/notes.spec.ts` の出力: **8 シナリオ**が列挙された
（構文・収集が成立）。

```
[chromium] › notes.spec.ts › AC-1/AC-2: enter, save and persist notes on the settings detail page
[chromium] › notes.spec.ts › AC-3: the list shows notes for a website that has them
[chromium] › notes.spec.ts › AC-4: the list shows no notes cell for a website without notes
[chromium] › notes.spec.ts › AC-5: a notes value at the 500-character limit can be saved
[chromium] › notes.spec.ts › AC-6: a notes value over 500 characters is rejected (UI error and server 400)
[chromium] › notes.spec.ts › AC-7: a user without update permission cannot change notes (server 401)
[chromium] › notes.spec.ts › AC-9: clearing notes returns the website to the unset state
[chromium] › notes.spec.ts › AC-8: a legacy website without notes keeps working (list, detail, rename)
Total: 8 tests in 1 file
```

E2E は稼働サーバ + DB が無いと実行できないため、本フェーズでは実行せず収集のみを確認。
実行時は「`notes` 未実装（`input-notes` / `website-notes` が無い、`notes` を無視する API）」の
ために失敗する想定。

---

## 3. コンポーネントテスト（Vitest）— 実行結果

`npx vitest run src/component-tests` の結果: **9 テスト中 9 失敗**。全て
**実装未存在**が失敗理由（対象 `data-test` 要素が DOM に無い）。

| テスト | 失敗理由（実装未存在） |
| --- | --- |
| notes-website-settings C-1〜C-7（7件） | `Unable to find an element by: [data-test="input-notes"]`（メモ入力欄が未実装） |
| notes-website-list C-8, C-9（2件） | `Unable to find an element by: [data-test="website-notes"]`（一覧のメモ表示セルが未実装） |

いずれも「収集・描画は成功し、期待する DOM 要素が存在しないために失敗」＝実装未存在。
描画中の例外（セットアップ不備）による失敗ではないことを、プロトタイプで
`input-name` / `button-submit` / 一覧の行描画が成功することを確認して裏付けた。

### 退行確認（全 Vitest）

`npx vitest run` の結果: **Test Files 2 failed | 17 passed (19)**, **Tests 9 failed | 82 passed (91)**。
失敗はすべて本フェーズで追加した US-201 の 9 テストのみ。既存の 82 テストは全て緑で、
本フェーズの追加が既存に退行を与えていないことを確認した。

---

## 4. 追加ライブラリ

**なし。** 既存の依存のみを使用した（バージョンは lockfile のまま変更していない）。

- E2E: `@playwright/test`（既存）
- コンポーネント: `vitest` / `@testing-library/react` / `@testing-library/user-event` /
  `@testing-library/jest-dom` / `jsdom` / `msw`（いずれも `package.json` に既存）

MSW は既に依存として存在し、`src/test/msw/` に雛形があるため、これを踏襲して
`src/component-tests/support/server.ts` にコンポーネントテスト用サーバを用意した。

---

## 5. 実装フェーズへの引き継ぎ（緑化条件）

1. `Website.notes`（`VARCHAR(500)`, NULL 許容）の追加とマイグレーション。
2. `POST /api/websites/{id}` の zod スキーマに `notes`（trim / max 500 codepoints /
   空→null 正規化）を追加。501 で 400、権限なしで 401。
3. `WebsiteEditForm` に `data-test="input-notes"` の複数行入力欄を追加（読み取り専用対応）。
4. 一覧（`WebsitesTable`）に `data-test="website-notes"` セルを追加（非空行のみ描画）。
5. 上限超過の文言 `Notes must be 500 characters or less.` をクライアント/サーバで一致させる。

上記により、レビュー済みの E2E / コンポーネントテストを変更せずに緑化できる。
