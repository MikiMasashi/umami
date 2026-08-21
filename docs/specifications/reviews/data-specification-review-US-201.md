# データモデル設計レビュー結果 - US-201

**レビュアー**: Backend Architect  
**レビュー日**: 2026-08-18  
**対象ドキュメント**: `docs/specifications/data-specification.md`  
**ステータス**: 承認

---

## 1. 設計の総合評価

### 評価結果

| 項目 | 評価 | 備考 |
|---|---|---|
| **スキーマ設計** | ✅ 適切 | VARCHAR(500) で要件を満たす |
| **バックワード互換性** | ✅ 優秀 | NULL デフォルト値で既存レコード自動カバー |
| **パフォーマンス** | ✅ 最適 | インデックス不要、ストレージ効率良好 |
| **拡張性** | ✅ 良好 | 将来のマークダウン・検索機能に対応可能 |
| **実装可能性** | ✅ 高い | マイグレーション手順が明確 |

**結論**: データモデル設計は堅牢で、実装準備が整っている状態です。

---

## 2. 主要な設計判断と根拠

### 2.1 VARCHAR(500) vs TEXT の選択

**判断**: VARCHAR(500) を採用

**検討プロセス**:

1. **要件確認**: メモの上限は 500 文字（要件明示）
2. **フィールドの性質**: 
   - 自由記述テキスト（テキストエリア入力）
   - 検索・フィルター機能なし（現在）
   - 表示用途が主（一覧・詳細画面）

**決定理由**:
- VARCHAR(500): 文字数制約を DB レイヤーで強制、パフォーマンス最適
- TEXT: 無制限で柔軟だが、将来的な仕様変更リスク

**トレードオフ分析**:

| 項目 | VARCHAR(500) | TEXT |
|---|---|---|
| 要件適合性 | ✅ 500文字制限を強制 | △ 上限がない |
| DB 効率 | ✅ 最適 | △ オーバーヘッド |
| インデックス | 容易（BTREE） | 困難（FULLTEXT のみ） |
| 拡張性 | △ 将来増加時は ALTER | △ 無制限で増加リスク |
| 既存パターン | ✅ domain も VARCHAR(500) | ❌ 例がない |

**代替案と却下理由**:

- **案A**: TEXT を採用して無制限で対応
  - 却下理由: 要件の 500 文字上限を無視。将来的に制御不能。

- **案B**: CHAR(500) で固定長確保
  - 却下理由: 短いメモの場合、無駄なストレージ。VARCHAR がベター。

**最終決定**: VARCHAR(500)（堅牢で将来の拡張にも対応可能）

---

### 2.2 NULL vs 空文字列 の選択

**判断**: NULL を採用（メモなし = NULL）

**検討プロセス**:

1. **実装パターン確認**: 既存の domain, resetAt などが NULL 許容
2. **ユースケース分析**:
   - 「メモなし」と「空文字列のメモ」を区別する必要があるか → **不要**
   - UI 上はどう表現するか → 「-」またはグレーアウト

**決定理由**:

| 項目 | NULL | 空文字列 |
|---|---|---|
| 「メモなし」の明確性 | ✅ 明確 | △ 曖昧 |
| DB 効率（ストレージ） | ✅ NULL は格納効率良 | △ 空文字列も領域確保 |
| UI 表現の単純性 | ✅ null ? "-" : note | △ note.length === 0 ? "-" : note |
| 既存パターンとの整合 | ✅ domain, resetAt も NULL 許容 | ❌ 異なるパターン |
| SQL での条件判定 | ✅ WHERE note IS NULL | △ WHERE note = '' |

**代替案と却下理由**:

- **案A**: 常に文字列を格納（メモなしは空文字列）
  - 却下理由: NULL 許容フィールドの既存パターンに非準拠。UI 実装が煩雑。

- **案B**: NOT NULL 制約で DEFAULT "" を指定
  - 却下理由: 要件上「メモなし」状態が存在する。NULL 許容が適切。

**最終決定**: NULL（既存パターン踏襲、実装シンプル）

---

### 2.3 マイグレーション戦略

**判断**: 段階的なマイグレーション手順を採用

