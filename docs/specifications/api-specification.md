# API 仕様書 - ウェブサイトメモ機能

**バージョン**: 1.0  
**最終更新**: 2026-08-18  
**ステータス**: 確定

---

## 1. 概要

本仕様は、Umami のウェブサイト管理機能に「メモ」機能を追加する際の REST API 設計を定義します。

### 設計原則

- **後方互換性**: 既存のメモなしウェブサイトが引き続き動作すること
- **既存パターンの踏襲**: umami の REST API 設計パターンに従う
- **セキュリティ**: 既存の権限チェック機構（RBAC）を流用
- **保守性**: 多言語対応・バリデーション・エラーハンドリングは既存の機構を利用

---

## 2. 影響を受けるエンドポイント

### 2.1 GET /api/websites/{websiteId}

#### 目的
ウェブサイト詳細情報を取得（メモ含む）

#### リクエスト

```
GET /api/websites/{websiteId}
```

#### レスポンス（200 OK）

```json
{
  "id": "uuid",
  "name": "Example Site",
  "domain": "example.com",
  "note": "This is production environment. Managed by John.",
  "userId": "uuid or null",
  "teamId": "uuid or null",
  "createdAt": "2026-08-01T00:00:00Z",
  "updatedAt": "2026-08-18T12:00:00Z",
  "deletedAt": null,
  "recorderEnabled": false,
  "replayConfig": null,
  "shareId": "share-slug or null"
}
```

**変更点**:
- `note` フィールドが追加（新規）
- 型: `string | null`
- 最大長: 500 文字

**既存フィールドとの互換性**:
- 既存フィールドは変更なし
- `note` が null の場合でも API は 200 を返す（メモなしサイトの正常系）

#### レスポンス（401 Unauthorized）

```json
{
  "message": "Unauthorized"
}
```

権限がないユーザーが不正にアクセスした場合。既存の動作と同一。

---

### 2.2 POST /api/websites/{websiteId}

#### 目的
ウェブサイト情報を更新（メモ含む）

#### リクエスト

```
POST /api/websites/{websiteId}

Content-Type: application/json
```

**Body スキーマ** (すべてのフィールドオプション):

```typescript
{
  name?: string;                    // 1-100 文字
  domain?: string;                  // 1-500 文字、URL形式
  note?: string | null;             // 新規フィールド、0-500 文字 or null
  shareId?: string | null;          // 既存フィールド
  replayConfig?: {
    replayEnabled?: boolean;
    heatmapEnabled?: boolean;
    sessionSampleRate?: number;
  };
}
```

**note フィールドの詳細**:
- 型: `string | null`
- 最大長: 500 文字
- トリミング処理: 不要（クライアント側で実施推奨）
- 改行: 許容（\n を含む）
- 空文字列と null: 空文字列を送信した場合、null として保存される（推奨実装）

#### レスポンス（200 OK）

```json
{
  "id": "uuid",
  "name": "Example Site Updated",
  "domain": "example.com",
  "note": "Updated memo",
  "userId": "uuid",
  "teamId": null,
  "createdAt": "2026-08-01T00:00:00Z",
  "updatedAt": "2026-08-18T13:00:00Z",
  "deletedAt": null,
  "recorderEnabled": false,
  "replayConfig": null,
  "shareId": null
}
```

#### レスポンス（400 Bad Request）

メモが 500 文字を超えた場合:

```json
{
  "message": "Note must be 500 characters or less"
}
```

**note のバリデーション ルール**:
1. 文字数チェック: 0 <= length <= 500
2. 型チェック: string または null
3. 改行は許容（\n, \r\n など）
4. SQL インジェクション対策: Prisma ORM で自動エスケープ

#### レスポンス（401 Unauthorized）

```json
{
  "message": "Unauthorized"
}
```

メモ変更権限がないユーザーが API 呼び出しした場合。

