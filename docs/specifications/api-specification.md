# API仕様書

このドキュメントは umami のAPI設計の最終成果物である。ストーリーをまたいで累積更新する。

---

## US-201: ウェブサイトへのメモ（notes）機能

### 1. 対象エンドポイント

既存のウェブサイト取得・更新APIを流用し、新規エンドポイントは追加しない。

| メソッド | パス | 変更内容 |
|---|---|---|
| GET | `/api/websites/:websiteId` | レスポンスに `notes` フィールドを追加（既存の `getWebsite()` がPrismaモデルをそのまま返すため、スキーマ変更のみで自動的に反映される） |
| POST | `/api/websites/:websiteId` | リクエストボディに任意項目 `notes` を追加。バリデーション・権限チェック・保存処理を拡張 |
| GET | `/api/websites`（一覧） | レスポンス配列内の各要素に `notes` フィールドを追加（一覧取得の `getWebsites()` も同様に自動反映） |

**根拠**: FR-1・FR-2・FR-4・FR-5 は、既存の Website 取得・更新・一覧APIに `notes` フィールドを乗せることで実現できる。新規リソースではなく既存Websiteエンティティの属性拡張であるため、専用エンドポイントを新設するとAPI表面が不必要に増え、権限チェックロジックの重複（FR-6のための二重実装リスク）を招く。既存の `canViewSharedWebsite` / `canUpdateWebsite` をそのまま利用できる設計とする。

### 2. リクエスト／レスポンス契約

#### POST `/api/websites/:websiteId`（更新）

`src/app/api/websites/[websiteId]/route.ts` の zod スキーマを拡張する。

```ts
const schema = z.object({
  name: z.string().max(100).optional(),
  domain: z.string().max(500).optional(),
  notes: z.string().max(500).nullable().optional(), // ← 追加
  shareId: z.string().max(50).nullable().optional(),
  replayConfig: z.object({ ... }).nullable().optional(),
});
```

- **`notes` の型**: `string | null | undefined`
  - `undefined`（キー自体が存在しない） → 更新対象から除外（他フィールドのみの更新と共存できるようにするため、他フィールドと同じ「省略可能」パターンに合わせる）。
  - `string`（0〜500文字） → 保存対象。空文字はサーバー側で `null` に正規化してから永続化する（データ仕様書 3章参照）。
  - `501文字以上` → zod の `.max(500)` によりバリデーションエラー（400 Bad Request相当、`parseRequest` の共通エラーハンドリング経由）となり保存されない（FR-3）。
  - `null` → 明示的にメモをクリアする操作として扱う（`undefined` との区別により「メモ欄自体を対象外にする」操作と「メモを空にする」操作を将来分離できる余地を残すが、現行UIは空文字送信のみを使う想定。詳細はフロントエンド設計参照）。

- **権限チェック**: 既存の `canUpdateWebsite(auth, websiteId)` の判定結果に、`notes` を含む更新リクエスト全体を一致させる。メモ専用の権限は設けない（要件定義書 8章-4 の方針、FR-6 に準拠）。他フィールド同様、権限がない場合は `unauthorized()`（401/403相当）を返し、DBは更新しない。

- **保存処理**: `updateWebsite()` 呼び出し時に `notes` を渡す。

```ts
const website = await updateWebsite(websiteId, {
  name,
  domain,
  notes: notes === undefined ? undefined : (notes === '' ? null : notes),
  ...(replayConfig !== undefined && { ... }),
});
```

#### GET `/api/websites/:websiteId`（詳細取得）／ GET `/api/websites`（一覧取得）

- レスポンスの Website オブジェクトに `notes: string | null` を含める。
- 追加のシリアライズ処理は不要（Prismaモデルがそのままシリアライズされるため）。
- 閲覧権限（`canViewSharedWebsite` / `canViewWebsite`）を持つユーザーであれば `notes` を含め全フィールドを閲覧可能とする（FR-6「読み取りは可、書き込みのみ制限」）。

### 3. エラーハンドリング

| ケース | HTTPステータス | 挙動 |
|---|---|---|
| 501文字以上の `notes` を送信 | 400 Bad Request | zodバリデーションエラーとして `parseRequest` が既存の共通フローで弾く。DBには到達しない。 |
| 更新権限のないユーザーが `notes` を含むPOSTを送信 | 401/403（既存の `unauthorized()` ヘルパーに準拠） | `canUpdateWebsite` が false を返し、ハンドラ冒頭で早期リターン。DBは変更されない。 |
| 存在しない `websiteId` | 400 Bad Request | 既存の `currentWebsite` null チェックを流用（変更なし）。 |

### 4. 後方互換性

- `notes` はリクエスト・レスポンス双方で optional（レスポンス側は常に返すが値は `null` 許容）とし、既存クライアント（`notes` を知らない旧フロントエンド等）が `notes` を送らずに更新しても既存の `notes` 値は変更されない（`undefined` は更新対象外として扱うため）。
- 既存の自動テスト・E2Eで期待されるレスポンス形状（`name`, `domain`, `shareId` 等）に対して、フィールド追加のみで既存フィールドの型・意味は変更しない（非破壊的変更）。

### 5. 却下した代替案

| 代替案 | 却下理由 |
|---|---|
| `PATCH /api/websites/:websiteId/notes` 専用エンドポイント新設 | メモは Website の一属性に過ぎず、他フィールド（name, domain 等）と同じ更新トランザクション・権限モデルに乗せる方が非機能要件「データ整合性」（同一トランザクション/検証フローに乗せる）に合致する。専用エンドポイントは権限チェックとバリデーションの二重実装を招き、保守コストが増える。 |
| `notes` 空文字送信時にサーバー側で400エラーを返す | 要件（FR-2）は「空にして保存」を正常系として許容しており、`null` への正規化で対応する方が自然。エラーにするとUXを損なう。 |
| GraphQL的な部分更新パッチ形式（JSON Patch等）の導入 | 既存APIは単純なJSONボディでの全体/部分フィールド更新（optionalフィールドのマージ）方式を一貫して採用しており、本機能単体のために新しいプロトコルを導入するのは過剰設計。既存パターン踏襲を優先。 |
