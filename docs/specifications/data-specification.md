# データモデル／データベーススキーマ仕様

このドキュメントは umami のデータモデル・DBスキーマに関する設計の最終成果物である。ストーリーをまたいで蓄積し、各ストーリーで追加・変更した内容を追記していく。

## US-201: ウェブサイトへのメモ（Notes）機能

### 1. スキーマ変更

`prisma/schema.prisma` の `Website` モデルに `notes` カラムを追加する。

```prisma
model Website {
  id        String    @id() @map("website_id") @db.Uuid
  name      String    @db.VarChar(100)
  domain    String?   @db.VarChar(500)
  notes     String?   @db.VarChar(500)   // ★追加: サイト運用者向けの自由記述メモ
  resetAt   DateTime? @map("reset_at") @db.Timestamptz(6)
  ...
}
```

- **カラム名**: `notes`（DBカラム名も `notes`。既存の `name` / `domain` と同様に `@map` を用いた別名は付けず、Prisma側のフィールド名とDBカラム名を一致させる。理由は「設計レビュー」参照）
- **型**: `String?`（NULL許容）
- **DB型**: `VARCHAR(500)`
  - NFR-4「500文字程度の文字列を保持できること」を満たすため、`domain` と同じ `VARCHAR(500)` を採用し、500文字ちょうどを上限とする。
  - PostgreSQL の `VARCHAR(n)` は「文字数」で長さを制限するため、500文字の日本語・絵文字等マルチバイト文字であっても500文字まで格納可能。
- **デフォルト値**: なし（未指定時は `NULL`）。既存レコードは移行時 `NULL` のままとする（マイグレーションでの一括更新は行わない）。
- **NOT NULL制約**: なし（任意項目のため）。

### 2. マイグレーション

既存のマイグレーション運用（`prisma/migrations/<連番>_<説明>/migration.sql`）に従い、新規マイグレーションディレクトリを追加する。

```
prisma/migrations/21_add_website_notes/migration.sql
```

```sql
-- AlterTable
ALTER TABLE "website" ADD COLUMN "notes" VARCHAR(500);
```

- 既存カラムの変更は行わず、追加のみのマイグレーションとする（後方互換性を確保、NFR-3/AC-8対応）。
- カラム追加はデフォルトで `NULL` になるため、既存行への影響はない。
- ロールバック方針: 本カラムは他カラムと依存関係を持たないため、ロールバックが必要な場合は `ALTER TABLE "website" DROP COLUMN "notes";` で復元可能。

### 3. アプリケーション内データ型

- Prisma Client が生成する `Website` 型に `notes: string | null` が自動的に追加される。追加のTypeScript型定義は不要（`@/generated/prisma/client` からの自動生成に追従）。
- API レスポンス型（`GET /api/websites/:id` 等）は Prisma の `Website` 型をそのまま返しているため、`notes` フィールドは自動的にレスポンスへ含まれる（NFR-3: 既存フィールドを維持した上でのフィールド追加）。

### 4. データアクセス層（`src/queries/prisma/website.ts`）

- `createWebsite` / `updateWebsite` は `Prisma.WebsiteCreateInput` / `Prisma.WebsiteUpdateInput` をそのまま Prisma Client に渡す実装のため、`notes` フィールドの追加に伴うコード変更は不要（型定義がPrismaスキーマから自動追従するため）。
- `getWebsites` の検索対象（`getSearchParameters` によるあいまい検索）には `notes` を含めない（要件は表示のみであり、検索・フィルタリングは対象外[2.2 対象外] のため）。

### 5. 文字数バリデーションとカラム長の関係

- サーバー側 zod バリデーション（`api-specification.md` 参照）で `.max(500)` を適用し、DBの `VARCHAR(500)` と上限値を一致させる。
- `VARCHAR(500)` はDBレベルでも500文字を超える書き込みを拒否する（PostgreSQLは超過時に例外を送出）ため、アプリ層のバリデーションとDB制約の二重防御となる。

### 6. 影響範囲まとめ

| 対象 | 変更内容 |
|---|---|
| `prisma/schema.prisma` | `Website.notes` カラム追加（`String? @db.VarChar(500)`） |
| `prisma/migrations/21_add_website_notes/migration.sql` | 新規マイグレーション追加 |
| Prisma生成型 | 自動追従（コード変更不要） |
| `src/queries/prisma/website.ts` | 変更不要（汎用的な `data` 引数の受け渡しのため） |