**権限チェック**:
- 既存の `canUpdateWebsite(auth, websiteId)` 関数を使用
- チェック対象: ユーザーはサイト所有者 OR チームマネージャー以上
- Admin はすべて許可

---

### 2.3 POST /api/websites

#### 目的
新しいウェブサイトを作成（メモ初期値は null）

#### リクエスト

```
POST /api/websites

Content-Type: application/json
```

**Body スキーマ**:

```typescript
{
  name: string;         // 必須、1-100 文字
  domain: string;       // 必須、1-500 文字
  shareId?: string | null;
  teamId?: uuid | null;
  id?: uuid | null;
  note?: string | null; // オプション、0-500 文字（推奨: 初期値は null）
}
```

#### レスポンス（201 Created）

```json
{
  "id": "new-uuid",
  "name": "New Website",
  "domain": "newsite.com",
  "note": null,
  "userId": "creator-uuid",
  "teamId": null,
  "createdAt": "2026-08-18T13:10:00Z",
  "updatedAt": "2026-08-18T13:10:00Z",
  "deletedAt": null,
  "recorderEnabled": false,
  "replayConfig": null,
  "shareId": null
}
```

**変更点**:
- note フィールド対応（初期値は null で問題なし）

---

### 2.4 GET /api/websites

#### 目的
ウェブサイト一覧を取得（メモ列含む）

#### リクエスト

```
GET /api/websites?page=1&pageSize=20&search=&sort=name&order=asc&includeTeams=true
```

#### クエリパラメータ

- `page`: ページ番号（デフォルト: 1）
- `pageSize`: 1 ページのサイズ（デフォルト: 20）
- `search`: 検索キーワード（name・domain での部分一致。メモは検索対象外）
- `sort`: ソート対象フィールド（name, domain, createdAt）
- `order`: ソート順序（asc, desc）
- `includeTeams`: チームサイトを含めるか（true/false）

#### レスポンス（200 OK）

```json
{
  "data": [
    {
      "id": "uuid1",
      "name": "Site A",
      "domain": "sitea.com",
      "note": "Production environment. Owned by Alice.",
      "createdAt": "2026-08-01T00:00:00Z",
      "updatedAt": "2026-08-18T12:00:00Z",
      "userId": "user-uuid1",
      "teamId": null,
      "shareId": null
    },
    {
      "id": "uuid2",
      "name": "Site B",
      "domain": "siteb.com",
      "note": null,
      "createdAt": "2026-08-02T00:00:00Z",
      "updatedAt": "2026-08-02T00:00:00Z",
      "userId": "user-uuid2",
      "teamId": null,
      "shareId": null
    }
  ],
  "count": 42,
  "page": 1,
  "pageSize": 20,
  "orderBy": "name",
  "search": ""
}
```

**note フィールドについて**:
- すべてのレコードに note フィールドが含まれる
- メモなしサイトは `note: null`
- UI 側で省略表示（100 文字 + "..."）を実装

---

## 3. バリデーション仕様

### 3.1 note フィールドのバリデーション

#### クライアント側（zod）

```typescript
const websiteUpdateSchema = z.object({
  name: z.string().max(100).optional(),
  domain: z.string().max(500).optional(),
  note: z.string().max(500).nullable().optional(),
  // ... その他のフィールド
});
```

#### サーバー側（API Route Handler）

同じ zod スキーマでバリデーション。以下のいずれかの形式に対応:

1. **省略**: `note` キーなし → 既存値を保持
2. **null**: `note: null` → メモをクリア
3. **文字列**: `note: "..."` → メモを更新
4. **空文字列**: `note: ""` → null として扱う

#### バリデーションエラー

| エラーケース | HTTP Status | エラーメッセージ |
|---|---|---|
| 501 文字以上 | 400 | "Note must be 500 characters or less" |
| 型が異なる | 400 | "Note must be a string or null" |
| 権限なし | 401 | "Unauthorized" |

