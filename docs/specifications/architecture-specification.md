# Architecture Specification

## US-201: Website Notes

### 設計要約
- Website Notes は既存 Website 設定の拡張として扱い、新規サブシステムは追加しない。
- レイヤ責務は現行どおり: UI（React）→ Route Handler（Next.js）→ Permission → Prisma Query → PostgreSQL。

### コンポーネント間インターフェース
1. **UI（frontend-engineer 観点）**
   - `WebsiteEditForm` に `notes` 入力欄（textarea 相当）を追加。
   - `WebsitesTable` / `WebsitesDataTable` に notes 表示領域を追加。
   - 表示ルール:
     - `notes == null` または空白のみ: 表示しない
     - 長文: UI で省略表示（例: 1 行 ellipsis または固定文字数切り詰め）
2. **Client Data Hook**
   - `useWebsiteQuery` / `useUserWebsitesQuery` のレスポンス型に `notes` が自然流入。
   - キャッシュキー構造は変更不要（既存 `touch('websites')`, `touch('website:{id}')` 再利用）。
3. **API Layer**
   - `POST /api/websites/[websiteId]` で `notes` バリデーション・正規化。
   - 一覧/詳細 GET は既存レスポンスに `notes` を含めて返却。
4. **Domain + Persistence**
   - `canUpdateWebsite` を更新可否の単一判定点として維持。
   - `updateWebsite()` に `notes` を渡して保存。

### シーケンス（更新）
1. 設定画面でユーザーが `notes` を入力し保存。
2. UI が `POST /api/websites/[websiteId]` を呼び出し。
3. Route Handler が認証済みユーザーを解決し `canUpdateWebsite` 実行。
4. zod で `notes <= 500` を検証し、空文字を `null` に正規化。
5. Prisma `updateWebsite` で `website.notes` 更新。
6. UI は既存の `touch` により一覧/詳細を再取得し反映。

### 非機能設計
- **互換性**: nullable 追加のみ。既存クライアントへの破壊的変更なし。
- **セキュリティ**: 既存 website update 権限境界を再利用し、新たな権限分岐を増やさない。
- **性能**: 一覧取得に列 1 つ追加のみ。インデックス不要。
- **運用性**: メモの省略ロジックを UI 側へ寄せ、表示仕様変更をバックエンド改修から分離。

### 採用した設計判断
1. Notes 専用 API 新設は行わず、既存 Website 更新 API を拡張する。
2. Notes 専用テーブルは作らず、`website.notes` に集約する。
3. 省略表示は API ではなく UI で実施する。