**マイグレーション手順**:

1. **Prisma スキーマ更新**: note フィールドを追加
2. **マイグレーション作成**: `npx prisma migrate dev --name add_website_note`
3. **マイグレーション確認**: SQL ステートメント検査
4. **環境別適用順序**:
   - テスト → ステージング → 本番（段階的）

**理由**:
- 本番データベースへのロールバック対応が容易
- 既存レコードへの影響を段階的に検証
- バックアップ取得のタイミング確保

---

## 3. スキーマ設計の詳細検証

### 3.1 フィールド配置の検証

**配置案**:
```prisma
model Website {
  id        String
  name      String    @db.VarChar(100)
  domain    String?   @db.VarChar(500)
  note      String?   @db.VarChar(500)    ← 提案位置
  resetAt   DateTime?
  // ...
}
```

**検証項目**:
- ✅ 関連情報として domain の直後に配置（論理的グループ化）
- ✅ NULL 許容フィールド群の中に統一
- ✅ タイムスタンプ（createdAt など）の前に配置（属性情報の整理）

**代替案**:
- domain の代わりに resetAt の後 → ❌ 理由: 属性情報が散在する

**結論**: 提案位置（domain 直後）が最適

---

### 3.2 インデックス戦略の妥当性

**検討対象**: note フィールドへのインデックス

**決定**: インデックスなし

**根拠**:
1. **検索機能がスコープ外**: 要件で「メモ検索」は将来検討
2. **クエリパターン**:
   - GET /api/websites/{websiteId}: 主キー (id) で取得
   - GET /api/websites: 外部キー (user_id) で取得
   - → どちらも note 列での検索なし

3. **パフォーマンス影響**:
   ```sql
   -- note にインデックスなし
   SELECT * FROM website WHERE user_id = $1 AND deleted_at IS NULL
   -- Index: (user_id, deleted_at, name)
   -- → note のインデックスは不要
   ```

**ストレージコスト**:
- インデックス作成時: +30MB（100,000 レコード × 500 バイト）
- インデックス維持: 更新時にインデックスも更新（オーバーヘッド）

**将来的な検討**:
メモ検索機能が実装される場合:
```sql
-- 全文検索インデックス
CREATE INDEX idx_website_note_fts ON website USING GIN(
  to_tsvector('japanese', note)
);
```

**結論**: 現在はインデックス不要。将来的に検索機能追加時に検討。

---

## 4. バックワード互換性の検証

### 4.1 既存レコードへの影響

**マイグレーション実施時のデータ状態**:

```sql
-- マイグレーション前（既存サイト 100 件）
SELECT COUNT(*) FROM website WHERE user_id = 'user-123';
-- 結果: 100

-- マイグレーション後
SELECT COUNT(*), COUNT(CASE WHEN note IS NULL THEN 1 END) 
FROM website WHERE user_id = 'user-123';
-- 結果: 100, 100 (全レコードで note = NULL)
```

**テスト確認項目**:

| テストケース | 期待結果 | 優先度 |
|---|---|---|
| メモなしサイトの取得 | note: null で返却 | 🔴 必須 |
| メモなしサイトの詳細表示 | メモフィールド空欄 | 🔴 必須 |
| メモなしサイトの編集 | エラーなし、NULL → null に更新 | 🟡 重要 |
| メモあり・なしの混在表示 | 両方が正常に表示 | 🟡 重要 |

**リスク**: 低（NULL のデフォルト値で既存レコード自動カバー）

### 4.2 既存コードの互換性

**確認項目**:

1. **Prisma Client の型**:
   ```typescript
   type Website = {
     // ...
     note?: string | null;  // ← 自動生成される型
   };
   ```
   - 既存コードが `website.note` を読まない場合 → 無影響
   - 既存コードが `website.note` を読む場合 → null-safe な実装必要

2. **API レスポンス**:
   - 既存クライアントが note フィールドを無視する → OK
   - 新規クライアントが note フィールドを読む → OK

**リスク**: 低（オプションフィールド追加のため）

---

## 5. パフォーマンス分析

### 5.1 ストレージ効率計算

