# データモデル／データベーススキーマ仕様書

このドキュメントはストーリーをまたいで蓄積される、umami のデータモデル・DBスキーマ設計の最終成果物である。

## US-201: ウェブサイトへのメモ（notes）機能

### 変更方針・根拠

- `Website` モデルに `notes` カラムを1つ追加するのみとし、正規化した別テーブル（例:
  `WebsiteNote`）は作らない。
  → 理由: メモは「ウェブサイト1件につき1つの自由記述テキスト」であり、変更履歴・複数メモ・
  メモごとの権限は要件のスコープ外（Won't）。1:1の属性であれば別テーブルに分離するメリットが
  なく、`getWebsite` / `getWebsites` の JOIN が増えるだけ性能上不利になる
  （非機能要件: 一覧・詳細取得APIのレスポンス時間を有意に劣化させないこと）。
- 却下した代替案: メモを `Report`/`Segment` のような `Json` 型の汎用属性カラムに含める。
  → 却下。メモは単純な文字列であり、専用カラムのほうが型安全性・バリデーション（`max(500)`,
  `VarChar(500)`）・インデックス設計の観点で明快。既存の `domain String? @db.VarChar(500)` と
  同様のパターンを踏襲する。

### Prisma スキーマ変更

`prisma/schema.prisma` の `model Website` に以下のカラムを追加する。

```prisma
model Website {
  id        String    @id() @map("website_id") @db.Uuid
  name      String    @db.VarChar(100)
  domain    String?   @db.VarChar(500)
  notes     String?   @db.VarChar(500)   // 追加
  resetAt   DateTime? @map("reset_at") @db.Timestamptz(6)
  userId    String?   @map("user_id") @db.Uuid
  teamId    String?   @map("team_id") @db.Uuid
  createdBy String?   @map("created_by") @db.Uuid
  createdAt DateTime? @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime? @updatedAt @map("updated_at") @db.Timestamptz(6)
  deletedAt DateTime? @map("deleted_at") @db.Timestamptz(6)

  recorderEnabled Boolean @default(false) @map("recorder_enabled")
  replayConfig    Json?   @map("replay_config")
  // ...既存のリレーション・インデックスは変更なし
}
```

- カラム名は `notes`。`domain` / `name` と同様に単一の英単語であり Prisma のキャメルケース
  フィールド名とスネークケースDBカラム名が一致するため、`@map` は不要（既存の `name`, `domain` と
  同じ扱い）。
- 型は `String? @db.VarChar(500)`。文字数上限（500文字）をDBレベルでも表現し、アプリケーション層
  （zod の `max(500)`）とDB制約の二重の防御とする。
- デフォルト値・`NOT NULL` 制約は設けない（`null` = 未設定を許容）。これにより、既存ウェブサイト
  （マイグレーション実行時点で `notes` カラムは全行 `null`）に対して後方互換性が保たれる
  （受け入れ条件 US-201-2-1, US-201-2-2, US-201-2-3）。

### マイグレーション

- 既存カラム追加のみのマイグレーション（`ALTER TABLE website ADD COLUMN notes VARCHAR(500)`
  相当）。デフォルト値なし・NULL許容のため、既存データへの影響はない
  （ロールバック・ダウンタイムを要しない加算的変更）。
- MySQL/PostgreSQL 両対応の既存の `prisma/schema.prisma` / `prisma/mysql/schema.prisma`
  （データベース種別ごとのスキーマファイルがある場合は両方）に同一の変更を適用すること。
  ※ 本ドキュメントは変更方針を示すものであり、実際のマイグレーションファイル生成は実装フェーズで行う。

### アプリケーション層のデータ取得への影響

- `getWebsite` / `attachShareIdToWebsite`: Prisma が返す `website` オブジェクトに `notes` が
  自動的に含まれるため、追加のクエリ変更は不要（`notes` は Prisma Client の生成型に自動反映される）。
- `getWebsites` / `attachShareIdToWebsites`: 同様に追加クエリ不要。`notes` は選択列を絞っていない
  既存の `findMany` にそのまま含まれる。
- `canUpdate` フィールド（API仕様書参照）は DB由来のカラムではなく、API層で
  `canUpdateWebsite(auth, websiteId)` の結果を都度計算してレスポンスに付与する
  （DBスキーマの変更は不要）。

### 後方互換性の確認

| 受け入れ条件 | データ面での担保 |
|---|---|
| US-201-2-1: 既存サイトの詳細画面表示 | `notes` カラムが `null` でも `getWebsite` はエラーなく返す（型は `string \| null`） |
| US-201-2-2: 既存サイトの一覧表示 | `getWebsites` の `notes: null` の行に対してエラーが発生しない |
| US-201-2-3: メモ以外の項目のみ更新 | `updateWebsite` に `notes` を渡さなければ既存の `notes` 値（`null` を含む）は変更されない（Prisma の部分更新の性質どおり） |
