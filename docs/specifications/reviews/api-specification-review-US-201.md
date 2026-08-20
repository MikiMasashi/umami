# API Specification Review (US-201)

## 結論
- 採用: `notes` を Website create/update/get 系 API に追加し、上限 500 文字をサーバー検証。

## 重点レビュー観点
1. 認可: 既存 `canUpdateWebsite` を流用し権限制御の一貫性を維持。
2. エラー契約: 既存 `error.code` 形式（`bad-request`/`unauthorized`）を維持。
3. 後方互換: notes 未設定レコードを null 許容で継続利用可能。

## 懸念点
- Zod のデフォルトメッセージは i18n されないため、UI 表示文言の整備が別途必要。

## 代替案と却下理由
- 代替案: notes 用専用 API (`/api/websites/{id}/notes`) を新設。
- 却下理由: 現行の website 更新 API と責務重複が大きく、認可・バリデーションの重複実装を招くため。