**前提**:
- Website テーブル: 100,000 レコード
- note フィールド: VARCHAR(500)

**計算**:

```
日本語テキストの場合:
- 平均メモ長: 100 文字
- 1 文字のストレージコスト: 3 バイト（UTF-8）
- 1 レコードのコスト: 100 × 3 = 300 バイト

全体ストレージ:
100,000 レコード × 300 バイト = 30 MB

追加コスト（ネットワーク・メモリ）:
- 平均一覧取得時: 20 レコード × 300 バイト = 6 KB（無視可能）
- キャッシュメモリ: Redis では JSON 圧縮。増加分は軽微
```

**結論**: ストレージ・パフォーマンスへの影響は無視可能。

### 5.2 クエリ実行計画の検証

**クエリA**: ウェブサイト詳細取得

```sql
-- 実行計画
EXPLAIN ANALYZE
SELECT * FROM website 
WHERE id = 'uuid-123';

-- 結果: Index Scan (id は PK)
-- パフォーマンス: O(1) — note 追加による変化なし
```

**クエリB**: ウェブサイト一覧取得

```sql
EXPLAIN ANALYZE
SELECT id, name, domain, note, createdAt
FROM website
WHERE user_id = 'uuid-user' AND deleted_at IS NULL
ORDER BY name ASC
LIMIT 20;

-- インデックス: (user_id, deleted_at, name)
-- パフォーマンス: O(log n) — note 追加による変化なし
```

**結論**: インデックス構成が変わらず、パフォーマンスへの影響なし。

---

## 6. 型安全性の検証

### 6.1 Prisma 型定義

**自動生成型**:

```typescript
// @generated/prisma/client
type Website = {
  id: string;
  name: string;
  domain: string | null;
  note: string | null;     // ← 新規フィールド
  // ...
};

type WebsiteUncheckedCreateInput = {
  id: string;
  name: string;
  domain?: string | null;
  note?: string | null;    // ← nullable, optional
  // ...
};

type WebsiteUpdateInput = {
  id?: StringFieldUpdateOperationsInput;
  name?: StringFieldUpdateOperationsInput;
  domain?: NullableStringFieldUpdateOperationsInput;
  note?: NullableStringFieldUpdateOperationsInput;  // ← 新規
  // ...
};
```

**型安全性検証**:
- ✅ note はオプション & nullable
- ✅ 型定義が自動生成（手動エラー排除）
- ✅ zod スキーマと型が一致

### 6.2 バリデーション型スキーマ

```typescript
// zod スキーマ
const websiteUpdateSchema = z.object({
  name: z.string().max(100).optional(),
  domain: z.string().max(500).optional(),
  note: z.string().max(500).nullable().optional(),  // ← 新規
});

type WebsiteUpdatePayload = z.infer<typeof websiteUpdateSchema>;
// 型: { name?: string; domain?: string; note?: string | null }
```

**型チェック**: ✅ Prisma 型とスキーマ型が一致

---

## 7. マイグレーション手順の妥当性

### 7.1 Prisma マイグレーション生成

**手順**:

```bash
# Step 1: Schema update
# prisma/schema.prisma に `note String? @db.VarChar(500)` を追加

# Step 2: Create migration
npx prisma migrate dev --name add_website_note

# 期待される SQL:
# ALTER TABLE website ADD COLUMN note VARCHAR(500);
```

**検証事項**:
- ✅ SQL が正確か確認（note VARCHAR(500) NULL デフォルト）
- ✅ 既存テーブルへの影響確認（note 列のみ追加）
- ✅ リバート可能性確認

### 7.2 環境別適用順序

```
テスト環境
  ↓ (マイグレーション実施・確認)
ステージング環境
  ↓ (本番前検証・データ確認)
本番環境
  ↓ (本番データで実施・バックアップ取得後)
```

**バックアップ戦略**:
```sql
-- 本番化前にバックアップ
pg_dump -U postgres -h prod-db umami_db > backup_before_add_note.sql

-- マイグレーション実施後も保持
-- 問題発生時に psql < backup_before_add_note.sql でリストア可能
```

---

## 8. 実装上の注意点

