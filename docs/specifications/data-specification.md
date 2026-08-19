# Data Specification

## US-201: ウェブサイトメモ

### 設計方針

ウェブサイトメモは `Website` エンティティの属性として `website` テーブルにカラムを追加する。別テーブルは作成しない。

理由は、メモが履歴・検索・複数件管理を持たない単一の設定値であり、一覧・詳細表示で Website と常に同時に必要になるため。別テーブル化すると JOIN または追加クエリが必要になり、MVP の要件に対して運用・実装コストが高い。

### Prisma モデル

`prisma/schema.prisma` の `Website` モデルに以下を追加する。

```prisma
model Website {
  id        String    @id() @map("website_id") @db.Uuid
  name      String    @db.VarChar(100)
  domain    String?   @db.VarChar(500)
  notes     String?   @db.VarChar(500)
  resetAt   DateTime? @map("reset_at") @db.Timestamptz(6)
  userId    String?   @map("user_id") @db.Uuid
  teamId    String?   @map("team_id") @db.Uuid
  createdBy String?   @map("created_by") @db.Uuid
  createdAt DateTime? @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime? @updatedAt @map("updated_at") @db.Timestamptz(6)
  deletedAt DateTime? @map("deleted_at") @db.Timestamptz(6)

  @@map("website")
}
```

### DB スキーマ

| テーブル | カラム | 型 | NULL | 制約 | 説明 |
| --- | --- | --- | --- | --- | --- |
| `website` | `notes` | `varchar(500)` | 可 | なし | ウェブサイトごとの自由記述メモ。 |

既存レコードはマイグレーション後に `notes = null` となる。既存データのバックフィルは不要。

### マイグレーション方針

PostgreSQL 向けには nullable カラム追加のみを行う。

```sql
ALTER TABLE "website" ADD COLUMN "notes" VARCHAR(500);
```

MySQL など Prisma がサポートする既存 DB 方言でも同等の nullable `VARCHAR(500)` とする。`NOT NULL DEFAULT ''` は採用しない。

理由は、未設定状態を `null` で表現すると「メモなし」と「空文字が保存された状態」を区別せず扱いやすく、既存行へのロック・書き換え量も抑えられるため。

### ドメインモデル

| モデル | 属性 | 説明 |
| --- | --- | --- |
| `Website` | `notes?: string | null` | ウェブサイト運用者向けの補足メモ。最大 500 文字。 |

ドメインルール:

1. `notes` の最大長は 500 文字。
2. 未入力、空文字、空白のみは `null` に正規化する。
3. 更新権限は Website の更新権限に従う。
4. 一覧表示では `null` の場合にメモ UI を出さない。

### インデックス・検索

`notes` にはインデックスを作成しない。US-201 ではメモ本文の検索、フィルタ、ソートは対象外であり、`VARCHAR(500)` の自由記述にインデックスを張っても一覧表示性能の改善に寄与しないため。

既存の `getWebsites` 検索対象も `name` と `domain` のままとし、`notes` は検索対象に含めない。

### データ保持・セキュリティ

メモはウェブサイト設定情報として扱い、参照・更新の公開範囲は Website と同一にする。メモに機密情報を入力しない前提の通常設定値であり、暗号化や監査ログ追加は US-201 の対象外とする。

将来、メモ履歴や監査が必要になった場合は `website_note_history` のような履歴テーブルを追加する余地を残すが、MVP では単一カラムで十分。

