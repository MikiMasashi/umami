# アーキテクチャ設計書 - ウェブサイトメモ機能

**バージョン**: 1.0  
**最終更新**: 2026-08-18  
**ステータス**: 確定

---

## 1. 概要

本仕様は、Umami のウェブサイト管理機能に「メモ」機能を追加する際の全体アーキテクチャ設計を定義します。既存の実装パターンを踏襲し、最小限の変更で機能を実装することを目指します。

### 設計の基本方針

- **レイヤード・アーキテクチャ**: Presentation / API / Domain / Persistence の既存レイヤ構造に従う
- **依存性の方向**: 内向き（ドメイン層は外層に依存しない）
- **既存パターンの踏襲**: 権限チェック・バリデーション・キャッシュを既存の仕組みで実装
- **テスト容易性**: ドメインロジックの単体テスト・API の統合テストが可能な設計

---

## 2. システムアーキテクチャ

### 2.1 全体構成

```
┌─────────────────────────────────────────────────────────────┐
│  Presentation Layer (React/Next.js)                         │
│  ┌──────────────────┬──────────────────┬───────────────┐   │
│  │ WebsiteEditForm  │ WebsitesTable    │ WebsitesPage  │   │
│  └──────────────────┴──────────────────┴───────────────┘   │
│  (note フィールド表示・入力・バリデーション)                    │
└─────────────────────────────────────────────────────────────┘
                           ↓
                   (fetch/mutation hook)
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  API Layer (Next.js App Router)                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ /api/websites/[websiteId] (GET/POST)                │   │
│  │ /api/websites (GET/POST)                            │   │
│  │ - zod バリデーション (note フィールド)               │   │
│  │ - 権限チェック (canUpdateWebsite)                   │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  Domain Layer (Business Logic)                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ ドメインロジック (実装なし / ビジネスルールなし)      │   │
│  │ 権限チェック関数 (既存)                               │   │
│  │ - canUpdateWebsite()                                 │   │
│  │ - canViewWebsite()                                   │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  Persistence Layer (Database)                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Prisma ORM                                           │   │
│  │ ┌────────────────────────────────────────────────┐   │   │
│  │ │ updateWebsite(websiteId, { note: "..." })     │   │   │
│  │ │ getWebsite(websiteId)  [note フィールド含む]  │   │   │
│  │ │ getWebsites(filters)   [note フィールド含む]  │   │   │
│  │ └────────────────────────────────────────────────┘   │   │
│  │ PostgreSQL (website テーブル + note 列)             │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. コンポーネント間インターフェース

### 3.1 Presentation Layer

#### WebsiteEditForm (ウェブサイト詳細設定画面 - メモ入力フォーム)

**責務**: メモの入力・編集・保存 UI

**入力**:
- `websiteId`: 編集対象のウェブサイト ID
- `onSave`: 保存後コールバック

**出力**:
- API 呼び出し: `POST /api/websites/{websiteId}`
- Request Body: `{ note: string | null }`

**UI 仕様**:
- `<TextField>` または `<TextArea>` で 500 文字以内の入力を許容
- リアルタイムバリデーション: 入力値の文字数カウント表示
- エラーメッセージ: "Note must be 500 characters or less"
- 保存ボタン: 既存の FormSubmitButton を使用

**既存パターンの踏襲**:
- `useUpdateQuery` hook で API 呼び出し
- `useMessages` で i18n 対応
- `useWebsite` で website データ取得

#### WebsitesTable (ウェブサイト一覧 - メモ列表示)

**責務**: メモ列を一覧テーブルに表示

**入力**:
- `rows`: ウェブサイトレコード配列（note フィールド含む）

**出力**:
- `<DataColumn>` で note フィールド表示
- 省略表示: 100 文字以上の場合は "..." で省略

**UI 仕様**:
- 列ラベル: "Memo" または "Note"
- セル内容: `website.note ?? "-"` で表示（null の場合は "-"）
- 長いメモの場合: `note.substring(0, 100) + "..."` で省略
- ツールチップ: 長い場合、ホバーで全文表示（Optional）

**既存パターンの踏襲**:
- `<DataTable>` と `<DataColumn>` で実装
- `<SortableLabel>` でソート対応（note はソート対象外でも可）

### 3.2 API Layer

#### POST /api/websites/{websiteId} (メモ更新エンドポイント)

**責務**: ウェブサイト情報（メモ含む）を更新

**処理フロー**:

```typescript
// 1. リクエスト解析・バリデーション
const schema = z.object({
  name: z.string().max(100).optional(),
  domain: z.string().max(500).optional(),
  note: z.string().max(500).nullable().optional(),  // ★ 新規
  shareId: z.string().max(50).nullable().optional(),
  replayConfig: z.object({...}).optional(),
});