### 8.1 Prisma スキーマ記述の確認

```prisma
// ✅ 正しい記述
model Website {
  note    String?   @db.VarChar(500)
}

// ❌ よくある間違い
model Website {
  note    String    @db.VarChar(500)       // NULL 許容を忘れた
  note    String?   @db.VarChar(500)? // ? の重複
  note    String?   @map("note_field")    // map が異なる
}
```

**チェックリスト**:
- [ ] String? に ? がついているか（NULL 許容）
- [ ] @db.VarChar(500) で型指定
- [ ] @map がない（カラム名は自動的に snake_case に変換）

### 8.2 マイグレーション検証

```sql
-- マイグレーション適用後に確認
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'website' AND column_name = 'note';

-- 期待結果:
-- column_name | data_type | is_nullable
-- note        | character varying | YES
```

---

## 9. 将来の拡張性

### 9.1 メモ検索機能への対応

**現在**: 検索機能なし

**将来実装時の設計判断**:

```sql
-- 全文検索対応（日本語）
CREATE INDEX idx_website_note_fts ON website 
USING GIN(to_tsvector('japanese', note));
```

**Prisma での検索実装**:
```typescript
// 将来のクエリ例
const websites = await prisma.website.findMany({
  where: {
    note: {
      search: "production",  // Prisma の FTS 機能
    },
  },
});
```

### 9.2 メモのマークダウン対応

**現在**: プレーンテキストのみ

**将来実装時の検討**:
- TEXT 型への変更（無制限サイズ）
- マークダウン パーサーの追加（セキュリティ: サニタイゼーション）
- UI: プレビュー機能の追加

**DB スキーマ変更**:
```sql
-- VARCHAR(500) → TEXT への変更
ALTER TABLE website ALTER COLUMN note TYPE TEXT;
```

---

## 10. セキュリティ検証

### 10.1 SQL インジェクション対策

**Prisma を使用するため自動対応**:

```typescript
// ❌ リスク: 生の SQL
const unsafe = `UPDATE website SET note = '${userNote}'`;

// ✅ 安全: Prisma
await prisma.website.update({
  where: { id: websiteId },
  data: { note: userNote },  // パラメータ化
});
```

### 10.2 データ検証

```typescript
// zod でバリデーション
const noteSchema = z.string().max(500);

if (!noteSchema.safeParse(userNote).success) {
  return { error: "Note must be 500 characters or less" };
}
```

---

## 11. テスト観点

### 11.1 DB レイヤーのテスト

```typescript
describe('Website note field', () => {
  it('should store note with 500 characters', async () => {
    const note = 'a'.repeat(500);
    await updateWebsite(websiteId, { note });
    const website = await getWebsite(websiteId);
    expect(website.note).toBe(note);
  });

  it('should reject note with 501+ characters', async () => {
    const note = 'a'.repeat(501);
    // DB の VARCHAR(500) が自動的に拒否
    // → Prisma がエラーを投げる
  });

  it('should handle null note', async () => {
    await updateWebsite(websiteId, { note: null });
    const website = await getWebsite(websiteId);
    expect(website.note).toBeNull();
  });
});
```

---

## 12. 承認判定

### 最終レビューコメント

**設計の強み**:
1. ✅ 要件の 500 文字制約を DB レイヤーで強制
2. ✅ NULL デフォルト値で既存レコード自動カバー
3. ✅ 既存パターン（domain など）に準拠
4. ✅ バックワード互換性が優秀
5. ✅ パフォーマンス影響が無視可能

**改善検討事項** (いずれも軽微):
1. CHECK 制約の検討（LENGTH(note) <= 500）— マイグレーション時に判断
2. インデックス戦略の再検証（メモ検索機能決定時）

**承認判定**: ✅ **承認** - 実装フェーズに移行可能

---

## 13. 次ステップ

1. **Prisma スキーマ更新**: note フィールド追加
2. **マイグレーション作成**: npx prisma migrate dev
3. **テスト環境での検証**: マイグレーション・データ確認
4. **型定義の生成**: npx prisma generate
5. **実装開始**: API Route Handler・UI コンポーネント

