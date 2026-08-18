# データモデル・DB スキーマ仕様書 - ウェブサイトメモ機能

**バージョン**: 1.0  
**最終更新**: 2026-08-18  
**ステータス**: 確定

---

## 1. 概要

本仕様は、Umami のウェブサイト管理機能に「メモ」機能を追加する際のデータモデル及び DB スキーマ設計を定義します。

### 設計原則

- **最小限の変更**: 既存の Website テーブルに note 列を追加するのみ
- **バックワード互換性**: NULL デフォルト値で既存レコードをカバー
- **データ整合性**: note は Website エンティティの属性として扱う
- **パフォーマンス**: インデックス不要（検索機能はスコープ外）

---

## 2. Prisma スキーマ設計

### 2.1 Website モデルの変更

#### 現在のモデル（抜粋）

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

  user                User?               @relation("user", fields: [userId], references: [id])
  createUser          User?               @relation("createUser", fields: [createdBy], references: [id])
  team                Team?               @relation(fields: [teamId], references: [id])
  // ... その他の関連テーブル
}
```

#### 変更後のモデル

```prisma
model Website {
  id        String    @id() @map("website_id") @db.Uuid
  name      String    @db.VarChar(100)
  domain    String?   @db.VarChar(500)
  note      String?   @db.VarChar(500)      // ★ 新規追加
  resetAt   DateTime? @map("reset_at") @db.Timestamptz(6)
  userId    String?   @map("user_id") @db.Uuid
  teamId    String?   @map("team_id") @db.Uuid
  createdBy String?   @map("created_by") @db.Uuid
  createdAt DateTime? @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime? @updatedAt @map("updated_at") @db.Timestamptz(6)
  deletedAt DateTime? @map("deleted_at") @db.Timestamptz(6)

  recorderEnabled Boolean @default(false) @map("recorder_enabled")
  replayConfig    Json?   @map("replay_config")

  user                User?               @relation("user", fields: [userId], references: [id])
  createUser          User?               @relation("createUser", fields: [createdBy], references: [id])
  team                Team?               @relation(fields: [teamId], references: [id])
  // ... その他の関連テーブル
}
```

### 2.2 フィールド仕様

#### `note` フィールド

| 属性 | 値 |
|---|---|
| **フィールド名** | note |
| **データベース列名** | note |
| **型** | String? (nullable) |
| **DB型** | VARCHAR(500) |
| **デフォルト値** | NULL |
| **インデックス** | なし |
| **制約** | MAX_LENGTH = 500 |
| **説明** | ウェブサイトに関する自由記述のメモ。NULL = メモなし |

### 2.3 フィールド配置

**配置位置**: domain 列の直後（関連情報としてまとまりやすい）

```prisma
model Website {
  id        String    @id() @map("website_id") @db.Uuid
  name      String    @db.VarChar(100)
  domain    String?   @db.VarChar(500)
  note      String?   @db.VarChar(500)      // ← ここに配置
  resetAt   DateTime? @map("reset_at") @db.Timestamptz(6)
  // ...
}
```

---

## 3. PostgreSQL スキーマ

### 3.1 DDL（Data Definition Language）

#### テーブル定義

```sql
-- 既存の website テーブルに note 列を追加
ALTER TABLE website
ADD COLUMN note VARCHAR(500) DEFAULT NULL;
```

#### 制約の確認

```sql
-- 文字数制約は NOT NULL、CHECK 制約ではなく、アプリレイヤーで実施
-- DB 側の字数制約: VARCHAR(500) で自動的に 500 文字以上は拒否される

-- インデックスなし（メモの検索機能はスコープ外）