const { auth, body, error } = await parseRequest(request, schema);

// 2. 権限チェック
if (!(await canUpdateWebsite(auth, websiteId))) {
  return unauthorized();  // 401 Unauthorized
}

// 3. データベース更新
const updateData = { ...body };
if (body.note === "") {
  updateData.note = null;  // 空文字列 → null に正規化
}

const website = await updateWebsite(websiteId, updateData);

// 4. レスポンス返却
return json(website);  // 更新されたサイト情報（note 含む）
```

**エラー処理**:

| エラーケース | HTTP Status | 処理 |
|---|---|---|
| note > 500 文字 | 400 | zod バリデーション失敗 |
| 権限なし | 401 | canUpdateWebsite() で false |
| サイト未検出 | 404 | getWebsite() で null |
| DB エラー | 500 | Exception handling で 500 返却 |

#### GET /api/websites/{websiteId} (メモ取得エンドポイント)

**責務**: ウェブサイト情報（メモ含む）を取得

**処理フロー**:

```typescript
// 1. 権限チェック
if (!(await canViewSharedWebsite(auth, websiteId))) {
  return unauthorized();  // 401 Unauthorized
}

// 2. データベース取得（note フィールド自動取得）
const website = await getWebsite(websiteId);  // Prisma が note を自動取得

// 3. レスポンス返却
return json(website);  // { id, name, domain, note, ... }
```

#### GET /api/websites (メモ一覧取得エンドポイント)

**責務**: ウェブサイト一覧（メモ含む）を取得

**処理フロー**:

```typescript
// 1. フィルター・ページング解析
const filters = await getQueryFilters(query);  // search, sort, order など

// 2. データベース取得（note フィールド自動取得）
const websites = await getUserWebsites(userId, filters);  // note を自動取得

// 3. レスポンス返却
return json(websites);
// {
//   data: [
//     { id, name, domain, note, ... },
//     { id, name, domain, note: null, ... },
//   ],
//   count, page, pageSize, ...
// }
```

**検索対象**:
- name・domain での部分一致（既存動作）
- note は検索対象外（要件スコープ外）

### 3.3 Domain Layer

#### 権限チェック関数（既存、変更なし）

**関数**: `canUpdateWebsite(auth: Auth, websiteId: string): boolean`

**責務**: ウェブサイト設定変更権限の判定

**ロジック**:
```typescript
export async function canUpdateWebsite({ user }: Auth, websiteId: string) {
  if (!user) {
    return false;
  }

  if (user.isAdmin) {
    return true;  // Admin は全許可
  }

  const website = await getWebsite(websiteId);

  if (!website) {
    return false;  // サイト不検出
  }

  if (website.userId) {
    return user.id === website.userId;  // 所有者のみ
  }

  if (website.teamId) {
    const teamUser = await getTeamUser(website.teamId, user.id);

    return teamUser && hasPermission(teamUser.role, PERMISSIONS.websiteUpdate);
    // チームマネージャー以上
  }

  return false;
}
```

**note との関係**:
- メモは Website の属性なので、メモ変更権限 = サイト設定変更権限
- 権限チェック関数の変更なし

### 3.4 Persistence Layer

#### Prisma クエリ関数（既存、変更なし）

**関数**: `updateWebsite(websiteId: string, data: Prisma.WebsiteUpdateInput)`

**責務**: ウェブサイト情報を更新

**実装**（変更なし）:
```typescript
export async function updateWebsite(
  websiteId: string,
  data: Prisma.WebsiteUpdateInput | Prisma.WebsiteUncheckedUpdateInput,
) {
  return prisma.client.website.update({
    where: { id: websiteId },
    data,  // note フィールドが含まれていれば自動的に更新
  });
}
```

**ビジネスロジック**:
- note フィールドは自動的に Prisma で処理
- 空文字列 → null の正規化は API Route Handler で実施

**パフォーマンス**:
- note フィールド追加によるクエリ コスト: 無視可能（VARCHAR(500)）
- インデックス: 不要（検索機能はスコープ外）

---

## 4. データフロー

### 4.1 メモ編集フロー

```
1. ユーザー操作
   ┌─────────────────────────────────┐
   │ WebsiteEditForm に入力・保存    │
   │ ユーザーが "保存" ボタンをクリック│
   └────────────────┬────────────────┘
                    ↓

