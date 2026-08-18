# アーキテクチャ設計レビュー結果 - US-201

**レビュアー**: Backend Architect  
**レビュー日**: 2026-08-18  
**対象ドキュメント**: `docs/specifications/architecture-specification.md`  
**ステータス**: 承認（Frontend Engineer との UI 詳細設計は別フェーズ）

---

## 1. 設計の総合評価

### 評価結果

| 項目 | 評価 | 備考 |
|---|---|---|
| **レイヤ構成** | ✅ 適切 | 既存パターン踏襲、層の責務が明確 |
| **コンポーネント間インターフェース** | ✅ 明確 | データフロー図で流れが可視化 |
| **既存資産の活用** | ✅ 優秀 | 新技術導入なし、既存関数流用 |
| **バックワード互換性** | ✅ 優秀 | 既存サイト・クライアント無影響 |
| **拡張性** | ✅ 良好 | 将来の機能追加に対応可能な設計 |

**結論**: アーキテクチャは堅牢で、実装チームが直ちに開発を始められる状態。

---

## 2. レイヤド・アーキテクチャの妥当性

### 2.1 層の責務分離

**提案アーキテクチャ**:

```
Presentation Layer (React)
      ↓ (REST API)
API Layer (Next.js Route Handlers)
      ↓ (権限チェック・ビジネスロジック)
Domain Layer (Functions)
      ↓ (ORM)
Persistence Layer (Prisma + PostgreSQL)
```

**各層の責務**:

| 層 | 責務 | 新規実装 |
|---|---|---|
| Presentation | UI 描画・ユーザー入力 | WebsiteEditForm に note 追加 |
| API | リクエスト解析・バリデーション・権限チェック | POST ハンドラで note バリデーション |
| Domain | ビジネスルール・権限判定 | 変更なし（既存の canUpdateWebsite を流用） |
| Persistence | データ保存・取得 | note フィールド追加 |

**評価**: ✅ 層の責務が明確。新規実装も各層に適切に分散。

### 2.2 依存性の方向（Dependency Injection）

**依存方向チェック**:

```
Presentation → API → Domain
                        ↓
                    Persistence
```

- ✅ Domain は Persistence（DB）に依存（適切）
- ✅ API は Domain（権限チェック）に依存（適切）
- ✅ Presentation は API に依存（適切）
- ✅ 逆向きの依存なし（循環依存なし）

**評価**: ✅ 依存性が一方向。テスト容易性が確保される。

---

## 3. コンポーネント間インターフェースの検証

### 3.1 WebsiteEditForm インターフェース

**責務**: メモ入力フォーム

**入力**:
- `websiteId`: 編集対象サイト ID
- `onSave`: 保存後コールバック

**出力**:
- API 呼び出し: POST /api/websites/{websiteId}
- Request: `{ note: string | null }`

**検証**:
- ✅ 入出力が明確
- ✅ 既存の useUpdateQuery hook で実装可能
- ✅ バリデーション（500 字制限）実装可能

**リスク**: UI コンポーネントの詳細（TextArea サイズなど）は Frontend Engineer と詳細設計が必要

### 3.2 WebsitesTable インターフェース

**責務**: メモ列の表示

**入力**:
- `rows`: ウェブサイトレコード配列（note フィールド含む）

**出力**:
- `<DataColumn>` で note 列を描画
- 省略表示: 100 文字 + "..."

**検証**:
- ✅ DataTable・DataColumn で実装可能
- ✅ 省略ロジックは単純（string.substring）
- ✅ null 値の表示（"-" など）は Frontend Engineer が実装

**リスク**: note 列のラベル・整列・ツールチップなどは Frontend Engineer 設計が必要

### 3.3 API インターフェース

**POST /api/websites/{websiteId} の流れ**:

```typescript
// 1. リクエスト解析
const { auth, body, error } = await parseRequest(request, schema);

// 2. 権限チェック
if (!(await canUpdateWebsite(auth, websiteId))) {
  return unauthorized();
}

// 3. データ正規化
const updateData = { ...body };
if (body.note === "") {
  updateData.note = null;
}

// 4. DB 更新
const website = await updateWebsite(websiteId, updateData);

// 5. レスポンス
return json(website);
```

**検証**:
- ✅ 既存パターンと同一
- ✅ zod バリデーション・権限チェック・正規化が明確
- ✅ エラーハンドリング完備

---

## 4. データフロー分析

### 4.1 メモ編集フローの検証

**フロー順序**:

1. ユーザー入力 → 2. クライアント検証 → 3. API 呼び出し → 4. サーバー検証 → 5. DB 更新 → 6. UI 更新

**各ステップの検証**:

