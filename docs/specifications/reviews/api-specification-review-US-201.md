# API Specification Review - US-201

## Review result
- Status: Approved with decisions fixed

## Reviewed items
- notes 専用取得/保存 API の URL 契約
- `/api/websites` への `notes` 追加方針
- Zod バリデーションエラー形式
- 権限チェックと status code

## Decisions
1. 保存 API は `POST /api/websites/{websiteId}/notes` を採用
2. 取得 API は `GET /api/websites/{websiteId}/notes` を採用
3. 一覧は既存 `GET /api/websites` を拡張し、別一覧 API は作らない
4. 更新権限は `canUpdateWebsite` に統一
5. 文字数超過は `400` + `VALIDATION_ERROR`

## Review comments
- 既存 website 更新 API と整合するが、notes 専用 endpoint によりテスト契約が明確
- 401/403 は既存実装が 401 寄りのため、現行実装整合を優先して 401 に寄せる
- not found を明示することで E2E/API 契約が安定する

## セルフレビュー結果（テストエンジニア）

### ✅ テスト容易性の視点での承認事項

1. **エンドポイント契約の明確性**
   - `GET /api/websites/{websiteId}/notes` で取得
   - `POST /api/websites/{websiteId}/notes` で保存/削除（空文字）
   - E2E と コンポーネント両層でこの契約に基づいてテスト可能 ✅

2. **エラーレスポンス形式の統一**
   ```json
   { "error": { "message": "...", "code": "...", "status": 400 } }
   ```
   - テストで固定形式を想定してアサーション可能 ✅
   - HTTP ステータスコード (400/401/404) も明確 ✅

3. **権限チェック位置の適切性**
   - API で必ず権限確認（防御的）✅
   - クライアント UI disable で不正操作を抑止
   - 非同期で権限失効したケース（セッション切れ）も API で保護

### 代替案検討（却下理由を含む）

| 案 | 理由 | 判定 |
|---|---|---|
| DELETE `/api/websites/{websiteId}/notes` を独立させる | 要件「空文字で削除」と重複、scope 増加 | 🚫 却下 |
| `GET /api/websites` に notes を含める | 一覧パフォーマンス低下（非機能要件 3.4） | 🚫 却下 |
| Markdown / リッチテキスト対応 | 要件「プレーンテキストのみ」 | 🚫 却下 |
| 500文字以外の制限値 | 要件で明記、一覧省略バランス考慮済み | ✅ 要件採択 |

### テスト統合での懸念と対策

| 懸念 | 対策 |
|------|------|
| DB マイグレーション失敗 | Prisma migration のテスト実施、ロールバック計画 |
| 既存 NULL records の処理漏れ | コンポーネント・E2E で「既存メモなしサイト」ケース検証 |
| 権限チェック漏れ（API側） | E2E で read-only user の 401 応答を確認 |
| API 呼び出し頻度増加 | 次フェーズキャッシュ戦略で検討、現フェーズは単純実装 |

## 最終判定

**✅ 承認** - API 設計は要件に完全適合、テスト層での検証も構造化できており、実装フェーズ移行可能

---
**レビュー完了**: 2026-08-18  
**レビュアー**: Test Engineer (Copilot) + Backend Architect (Design)  
**ステータス**: ✅ 承認
