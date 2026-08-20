# Data Specification

## US-201: Website Notes

### 目的
- Website 単位の運用メモを永続化し、既存 Website エンティティの一部として扱う。

### データモデル変更
#### Prisma model `Website`
- 追加フィールド:
  - `notes String? @db.VarChar(500)`
  - `@map("notes")`
  - nullable（既存データ後方互換）

```prisma
model Website {
  // ...
  notes     String?   @map("notes") @db.VarChar(500)
  // ...
}
```

### DB スキーマ変更（PostgreSQL）
- テーブル: `website`
- 追加カラム:
  - `notes VARCHAR(500) NULL`
- インデックス追加なし（検索要件はスコープ外、一覧はページング済みデータ表示のみ）

### ドメインルール
1. `notes` は 0..1（未設定可）
2. 500 文字超は保存不可
3. 空文字は永続化時に `NULL` へ正規化
4. 既存 `notes` 未設定行は移行不要（DDL のみ）

### マイグレーション方針
- Prisma migration で `ALTER TABLE website ADD COLUMN notes VARCHAR(500);` を適用。
- 既存データ更新 SQL は不要（NULL 許容）。
- ダウングレード時は `notes` カラム削除でロールバック可能。

### データアクセス層への影響
- `getWebsite`, `getWebsites`, `createWebsite`, `updateWebsite` は Prisma モデル拡張により自動で `notes` を透過的に扱える。
- 追加クエリは不要。既存 repository 境界を維持。

### 根拠（採用理由）
1. Website は既存でも設定属性を保持しており、別テーブル分割より単一カラム追加が最小コスト。
2. 監査・履歴は Out of Scope のため正規化分離は過剰設計。
3. nullable カラム追加なら既存データ無停止で後方互換を維持できる。