| ステップ | 担当 | 実装 | 検証 |
|---|---|---|---|
| 1. ユーザー入力 | Frontend | WebsiteEditForm | ✅ TextField で 500 字制限入力 |
| 2. クライアント検証 | Frontend | zod on client | ✅ リアルタイムバリデーション |
| 3. API 呼び出し | Frontend | useUpdateQuery | ✅ 既存 hook 使用 |
| 4. サーバー検証 | Backend | zod on server | ✅ 入力値再検証 |
| 5. 権限チェック | Backend | canUpdateWebsite() | ✅ 既存関数流用 |
| 6. DB 更新 | Backend | prisma.update | ✅ Prisma で自動 |
| 7. レスポンス | Backend | json() | ✅ 更新サイト情報返却 |
| 8. UI 更新 | Frontend | toast + state | ✅ 既存パターン |

**評価**: ✅ フロー全体が一貫性ある。実装順序も明確。

### 4.2 メモ表示フロー（一覧）の検証

**フロー**:

1. ページロード → 2. API 呼び出し → 3. データ取得 → 4. UI 描画

**データ取得**:
- GET /api/websites で note フィールドを自動取得
- Prisma の getWebsites() が note を含める
- 検索対象外（name・domain のみ）

**UI 表示**:
- note: null → "-" 表示
- note: "長いメモ" → 前 100 文字 + "..." 表示

**評価**: ✅ データフロー・UI 表現が明確。

---

## 5. 権限チェック設計の妥当性

### 5.1 canUpdateWebsite() の流用

**既存実装**:

```typescript
export async function canUpdateWebsite({ user }: Auth, websiteId: string) {
  if (!user) return false;
  if (user.isAdmin) return true;  // Admin は全許可
  
  const website = await getWebsite(websiteId);
  if (!website) return false;
  
  if (website.userId) {
    return user.id === website.userId;  // 所有者のみ
  }
  
  if (website.teamId) {
    const teamUser = await getTeamUser(website.teamId, user.id);
    return teamUser && hasPermission(teamUser.role, PERMISSIONS.websiteUpdate);
  }
  
  return false;
}
```

**メモ機能への適用**:

| ユーザータイプ | メモ変更可能 | 根拠 |
|---|---|---|
| Admin | ✅ | 既存ルール: Admin は全操作可 |
| 所有者（userId） | ✅ | 既存ルール: 所有者のみ変更可 |
| チームマネージャー以上 | ✅ | 既存ルール: PERMISSIONS.websiteUpdate で確認 |
| それ以外 | ❌ | 401 Unauthorized 返却 |

**評価**: ✅ メモ変更権限 = サイト設定変更権限。既存ルール を流用で問題なし。

**テスト確認事項**:
- [ ] 権限なしユーザーでメモ更新 → 401 返却
- [ ] Admin でメモ更新 → 200 成功
- [ ] 所有者でメモ更新 → 200 成功
- [ ] チームマネージャーでメモ更新 → 200 成功

---

## 6. バックワード互換性の設計妥当性

### 6.1 既存メモなしサイトへの対応

**シナリオ**: マイグレーション前に登録されたサイト（note = NULL）

**対応方法**:

| 操作 | 動作 | 実装 |
|---|---|---|
| GET /api/websites/{id} | note: null 返却 | Prisma 自動取得 |
| 一覧表示 | note: null → "-" 表示 | Frontend 実装 |
| 編集画面 | メモフィールド空欄 | Frontend が null をチェック |
| メモ追加 | null → "text" に更新 | updateWebsite で更新 |

**評価**: ✅ 既存サイトが引き続き動作。

### 6.2 既存クライアントの互換性

**シナリオ**: API の note フィールドを無視するクライアント

**対応**:
- note は新規フィールド（後付け）
- レスポンス JSON に note が追加される
- 既存クライアントは note を無視可能（JSON は拡張可能）

**評価**: ✅ Breaking changes なし。

### 6.3 既存コードの互換性

**チェック項目**:
- ✅ Prisma スキーマ: note フィールド追加のみ
- ✅ API: POST body に note 追加のみ
- ✅ Permissions: canUpdateWebsite を流用（変更なし）
- ✅ DB: マイグレーション（既存レコードは自動的に note = NULL）

**リスク**: 低

---

## 7. パフォーマンス設計の妥当性

### 7.1 クエリパフォーマンス

**検証**:

```sql
-- 現在のクエリ（user_id でフィルタ）
SELECT id, name, domain, createdAt 
FROM website 
WHERE user_id = $1 AND deleted_at IS NULL
ORDER BY name ASC
LIMIT 20;

-- 変更後（note を追加）
SELECT id, name, domain, note, createdAt 
FROM website 
WHERE user_id = $1 AND deleted_at IS NULL
ORDER BY name ASC
LIMIT 20;

-- インデックス: (user_id, deleted_at, name)
-- パフォーマンス: 変わらず（インデックススキャンは同じ）
-- ただし SELECT フィールドが増えるため、ネットワーク送信量がわずかに増加
```

**ネットワーク送信量**:
- 1 件の note: 100 バイト（平均）
- 20 件の一覧: 2 KB 増加
- レスポンス総サイズ: 8-10 KB（無視可能）

**評価**: ✅ パフォーマンス影響なし。

### 7.2 キャッシング戦略

**現在の実装**:
```typescript
// Redis キャッシュ（existing）
await redis.client.set(`website:${websiteId}`, website);

// note フィールドが自動的にキャッシュされる
// 更新後、キャッシュクリア
await redis.client.del(`website:${websiteId}`);
```

**評価**: ✅ 既存キャッシング機構で自動対応。変更なし。

---

## 8. テスト戦略の妥当性

### 8.1 単体テスト

**対象**: zod バリデーションスキーマ

```typescript
describe('Note validation', () => {
  it('should allow valid note', () => {
    const schema = z.string().max(500).nullable().optional();
    expect(schema.safeParse("Valid note").success).toBe(true);
    expect(schema.safeParse(null).success).toBe(true);
    expect(schema.safeParse(undefined).success).toBe(true);
  });

  it('should reject note > 500 chars', () => {
    const schema = z.string().max(500).nullable().optional();
    expect(schema.safeParse('a'.repeat(501)).success).toBe(false);
  });
});
```

**評価**: ✅ バリデーション単体テストは高速・確実。

### 8.2 統合テスト

**対象**: API エンドポイント（権限チェック・DB 操作）

```typescript
describe('POST /api/websites/[websiteId] - Note', () => {
  it('should update note for owner', async () => {
    const response = await POST(request, { 
      params: { websiteId: 'site-id' } 
    });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.note).toBe("Updated memo");
  });

  it('should reject unauthorized user', async () => {
    // 権限なしユーザーで呼び出し
    const response = await POST(request, { params: { websiteId: 'site-id' } });
    expect(response.status).toBe(401);
  });
});
```

**評価**: ✅ API テストで権限チェック・DB 操作を検証可能。

### 8.3 E2E テスト

**対象**: UI 全体（入力から保存まで）

```typescript
describe('Website memo - E2E', () => {
  it('should allow user to add and edit memo', async ({ page }) => {
    // 1. ウェブサイト設定画面を開く
    await page.goto('/websites/site-id/settings');
    
    // 2. メモフィールドに入力
    await page.fill('[name="note"]', 'Production environment');
    
    // 3. 保存ボタンクリック
    await page.click('button:has-text("Save")');
    
    // 4. 成功メッセージを確認
    await expect(page).toContainText('Saved');
    
    // 5. ページリロードして保存を確認
    await page.reload();
    const noteValue = await page.inputValue('[name="note"]');
    expect(noteValue).toBe('Production environment');
  });
});
```

**評価**: ✅ E2E テストで実際のユーザー操作をシミュレート。

---

## 9. セキュリティレビュー

### 9.1 認認可

**実装**: canUpdateWebsite() で既存ルールを流用

**検証**:
- ✅ 権限チェック関数が呼ばれ、権限なしは 401 返却
- ✅ Admin・所有者・チームマネージャーの判定ロジック正確

**リスク**: 低

### 9.2 入力検証

**実装**: zod + Prisma

```typescript
// クライアント側
const schema = z.string().max(500).nullable().optional();

// サーバー側（再検証）
const validated = schema.safeParse(userNote);
if (!validated.success) {
  return badRequest(validated.error.message);
}

// DB 側（VARCHAR(500) で制約）
```

**リスク**: 低（三層でバリデーション）

### 9.3 SQL インジェクション対策

**実装**: Prisma のパラメータ化クエリ

```typescript
// ❌ リスク: 生 SQL
const sql = `UPDATE website SET note = '${userNote}'`;

// ✅ 安全: Prisma
await prisma.website.update({
  where: { id: websiteId },
  data: { note: userNote },  // パラメータ化
});
```

**リスク**: 低（Prisma が自動対応）

### 9.4 XSS 対策

**実装**: Next.js + React の自動エスケープ

```typescript
// React コンポーネント内
<div>{website.note}</div>  // 自動的に HTML エスケープ
// 出力: <div>&lt;script&gt;...&lt;/script&gt;</div>
```

**リスク**: 低（フレームワークの標準機能）

