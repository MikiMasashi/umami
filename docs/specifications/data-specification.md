# Data Specification

## US-201 Website notes data model

### Target model
- Prisma model: `Website`
- Current schema file: `prisma/schema.prisma`

### Schema change
`Website` モデルへ notes フィールドを追加する。

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
}
```

### Constraints
- 型: `String?`
- DB 型: `VARCHAR(500)`
- NULL 許容: `true`
- default: なし
- index: 追加しない

### Null / empty string policy
- DB 永続化値は `NULL` または 1〜500文字
- UI から空文字送信時は保存前に `NULL` へ正規化
- 一覧表示と詳細表示は `NULL` を「未設定」として扱う

### Migration policy
- SQL 例:
```sql
ALTER TABLE website ADD COLUMN notes VARCHAR(500) NULL;
```

### Existing records handling
- 既存 record はすべて `notes = NULL` のまま移行
- backfill は不要
- US-201-3 の後方互換要件に合致

### Query impact
- `getWebsite`, `getWebsites`, `getUserWebsites`, `getTeamWebsites` で `notes` が透過的に返る
- Prisma の既定 select を維持できるため、追加 join は不要
- 一覧取得の payload はやや増えるが 500 bytes 上限で影響は限定的

### Design rationale
- **TEXT ではなく VARCHAR(500)**: 要件で上限が確定しており、DB 制約でも守るため。
- **NULL 許容**: 既存データの安全な移行と「未入力」を自然に表現できるため。
- **別テーブル化しない**: 1 website に対して 1 notes の単純属性であり、正規化コストが利益を上回らないため。