2. クライアント処理
   ┌─────────────────────────────────┐
   │ zod バリデーション (note ≤ 500) │
   │ エラー時: エラーメッセージ表示   │
   └────────────────┬────────────────┘
                    ↓ (バリデーション OK)

3. API 呼び出し
   ┌──────────────────────────────────┐
   │ POST /api/websites/{websiteId}   │
   │ Body: { note: "..." }            │
   └────────────────┬─────────────────┘
                    ↓

4. API Route Handler
   ┌──────────────────────────────────┐
   │ zod バリデーション (サーバー側)  │
   │ 権限チェック: canUpdateWebsite() │
   │ 正規化: "" → null                │
   └────────────────┬─────────────────┘
                    ↓ (成功)

5. Prisma Update
   ┌──────────────────────────────────┐
   │ updateWebsite(websiteId, data)   │
   │ Website.note を更新              │
   │ updatedAt を自動更新             │
   └────────────────┬─────────────────┘
                    ↓

6. データベース
   ┌──────────────────────────────────┐
   │ UPDATE website SET note = ...    │
   │ WHERE website_id = ...           │
   └────────────────┬─────────────────┘
                    ↓

7. API レスポンス
   ┌──────────────────────────────────┐
   │ 200 OK                           │
   │ Body: { id, name, domain, note } │
   └────────────────┬─────────────────┘
                    ↓

8. UI 更新
   ┌──────────────────────────────────┐
   │ メモが更新されたことを表示       │
   │ 保存ボタン無効化の解除           │
   │ toast 通知: "Saved"              │
   └──────────────────────────────────┘
```

### 4.2 メモ表示フロー（一覧）

```
1. ページロード
   ┌───────────────────────┐
   │ WebsitesPage 初期化   │
   └──────────┬────────────┘
              ↓

2. API 呼び出し
   ┌──────────────────────────┐
   │ GET /api/websites        │
   │ (page, filter, sort など)│
   └──────────┬───────────────┘
              ↓

3. API Route Handler
   ┌──────────────────────────┐
   │ getUserWebsites()        │
   │ (note フィールド自動取得)│
   └──────────┬───────────────┘
              ↓

4. Prisma Query
   ┌──────────────────────────┐
   │ SELECT * FROM website    │
   │ WHERE user_id = ...      │
   │ (note を自動取得)        │
   └──────────┬───────────────┘
              ↓

5. API レスポンス
   ┌──────────────────────────┐
   │ 200 OK                   │
   │ {                        │
   │   data: [                │
   │     { id, name, note },  │
   │     { id, name, note }   │
   │   ]                      │
   │ }                        │
   └──────────┬───────────────┘
              ↓

6. UI 描画
   ┌──────────────────────────┐
   │ WebsitesTable 描画       │
   │ 各行に note 列を表示     │
   │ 長い場合は "..." で省略  │
   └──────────────────────────┘
```

---

## 5. バックワード互換性設計

### 5.1 既存メモなしサイトの互換性

**シナリオ**: マイグレーション前に登録されたウェブサイト（note = NULL）

**対応方法**:

| 操作 | 動作 | 備考 |
|---|---|---|
| 一覧表示 | note: null → "-" 表示 | 正常 |
| 詳細表示 | note: null → 空欄表示 | 正常 |
| メモ未入力で保存 | note = null に保存 | 正常 |
| メモあり・メモなしが混在 | 正常に混在表示 | 正常 |

**テスト確認項目**:
1. メモなしサイトの取得 → エラーなし、note = null
2. メモなしサイトの編集画面 → メモ欄は空白
3. メモなしサイトのメモ追加 → null → "text" に更新成功
4. メモあり → メモ削除（空入力） → "text" → null に更新成功

### 5.2 既存クライアントの互換性

**シナリオ**: API の note フィールドを無視するクライアント

**対応方法**:
- note は新規フィールド（後付け）
- 既存クライアントは note を無視可能
- API レスポンスに note が追加されても、既存クライアントは動作継続

---

## 6. パフォーマンス設計

### 6.1 クエリ最適化

**一覧取得クエリの実行計画**:

```sql
-- 既存クエリ（Prisma 自動生成）
SELECT 
  id, name, domain, note, createdAt, userId, teamId, ...
