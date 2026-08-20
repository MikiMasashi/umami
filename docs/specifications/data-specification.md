# Data Specification

## US-201: Website Notes

### 1. データモデル変更

対象: `Website`（`prisma/schema.prisma` の `model Website`）

| フィールド | 型 | NULL | 制約 |
|---|---|---|---|
| `notes` | `String` (`@db.VarChar(500)`) | 可 | 0〜500 文字 |

### 2. Prisma モデル（追加）
```prisma
model Website {
  id        String    @id() @map("website_id") @db.Uuid
  name      String    @db.VarChar(100)
  domain    String?   @db.VarChar(500)
  notes     String?   @db.VarChar(500)
  ...
}
```

### 3. DB スキーマ変更
- テーブル: `website`
- カラム: `notes VARCHAR(500) NULL`
- 既存レコードは `NULL` のまま互換維持（NFR-201-01）。

### 4. データ整合性ルール
- `notes` が `NULL` または空文字の場合、「未設定」として扱う。
- 500 文字超過はアプリケーション層で reject（`400 bad-request`）。
- 一覧表示用の省略文字列は永続化しない（保存値は常に原文）。

### 5. クエリ影響
- `getWebsite`, `getWebsites`, `createWebsite`, `updateWebsite` の返却/更新対象に `notes` を含める。
- 既存 `name/domain/createdAt` のソート・検索には影響しない（Out of Scope: notes 検索）。

### 6. 根拠
- notes は運用メモであり、可変長テキストだが長文用途ではないため `VARCHAR(500)` を採用。
- 後方互換のため `NULL` 許容を維持し、既存レコード移行の必須更新を避ける。
