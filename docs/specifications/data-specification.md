# データモデル／データベーススキーマ設計仕様書

このドキュメントはデータモデル・DB スキーマ設計の最終成果物であり、ストーリーをまたいで蓄積される。

## 1. 既存モデル: Website（抜粋）

```prisma
model Website {
  id        String    @id() @map("website_id") @db.Uuid
  name      String    @db.VarChar(100)
  domain    String?   @db.VarChar(500)
  resetAt   DateTime? @map("reset_at") @db.Timestamptz(6)
  userId    String?   @map("user_id") @db.Uuid
  teamId    String?   @map("team_id") @db.Uuid
  createdBy String?   @map("created_by") @db.Uuid
  createdAt DateTime? @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime? @updatedAt @map("updated_at") @db.Timestamptz(6)
  deletedAt DateTime? @map("deleted_at") @db.Timestamptz(6)

  recorderEnabled Boolean @default(false) @map("recorder_enabled")
  replayConfig    Json?   @map("replay_config")
  ...
}
```

## 2. US-201: notes カラムの追加

### 2.1 スキーマ変更（`prisma/schema.prisma`）

```prisma
model Website {
  ...
  domain    String?   @db.VarChar(500)
  notes     String?   @db.VarChar(500)   // 追加: サイト運用メモ（自由記述）
  resetAt   DateTime? @map("reset_at") @db.Timestamptz(6)
  ...
}
```

- 論理名: `notes`（要件定義書と同一の呼称を採用し、フロント・API・DB間で命名を統一する）。
- 物理カラム名: `notes`（他の単純な文字列カラム `name` / `domain` に倣い、`@map` によるスネークケース変換は Prisma のデフォルト命名規則により不要。既存の `Website` モデルの命名慣習上、単語1つのフィールドには `@map` を付けていない例（`name`, `domain`）に倣う）。
- 型: `String?`（nullable）。既存データは自動的に `NULL` となり、後方互換性を確保する（US-201-5）。
- 長さ制約: `@db.VarChar(500)` として DB レベルでも上限を強制し、アプリケーション層のバリデーション（500文字）と二重に保護する。`domain` (`VarChar(500)`) と同じ上限値を採用し、既存の型使用パターンと整合させる。
- デフォルト値: 設定しない（`NULL` が「メモ未設定」を表す。空文字列 `''` とは区別せず、API 層では空文字列も `NULL` 相当として扱ってよい。詳細は data-specification.md §3）。
- インデックス: 追加しない。メモは検索・フィルタ対象外（要件の対象外スコープに明記）であり、インデックスを張るとメモの自由記述な長文更新のたびに無駄なインデックス更新コストが発生するため。

### 2.2 マイグレーション（案）

`prisma/migrations/21_add_website_notes/migration.sql`（次の連番として新規追加）:

```sql
-- AlterTable
ALTER TABLE "website" ADD COLUMN "notes" VARCHAR(500);
```

- `NOT NULL` 制約を付けない・デフォルト値を設定しないことで、既存レコードに対するマイグレーション実行時に追加のデータバックフィルが不要となり、ロック時間・移行リスクを最小化する。
- 列追加のみのシンプルな `ALTER TABLE` であり、大規模テーブルであってもテーブル全体の書き換えを伴わない（PostgreSQL では nullable かつデフォルト値なしの列追加はメタデータ変更のみで完了する）。

## 3. アプリケーション層でのデータ取り扱い

### 3.1 文字数カウントの方式

- 「500文字」は JavaScript の文字列長（UTF-16 コードユニット数、`string.length`）でカウントする。既存の `name`（100文字）・`domain`（500文字）のバリデーションも同様に `z.string().max(n)` で `.length` ベースの判定をしているため、実装の一貫性を優先する。
- 絵文字（サロゲートペア）等で見た目の文字数と `.length` の値がずれるケースがあるが、要件（§7-5）で「特別な文字種制限は設けない」とされているため、既存踏襲のシンプルな方式を採用し、将来的な改善余地として本設計では対応しない。

### 3.2 空文字列と null の扱い

- クライアント（フォーム）からの入力が空文字列 `''` の場合、API は `null` に正規化して保存する（「メモ欄を空にして保存 → エラーにならず未入力として保存される」という US-201-1 の受け入れ条件を満たすため）。
- 一覧・詳細の読み取り時は `null` と `''` を同一に扱い、いずれも「メモなし」として UI 上非表示にする（UI 側の実装詳細は architecture-specification.md / frontend 実装に委譲）。

## 4. 設計判断の根拠まとめ

| 判断 | 根拠 |
|---|---|
| 既存 `Website` テーブルへのカラム追加（別テーブル化しない） | 1対1関係で将来的な複数メモ・履歴管理が対象外（Won't）と明示されているため、正規化コストに見合うメリットがない。 |
| `String? @db.VarChar(500)` | 上限500文字という要件を DB 制約でも保証し、アプリケーション層のバリデーション漏れに対する防御的多重化（defense in depth）を図る。 |
| デフォルト値なし・NOT NULL 制約なし | 既存レコードへの後方互換性（US-201-5）を、マイグレーション時の特別なバックフィル処理なしに自然に満たすため。 |
| インデックスなし | メモは検索・フィルタ対象外（対象外スコープ）であり、不要なインデックスは書き込みコストを増やすだけ。 |

## 5. 却下した代替案

| 代替案 | 却下理由 |
|---|---|
| `Text` 型（無制限長）で保存しアプリ層のみでバリデーション | 要件の非機能要件で「クライアント・サーバー両方で検証する」とあり、DB 制約による保証を併用する方が堅牢。将来的にバリデーションロジックにバグがあっても DB 制約が最終防衛線として機能する。 |
| JSON カラム（`replayConfig` のように）でメモをラップして格納 | メモは単一のプレーンテキストであり、構造化データではないため、JSON化はオーバーヘッドとクエリの複雑化を招くのみ。 |
| `notes` の代わりに `memo` という物理名を採用 | 要件定義書が論理名として一貫して「notes」を使用しており、物理名を variants にすると API レスポンスのフィールド名と要件文書の用語が乖離し、可読性・トレーサビリティが低下する。 |