FROM website
WHERE user_id = $1 AND deleted_at IS NULL
ORDER BY name ASC
LIMIT 20;

-- インデックス: website(user_id, deleted_at, name)
-- note 追加による性能低下: なし（フィールド追加のみ）
```

**N+1 クエリ防止**:
- getWebsites() で全フィールド取得（note を含む）
- 追加クエリなし

### 6.2 キャッシング

**Redis キャッシュ**:
- 既存の `redis.client.set('website:{websiteId}', website)` で対応
- note フィールドが自動的にキャッシュされる（Prisma が返す full object）

**キャッシュ更新**:
- 更新後に Redis キャッシュをクリア（既存パターン）
  ```typescript
  await redis.client.del(`website:${websiteId}`);
  ```

---

## 7. テスト戦略

### 7.1 単体テスト

**対象**: API Route Handler の zod バリデーション

```typescript
describe('POST /api/websites/[websiteId] - note field', () => {
  it('should allow valid note (≤500 chars)', async () => {
    // ...
  });

  it('should reject note > 500 chars', async () => {
    // ...
  });

  it('should allow null note', async () => {
    // ...
  });

  it('should convert empty string to null', async () => {
    // ...
  });
});
```

### 7.2 統合テスト

**対象**: API エンドポイント（権限チェック・DB 操作含む）

```typescript
describe('Website memo - Integration', () => {
  it('should update memo for authorized user', async () => {
    // 1. サイト作成
    // 2. PUT /api/websites/[id] で memo 更新
    // 3. GET /api/websites/[id] で確認
  });

  it('should reject memo update for unauthorized user', async () => {
    // 1. 権限なしユーザーで API 呼び出し
    // 2. 401 Unauthorized 確認
  });

  it('should display memo in list', async () => {
    // 1. メモあり・なしサイト作成
    // 2. GET /api/websites で一覧取得
    // 3. 両方のサイトのメモ表示確認
  });
});
```

### 7.3 E2E テスト

**対象**: UI からメモ操作まで（Playwright）

```typescript
describe('Website memo - E2E', () => {
  it('should allow user to add memo', async ({ page }) => {
    // 1. ウェブサイト詳細設定画面を開く
    // 2. メモフィールドに入力
    // 3. "保存" ボタンクリック
    // 4. "Saved" トースト表示確認
    // 5. ページリロード後、メモが保存されていることを確認
  });

  it('should display memo in list', async ({ page }) => {
    // 1. ウェブサイト一覧ページを開く
    // 2. メモ列が表示されることを確認
    // 3. 長いメモが省略表示されることを確認
  });
});
```

---

## 8. セキュリティ設計

### 8.1 認証・認可

**実装**: 既存の `canUpdateWebsite()` を流用

**確認項目**:
1. ユーザー未認証 → 401 Unauthorized
2. メモ変更権限なし → 401 Unauthorized
3. Admin → すべて許可
4. 所有者 → 自分のサイトのみ変更
5. チームマネージャー → チーム内のサイトのみ変更

### 8.2 入力検証

**Zod スキーマ**:
```typescript
note: z.string()
  .max(500, "Note must be 500 characters or less")
  .nullable()
  .optional()
```

**実施箇所**:
- クライアント側: リアルタイムバリデーション（UX 向上）
- サーバー側: 入力値再検証（セキュリティ）

---

## 9. 実装チェックリスト

### Prisma Schema

- [ ] Website モデルに `note String? @db.VarChar(500)` を追加
- [ ] マイグレーション作成・適用

### API Route Handler

- [ ] POST /api/websites/[websiteId] で note フィールドをスキーマに追加
- [ ] zod バリデーション実装
- [ ] 権限チェック実装（既存関数使用）
- [ ] エラーメッセージ: "Note must be 500 characters or less"

### UI Components

- [ ] WebsiteEditForm に note フィールド追加
- [ ] WebsitesTable に note 列追加
- [ ] 省略表示ロジック実装（100 文字まで）

### テスト

- [ ] バリデーション単体テスト
- [ ] API 統合テスト
- [ ] E2E テスト（メモ編集・表示）

---

## 10. 関連ドキュメント

- `docs/specifications/api-specification.md` - API 設計
- `docs/specifications/data-specification.md` - DB スキーマ設計
- `docs/requirements/requirement-US-201.md` - 要件定義書