---

## 4. セキュリティ設計

### 4.1 認認可（Authorization）

- **実装方法**: 既存の `canUpdateWebsite(auth, websiteId)` を使用
- **権限チェック対象**: POST /api/websites/{websiteId} の note 更新時
- **ルール**:
  - Admin ユーザー: すべての操作許可
  - 所有者: 自分のサイトのみ変更可
  - チームマネージャー以上: チーム内のサイト変更可
  - それ以外: 401 返却

### 4.2 入力検証（Input Validation）

- **文字数上限**: Prisma スキーマと zod スキーマで max(500) を統一
- **型チェック**: zod で string | null のみ許可
- **SQL インジェクション**: Prisma ORM のパラメータ化クエリで対応
- **XSS 対策**: Next.js の自動エスケープで対応（メモはプレーンテキストのみ）

### 4.3 ログ・監査

- メモの変更は既存の Website.updatedAt フィールドで追跡可能
- メモの変更履歴は本機能スコープ外

---

## 5. エラーハンドリング

### 5.1 エラーレスポンス形式

```json
{
  "message": "Human-readable error message",
  "code": "ERROR_CODE" (optional)
}
```

### 5.2 HTTP ステータスコード

| ステータス | 原因 | 例 |
|---|---|---|
| 200 | 成功 | GET/POST 成功時 |
| 400 | クライアントエラー | note が 501 文字以上 |
| 401 | 権限なし | ユーザーに変更権限がない |
| 404 | サイト未検出 | websiteId が存在しない |
| 500 | サーバーエラー | DB 接続失敗など |

---

## 6. 後方互換性

### 6.1 既存コードへの影響

- **Breaking Changes**: なし
- `note` フィールドはオプション（後付け）
- 既存クライアントは `note` を無視可能
- 既存のメモなしサイトは自動的に `note: null` となる

### 6.2 マイグレーション戦略

1. DB スキーマ: `ALTER TABLE website ADD COLUMN note VARCHAR(500) DEFAULT NULL;`
2. 既存レコード: 自動的に note = NULL
3. API: 変更なし（note フィールド追加のみ）
4. クライアント: note フィールド表示コード追加

---

## 7. パフォーマンス考慮

### 7.1 クエリ最適化

- **一覧取得**: メモ列を含めても performance に影響なし（VARCHAR(500) は軽量）
- **インデックス**: 不要（メモの検索機能はスコープ外）
- **N+1 クエリ**: Prisma の自動フィールド取得により回避

### 7.2 レスポンスサイズ

- 平均的なメモ長: 50-100 文字
- 一覧取得時のペイロード増加: 20 件 × 100 文字 ≈ 2KB（無視可能）

---

## 8. 実装チェックリスト

### API Route Handler (`src/app/api/websites/[websiteId]/route.ts`)

- [ ] POST ハンドラーで `note` フィールドをスキーマに追加
- [ ] zod バリデーション: `note: z.string().max(500).nullable().optional()`
- [ ] `canUpdateWebsite` で権限チェック
- [ ] エラーメッセージ: "Note must be 500 characters or less"
- [ ] レスポンス: 更新されたサイト情報（note 含む）

### GET /api/websites/[websiteId]

- [ ] レスポンスに note フィールド含める（Prisma 自動取得）

### GET /api/websites

- [ ] レスポンスに note フィールド含める
- [ ] 検索対象は name・domain のみ（note は対象外）

### Prisma Schema (`prisma/schema.prisma`)

- [ ] Website モデルに `note String? @db.VarChar(500)` を追加
- [ ] マイグレーション作成 (`npx prisma migrate dev --name add_website_note`)

---

## 9. 関連ドキュメント

- `docs/specifications/data-specification.md` - DB スキーマ設計
- `docs/specifications/architecture-specification.md` - 全体アーキテクチャ
- `docs/requirements/requirement-US-201.md` - 要件定義書