---

## 10. 他チームとの連携の確認

### 10.1 Frontend Engineer との連携必須項目

**確認が必要な項目**:

1. **UI コンポーネント選択**:
   - TextField か TextArea か？
   - 高さはいくつか？（テキストエリア行数）

2. **バリデーション UI**:
   - 文字数カウント表示（リアルタイム）
   - エラーメッセージの表示位置・スタイル

3. **メモ一覧表示**:
   - 省略表示は 100 文字か、別の長さか？
   - ツールチップで全文表示するか？
   - 「メモなし」の表示（"-" か、グレーアウトか）

4. **多言語対応**:
   - エラーメッセージの i18n 対応
   - ラベル名の確定（"Note" か "Memo" か）

**本設計との関連**: API・DB 層は確定。UI 詳細は Frontend Engineer スキルで設計。

### 10.2 Test Engineer との連携必須項目

**テストシナリオ確認**:
1. バリデーション: 500 字上限・null 値
2. 権限: Admin・所有者・チーム・権限なしユーザー
3. E2E: メモ編集・一覧表示・ページリロード後の保持

---

## 11. 実装チェックリスト

### Backend 実装

- [ ] Prisma スキーマに note フィールド追加
- [ ] マイグレーション作成・適用
- [ ] POST /api/websites/[websiteId] に note バリデーション追加
- [ ] zod スキーマで max(500) を定義
- [ ] 空文字列 → null への正規化実装
- [ ] エラーメッセージ: "Note must be 500 characters or less"

### Frontend 実装

- [ ] WebsiteEditForm に note フィールド追加
- [ ] TextArea で 500 字制限入力
- [ ] リアルタイムバリデーション（文字数カウント）
- [ ] WebsitesTable に note 列追加
- [ ] 省略表示ロジック実装（100 字 + "..."）
- [ ] i18n ラベル・エラーメッセージ定義

### テスト実装

- [ ] バリデーション単体テスト
- [ ] API 統合テスト（権限チェック）
- [ ] E2E テスト（UI からメモ編集まで）
- [ ] 既存サイト（note = null）の動作確認

---

## 12. 懸念事項と対応

### 懸念点1: Frontend との詳細設計がまだ

**懸念**: UI コンポーネントの詳細（TextArea サイズなど）が未確定

**対応**: 本アーキテクチャ設計は API・DB 層に特化。Frontend Engineer スキルで UI 詳細を設計。

**リスク度**: 低（責務分離が明確）

### 懸念点2: i18n 対応のタイミング

**懸念**: エラーメッセージの多言語対応を誰が実装するか

**対応**: Frontend Engineer が i18n ファイルを更新。Backend は英語の定数を定義。

**リスク度**: 低（実装手順が明確）

### 懸念点3: メモ検索機能の将来対応

**懸念**: 現在は検索機能なし。将来追加時にインデックス設計が必要

**対応**: 本設計ドキュメント 9 節「将来の拡張性」に記載。メモ検索実装時に改めて設計。

**リスク度**: 低（現在はスコープ外）

---

## 13. 承認判定

### 最終レビューコメント

**設計の強み**:
1. ✅ レイヤド・アーキテクチャで責務が明確
2. ✅ 既存パターン踏襲で実装が単純
3. ✅ 権限チェック・バリデーション・キャッシング機構を既存資産で実装
4. ✅ バックワード互換性が優秀
5. ✅ パフォーマンス影響がない
6. ✅ テスト戦略が明確（単体・統合・E2E）

**改善検討事項** (いずれも軽微・次フェーズ):
1. Frontend Engineer との UI 詳細設計が必要
2. Test Engineer とテストシナリオの詳細確認が必要
3. i18n 対応の責務分担確認が必要

**承認判定**: ✅ **承認** - 実装フェーズに移行可能

**条件付き承認**:
- Frontend Engineer スキルで UI/UX 設計を進める
- Test Engineer スキルでテスト設計を進める
- 二つのスキル設計が確定後、Backend 実装開始

---

## 14. 次ステップ

### フェーズ 1（並行実施）

1. **Backend**: Prisma スキーマ・マイグレーション準備
2. **Frontend**: WebsiteEditForm・WebsitesTable の UI 設計（frontend-engineer スキル）
3. **Test**: テストシナリオ作成（test-engineer スキル）

### フェーズ 2（実装）

1. Backend: API Route Handler・Prisma 実装
2. Frontend: React コンポーネント実装
3. Test: テストコード実装

### フェーズ 3（統合・検証）

1. API・UI 統合確認
2. E2E テスト実行
3. 本番化前検証（マイグレーション・データ確認）

