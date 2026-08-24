# データ仕様書

このドキュメントは umami のデータモデル／データベーススキーマ設計の最終成果物である。
ストーリーをまたいで累積更新する。

---

## US-201: ウェブサイトへのメモ（notes）機能

### 1. スキーマ変更

`prisma/schema.prisma` の `Website` モデルに `notes` カラムを追加する。

```prisma
model Website {
  id        String    @id() @map("website_id") @db.Uuid
  name      String    @db.VarChar(100)
  domain    String?   @db.VarChar(500)
  notes     String?   @db.VarChar(500)   // ← 追加
  resetAt   DateTime? @map("reset_at") @db.Timestamptz(6)
  userId    String?   @map("user_id") @db.Uuid
  teamId    String?   @map("team_id") @db.Uuid
  createdBy String?   @map("created_by") @db.Uuid
  createdAt DateTime? @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime? @updatedAt @map("updated_at") @db.Timestamptz(6)
  deletedAt DateTime? @map("deleted_at") @db.Timestamptz(6)
  ...
}
```

| 項目 | 内容 |
|---|---|
| カラム名 | `notes`（DB列名も `notes`。他カラムのような `@map` は不要、既存の慣例上 snake_case と camelCase が一致するため） |
| 型 | `String?`（NULL許容） |
| 長さ制約 | `@db.VarChar(500)` |
| デフォルト | なし（未指定時は `NULL`） |

**根拠**:
- 既存の `name`（VarChar(100)）・`domain`（VarChar(500)）と同様に、DBレベルでも上限を明示する。アプリケーション層（zod）のバリデーションと二重に守ることで、直接DB操作や将来の別クライアントからの書き込みに対しても不整合を防ぐ（多層防御）。
- `String?`（NULL許容）とすることで、既存レコード（マイグレーション時点で全レコード）は自動的に `notes = NULL` となり、FR-1・FR-5（後方互換性）の要件を満たす。空文字とNULLを区別する要件はないため、未設定は一貫して `NULL` として扱う（アプリ層で空文字保存時は `NULL` に正規化する。3章参照）。
- 既存カラムの変更・削除を伴わない「追加のみ」の変更とし、非機能要件（互換性）を満たす。

### 2. マイグレーション

新規マイグレーション `prisma/migrations/21_add_website_notes/migration.sql` を追加する（既存の連番命名規則 `NN_description` に準拠）。

```sql
-- AlterTable
ALTER TABLE "website" ADD COLUMN "notes" VARCHAR(500);
```

**根拠**:
- 既存マイグレーション（`19_add_session_replay`、`20_add_heatmap` 等）は単純な `ALTER TABLE ... ADD COLUMN` パターンを踏襲しており、本変更も同様の非破壊的な追加のみのDDLとする。
- カラム追加はテーブルロックが軽微（PostgreSQLではNULL許容かつデフォルト値なしの列追加はメタデータ変更のみで完了）であり、既存データの書き換えを伴わないためロールバックも `ALTER TABLE ... DROP COLUMN "notes"` のみで容易（非機能要件「運用性」を満たす）。

### 3. アプリケーション層でのデータ正規化

- 保存時、空文字（`''`）が送信された場合はサーバー側で `null` に正規化してDB保存する（FR-2 の「メモ欄を空にして保存」要件、および表示側の「未設定＝非表示」ロジックをNULL判定に一本化するため）。
- 文字数カウントは JavaScript の `String.prototype.length`（UTF-16コード単位）を基準とする。umami の既存テキスト項目（`name`, `domain` 等）も同様に `.length` ベースの単純なバリデーションに準拠しており、書記素クラスタ単位の厳密なカウントは行わない（要件定義書 8章-2 の方針に準拠）。

### 4. Prisma生成型への影響

- `@/generated/prisma/client` の `Website` 型に `notes: string | null` が自動的に追加される（Prismaのコード生成により、手動でのTypeScript型定義追加は不要）。
- `Prisma.WebsiteUpdateInput` / `Prisma.WebsiteUncheckedUpdateInput` にも `notes?: string | null` が自動追加され、`updateWebsite()`（`src/queries/prisma/website.ts`）はそのまま `notes` を含むデータを受け取れる（クエリ関数自体の変更は不要）。

### 5. 却下した代替案

| 代替案 | 却下理由 |
|---|---|
| 別テーブル `WebsiteNote` を新設し1:1関連にする | メモは単一の自由記述フィールドであり、検索・履歴等の拡張要件（対象外と明記）がない現時点では過剰設計。JOINのオーバーヘッドと実装コストが見合わない。将来「変更履歴」要件が生まれた場合に限り、正規化テーブルへの分離を再検討する。 |
| `Json` 型で `notes` 以外のメタ情報も含む汎用フィールドにする | 型安全性が下がり、500文字上限のDBレベル制約（`VarChar`）も付けられなくなる。要件はプレーンテキストのみであり、単純な `String?` で十分。 |
| `TEXT` 型（無制限長）にし、上限はアプリ層のみで制御 | 非機能要件「入力検証：フロントとサーバー両方で検証し、片方のみに依存しない」の趣旨から、DBレベルでも上限を明示する方が堅牢（多層防御）。既存の `domain VarChar(500)` の慣例とも整合する。 |
