# Component Test Design (US-201)

## 対象エントリポイント
- `src/app/(main)/websites/[websiteId]/settings/page.tsx`
- `src/app/(main)/websites/page.tsx`

## 観点とシナリオ

| シナリオID | 観点 | 入口 | DOM アサーション |
|---|---|---|---|
| CT-201-01 | 編集画面の入力契約 | `/websites/:websiteId/settings` | `data-test="input-notes"` の textarea が存在 |
| CT-201-02 | 編集画面の上限エラー | `/websites/:websiteId/settings` | 501 文字入力時に `Notes must be 500 characters or less.` 表示 |
| CT-201-03 | 一覧表示制御 | `/websites` | notes あり行のみ notes テキストが表示される |
| CT-201-04 | 一覧省略表示 | `/websites` | 長文 notes が省略表示（ellipsis）される |

## 受入条件トレーサビリティ

| 受入条件 | 対応シナリオ |
|---|---|
| AC-201-01 | CT-201-01 |
| AC-201-02 | CT-201-01 |
| AC-201-03 | CT-201-03 |
| AC-201-04 | CT-201-04 |
| AC-201-05 | CT-201-02 |
| AC-201-06 | CT-201-01（編集可否 UI 契約） |
| AC-201-07 | CT-201-03 |
