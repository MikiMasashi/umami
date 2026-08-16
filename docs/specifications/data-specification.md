# データモデル / DB スキーマ 設計仕様書: umami

- 対象プロダクト: umami
- 管理方針: ストーリーをまたいで蓄積する最終成果物
- 最終更新: US-201

---

## 1. 方針

データモデルは Prisma（`prisma/schema.prisma`）を単一の情報源とし、DB は PostgreSQL。
既存の物理カラム名は `@map` によりスネークケースへマップされる。マイグレーションは
`prisma migrate` を用い、**既存レコードを破壊せず・ダウンタイムなし**で適用できることを要件とする。

---

## 2. US-201: `Website.notes`

### 2.1 スキーマ変更

`Website` モデルに任意テキストのメモ列を 1 つ追加する。

```prisma
model Website {
  id        String    @id() @map("website_id") @db.Uuid
  name      String    @db.VarChar(100)
  domain    String?   @db.VarChar(500)
  notes     String?   @db.VarChar(500) @map("notes")   // ★US-201 追加
  // …既存フィールドは変更しない…
}
```

| 項目 | 決定 | 根拠 |
| --- | --- | --- |
| フィールド名 | `notes` | 要件・既存 UI 文言と整合。API/フォームの識別子とも一致 |
| 型 | `String?`（NULL 許容） | 任意入力・後方互換（NFR-3, FR-6）。未設定は `NULL` |
| 物理長 | `VarChar(500)` | 上限 500 **コードポイント**（OQ-1）。DB でも上限を担保し肥大化を防ぐ |
| 物理名 | `notes` | 既存の命名規則（スネークケース）に整合 |
| インデックス | 付与しない | 検索・並び替え対象外（スコープ 4.2）。NFR-4 の観点でも不要 |

> 補足: `VarChar(500)` はコードポイントではなくバイト長ではなく「文字数」で数える
> PostgreSQL の仕様に一致する（`character varying(n)` は n 文字）。アプリ側の zod でも
> `.max(500)`（コードポイント数）で二重に検証する。絵文字などサロゲートペアの扱いは
> zod の `string.max`（JS の length ではなく zod はコードポイント単位で評価）で統一する。

### 2.2 マイグレーション（安全性）

```sql
ALTER TABLE "website" ADD COLUMN "notes" VARCHAR(500);
```

- 追加列はデフォルト `NULL`。既存行は自動的に `notes = NULL`（未設定）となり、
  既存データの書き換え・ロックを伴わない（NFR-3, AC-8）。
- ロールバックは `DROP COLUMN "notes"` で可能。

### 2.3 データ正規化ルール

- 保存前にトリム（前後空白・改行）を行い、**トリム後に空なら `NULL`** として保存する
  （OQ-2, FR-7, AC-9）。この正規化は API 層（zod `transform`）で実施し、DB には
  「非空文字列」または「NULL」のみが入る状態を保つ。
- 文字数はコードポイント数で 500 まで（OQ-1）。

### 2.4 読み取り経路

- 詳細取得（`getWebsite`）・一覧取得（`getWebsites` 系）はいずれも Prisma の
  `website` レコードをそのまま返すため、列追加のみで `notes` が各経路に伝播する。
  追加のクエリ・JOIN は不要（NFR-4）。