-- NOT NULL 制約なし（メモは未設定サイトを許容）
```

---

## 4. マイグレーション戦略

### 4.1 Prisma マイグレーション手順

#### ステップ 1: スキーマ修正

`prisma/schema.prisma` に note フィールドを追加:

```prisma
model Website {
  // ... 既存フィールド
  domain    String?   @db.VarChar(500)
  note      String?   @db.VarChar(500)      // ★ 追加
  resetAt   DateTime? @map("reset_at") @db.Timestamptz(6)
  // ...
}
```

#### ステップ 2: マイグレーション作成

```bash
cd /repo
npx prisma migrate dev --name add_website_note
```

**出力確認項目**:
- マイグレーション SQL が正しいか確認
- 既存レコードへの影響がないか確認（NULL デフォルト値）

#### ステップ 3: マイグレーション適用

```bash
npx prisma migrate deploy
```

### 4.2 既存環境への適用順序

1. **テスト環境**: マイグレーション実施・テスト実施
2. **ステージング環境**: 本番前検証
3. **本番環境**: 本番環境に適用（バックアップ推奨）

---

## 5. データモデルの設計判断

### 5.1 NULL vs 空文字列

**決定**: NULL を採用

**理由**:
1. 「メモなし」を明確に表現（NULL = 未設定）
2. 既存の umami パターンと一致（domain, resetAt など NULL 許容の先例あり）
3. UI の表現が単純（空白 vs「メモなし」表示の統一）

**実装**:
- DB: NOT NULL 制約なし、DEFAULT NULL
- アプリ: note が null か undefined の場合は「メモなし」として扱う
- API: note: null として返却（空文字列ではなく）

### 5.2 VARCHAR(500) vs TEXT

**決定**: VARCHAR(500) を採用

**根拠**:
1. 要件: メモの上限は 500 文字
2. DB サイズ: VARCHAR(500) で十分（TEXT より効率的）
3. 制約の明確化: DB レイヤーで 500 文字上限を強制
4. パフォーマンス: インデックス不要だが、固定サイズ制約が保証される

**将来の拡張性**:
- マークダウン対応・検索機能追加時: TEXT への変更検討（ただし本機能スコープ外）

### 5.3 インデックス戦略

**決定**: インデックスなし

**理由**:
1. 要件: メモの検索・フィルター機能はスコープ外（将来検討）
2. クエリパターン: ウェブサイト取得時は websiteId で主キーを使用
3. パフォーマンス影響: note フィールドの取得コストは無視可能（VARCHAR(500)）

**将来検討**:
- メモ検索機能が必要になった場合、FULLTEXT インデックスを検討
- その際は別 turn で設計をやり直す

---

## 6. バックワード互換性

### 6.1 既存システムへの影響

| 項目 | 影響 | 対応方法 |
|---|---|---|
| 既存レコード | note = NULL で初期化 | DB マイグレーション実施 |
| 既存コード | note フィールドを読まない | コード変更なし（null-safe） |
| API レスポンス | note フィールド追加 | クライアントは note を無視可能 |
| クライアント | note フィールド表示コード追加 | 段階的に UI を追加 |

### 6.2 テスト方針

**確認項目**:
1. メモあり・メモなしサイトが混在している場合の表示
2. 既存レコード取得時に null が正しく返却されるか
3. API エラー（不正なリクエスト）の処理

---

## 7. TypeScript 型定義

### 7.1 生成される型

Prisma Client は自動的に以下を生成:

```typescript
// @generated/prisma/client
type Website = {
  id: string;
  name: string;
  domain: string | null;
  note: string | null;     // ★ 新規
  resetAt: Date | null;
  userId: string | null;
  teamId: string | null;
  createdBy: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  deletedAt: Date | null;
  recorderEnabled: boolean;
  replayConfig: Prisma.JsonValue | null;
};
```

### 7.2 バリデーション型（zod）

```typescript
// 更新リクエストのスキーマ
const websiteUpdateSchema = z.object({
  name: z.string().max(100).optional(),
  domain: z.string().max(500).optional(),
  note: z.string().max(500).nullable().optional(),  // ★ 新規
  shareId: z.string().max(50).nullable().optional(),
  replayConfig: z.object({
    replayEnabled: z.boolean().optional(),
    heatmapEnabled: z.boolean().optional(),
    sessionSampleRate: z.number().optional(),
  }).optional(),
});
```

---

## 8. パフォーマンス・スケーラビリティ

### 8.1 ストレージ効率

```
データベースサイズ計算例:

Website テーブル: 100,000 レコード
平均メモ長: 100 文字（日本語の場合、1 文字 = 3 バイト） = 300 バイト

追加ストレージ: 100,000 × 300 bytes ≈ 30 MB

結論: ストレージへの影響無視可能
```

### 8.2 クエリパフォーマンス

```sql
-- 一覧取得クエリ例
SELECT id, name, domain, note, createdAt, userId 
FROM website 
WHERE user_id = $1 
ORDER BY name ASC 
LIMIT 20;

-- note を追加しても、既存の createdAt インデックスで十分
-- 実行計画: INDEX_SCAN(website.user_id) + LIMIT
```

---

## 9. データバリデーション

### 9.1 アプリケーションレイヤー

```typescript
// zod による入力検証
const noteSchema = z.string()
  .max(500, { message: "Note must be 500 characters or less" })
  .nullable()
  .optional();

// 空文字列を null に正規化
const normalizedNote = note === "" ? null : note;
```

### 9.2 データベースレイヤー

```sql
-- PostgreSQL のネイティブ制約
ALTER TABLE website 
ADD CONSTRAINT website_note_max_length CHECK (LENGTH(note) <= 500);
```

**注**: CHECK 制約は任意。Prisma マイグレーション時に含めるかどうかは実装フェーズで判断。

---

## 10. セキュリティ考慮

### 10.1 SQL インジェクション

**対策**: Prisma ORM のパラメータ化クエリで自動対応。

```typescript
// Prisma で SQL インジェクション防止
await prisma.website.update({
  where: { id: websiteId },
  data: { note: userInput },  // 自動的にエスケープ
});
```

### 10.2 XSS 対策

**対策**: note はプレーンテキストのみ。Next.js の自動エスケープで対応。

```typescript
// React コンポーネント内で自動エスケープ
<div>{website.note}</div>  // HTML エスケープが自動的に適用される
```

---

## 11. 実装チェックリスト

### Prisma スキーマ

- [ ] `prisma/schema.prisma` に `note String? @db.VarChar(500)` を追加
- [ ] 配置位置: domain 列の直後

### マイグレーション

- [ ] `npx prisma migrate dev --name add_website_note` を実行
- [ ] 生成されたマイグレーション SQL を確認
- [ ] テスト環境で正常に適用されるか確認

### 型定義

- [ ] Prisma Client が自動生成（マイグレーション後に `npx prisma generate`）
- [ ] 型エラーがないか確認

### バリデーション

- [ ] zod スキーマに note フィールド追加
- [ ] バリデーション エラーメッセージ: "Note must be 500 characters or less"

---

## 12. 関連ドキュメント

- `docs/specifications/api-specification.md` - API 設計
- `docs/specifications/architecture-specification.md` - 全体アーキテクチャ
- `docs/requirements/requirement-US-201.md` - 要件定義書

