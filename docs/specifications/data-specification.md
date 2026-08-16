# データモデル / データベーススキーマ設計仕様書

対象プロダクト: **umami** / 実装領域: `prisma` / `src`

本書は各ユーザーストーリーをまたいで蓄積するデータモデルの最終成果物である。設計判断の根拠を併記する。設計レビューの過程・懸念点は `reviews/` 配下に記録する。

---

## US-201: ウェブサイトへのメモ（notes）機能

### 1. 変更対象モデル

`prisma/schema.prisma` の `model Website` に、任意（nullable）のテキストフィールド `notes` を1つ追加する。別テーブルは作成しない。

### 2. スキーマ定義（最終形）

`model Website` に以下のフィールドを追加する（`domain` の直後に並べ、既存の命名・記法に馴染ませる）。

```prisma
model Website {
  id        String    @id() @map("website_id") @db.Uuid
  name      String    @db.VarChar(100)
  domain    String?   @db.VarChar(500)
  notes     String?   @db.VarChar(500)          // ← 追加
  resetAt   DateTime? @map("reset_at") @db.Timestamptz(6)
  // ... 既存フィールドは変更しない
}
```

| 属性 | 値 | 根拠 |
| --- | --- | --- |
| フィールド名 | `notes` | 要件の確定命名。`name` / `domain` と同様のスネーク不要なキャメルフィールド名に合わせる。 |
| 型 | `String?`（nullable / optional） | AC-5.3・AC-1.4。未設定を許容し、後方互換を担保する。 |
| DBカラム | `@db.VarChar(500)` | AC-2.1〜2.3 の上限500文字に整合。`domain` が `VarChar(500)` を採用しているのと同様の記法。DB層でも上限を担保し多層防御とする。 |
| カラム物理名 | `notes`（`@map` 不要） | 論理名と物理名が一致するため `@map` は付けない。`recorderEnabled` 等 camelCase フィールドは `@map` を付けているが、`notes` は単語1語で衝突しないため `name` / `domain` と同じく `@map` 省略が自然。 |
| index | 付けない | 検索・ソート・フィルタ対象外（要件2.2 Won't）。索引は不要でありコスト増を避ける。 |

> 注: `@db.VarChar(500)` は「JS の `String.length` で500」というアプリ要件（Q1）と厳密には単位が異なる（DBは文字数/バイトではなく文字数指定だが、サロゲートペアや結合文字で `length` と一致しない場合がある）。**正準的な上限判定はサーバ側 zod（`z.string().max(500)`）で行い**、DBの `VarChar(500)` は保険（防御的制約）とする。両者の関係はレビュー文書に記載。

### 3. マイグレーション方針

- Prisma マイグレーションを1本追加する（`prisma migrate` により `ALTER TABLE "website" ADD COLUMN "notes" VARCHAR(500);` 相当が生成される）。
- 追加カラムは NULL 許容のため、既存行はすべて `notes = NULL` となり、既存データ・既存挙動に影響を与えない（AC-5.1 / AC-5.2）。
- ダウンタイム不要（nullable カラム追加のみ、デフォルト値・バックフィル不要）。

### 4. データライフサイクル・整合性

| 観点 | 設計 | 根拠 |
| --- | --- | --- |
| カーディナリティ | Website 1 : notes 1（単一フィールド） | 要件2.2「複数メモは対象外」。 |
| 削除時の扱い | 同一テーブルのカラムのため Website 削除で自動的に消える。`deleteWebsite` / `resetWebsite` の変更は不要。 | 非機能「別テーブルにしない前提では自動」。 |
| NULL と 空文字 | トリム後空文字は「未設定」を意味する。保存値は `null` に正規化することを推奨（レビュー参照）。表示層は `null`/空 のどちらも「メモなし」として扱う。 | Q5・AC-1.4・AC-3.3。 |
| 既存カラムへの影響 | なし。`name` / `domain` 等の型・制約は不変。 | AC-5.2。 |

### 5. 生成型への波及

- `prisma generate` により `@/generated/prisma/client` の `Website` 型に `notes: string | null` が自動追加される。
- `updateWebsite(websiteId, data)`（`src/queries/prisma/website.ts`）は `Prisma.WebsiteUpdateInput` を受けるため、`notes` は型変更なしでそのまま渡せる。クエリ関数の改修は不要。

### 6. 保持しない / 変更しない事項

- 履歴・版管理テーブルは作らない（Won't）。
- 全文検索インデックス・`getSearchParameters` への `notes` 追加は行わない（検索対象外）。
