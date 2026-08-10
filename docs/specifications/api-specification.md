# API 設計仕様書

このドキュメントは API 設計の最終成果物であり、ストーリーをまたいで蓄積される。

## 1. 対象エンドポイント（既存）

| メソッド | パス | 用途 |
|---|---|---|
| GET | `/api/websites` | ログインユーザーのウェブサイト一覧取得 |
| POST | `/api/websites` | ウェブサイト新規作成 |
| GET | `/api/websites/:websiteId` | ウェブサイト詳細取得 |
| POST | `/api/websites/:websiteId` | ウェブサイト更新（部分更新） |
| DELETE | `/api/websites/:websiteId` | ウェブサイト削除 |

## 2. US-201: notes フィールドの追加

### 2.1 `POST /api/websites`（新規作成）

**リクエストスキーマ変更**（`src/app/api/websites/route.ts`）:

```ts
const schema = z.object({
  name: z.string().max(100),
  domain: z.string().max(500),
  notes: z.string().max(500).nullable().optional(), // 追加
  shareId: z.string().max(50).nullable().optional(),
  teamId: z.uuid().nullable().optional(),
  id: z.uuid().nullable().optional(),
});
```

- `notes` は既存の `shareId` 等と同様に `.nullable().optional()` とし、未指定時は `undefined`（DB には `null` として保存）を許容する。
- サーバー側で 500 文字超過時は zod のバリデーションエラーとして 400 系レスポンスを返す（既存の `parseRequest` のエラーハンドリング機構に準拠、実装は行わないが契約として定義）。
- `createWebsite` に渡す `data` オブジェクトに `notes` を追加する。

### 2.2 `POST /api/websites/:websiteId`（更新）

**リクエストスキーマ変更**（`src/app/api/websites/[websiteId]/route.ts`）:

```ts
const schema = z.object({
  name: z.string().max(100).optional(),
  domain: z.string().max(500).optional(),
  notes: z.string().max(500).nullable().optional(), // 追加
  shareId: z.string().max(50).nullable().optional(),
  replayConfig: z.object({ ... }).nullable().optional(),
});
```

**ハンドラ変更（契約）**:

```ts
const { name, domain, notes, shareId, replayConfig } = body;

// 権限チェック（既存のまま、変更なし）
if (!(await canUpdateWebsite(auth, websiteId))) {
  return unauthorized();
}

const website = await updateWebsite(websiteId, {
  name,
  domain,
  notes: notes === undefined ? undefined : (notes?.trim() ? notes : null),
  ...(replayConfig !== undefined && { ... }),
});
```

- `notes` が空文字列 `''` またはトリム後に空になる場合は `null` に正規化して保存する（data-specification.md §3.2 と整合）。
- `notes` が undefined（リクエストボディに含まれない）の場合は既存値を変更しない（Prisma の `update` は `undefined` を渡したフィールドを更新対象から除外する挙動を利用する。これは既存の `name`/`domain` と同一の扱い）。
- **権限制御（US-201-6）**: `notes` の更新も既存の `canUpdateWebsite` チェックの対象に含まれる。これはハンドラの構造上、更新権限チェックがボディ全体に対する一括ゲートとして機能しているため、`notes` を追加するだけで自動的に同じ権限保護下に置かれる。専用の権限分岐は不要。

### 2.3 GET エンドポイント（一覧・詳細）

- `GET /api/websites` / `GET /api/websites/:websiteId` はレスポンススキーマの明示的な絞り込みを行っておらず、Prisma の `Website` モデルの全カラムをそのまま返す実装のため、`notes` カラムを追加するだけで自動的にレスポンスに含まれる。スキーマ変更・ハンドラ変更は不要。
- **閲覧権限**: 既存の `canViewSharedWebsite` / ユーザー所有・チーム所属によるフィルタ済みクエリ（`getUserWebsites` 等）にそのまま従う。メモ専用の閲覧制限は設けない（要件 US-201-6: 閲覧権限があれば閲覧は可能、編集不可のみを制御）。

### 2.4 レスポンス例

```jsonc
// GET /api/websites/:websiteId
{
  "id": "b1...e9",
  "name": "Production Site",
  "domain": "example.com",
  "notes": "本番環境。マーケティング部門依頼。",
  "shareId": null,
  "createdAt": "2024-01-01T00:00:00.000Z",
  ...
}

// notes 未設定の既存サイト（後方互換）
{
  "id": "c2...f0",
  "name": "Legacy Site",
  "domain": "legacy.example.com",
  "notes": null,
  ...
}
```

## 3. バリデーション方針（クライアント/サーバー二重化）

| 層 | 実装箇所 | 内容 |
|---|---|---|
| クライアント | `WebsiteEditForm` の `FormField` の `rules`（react-hook-form 経由） | 500文字を超えた入力時に送信をブロックし、エラーメッセージを表示（`messages.ts` に追加するエラーメッセージキーを使用）。 |
| サーバー | API ルートの zod スキーマ（`z.string().max(500)`） | クライアント側バリデーションを回避した直接 API 呼び出しに対しても、500文字超過時は 400 エラーを返す。 |
| DB | `VarChar(500)` カラム制約 | アプリケーション層の実装漏れに対する最終防衛線（data-specification.md 参照）。 |

- 「500文字ちょうどは許可、501文字以上を拒否」という要件定義書の前提（§7-1）に従い、`max(500)` を採用する（zod の `.max(n)` は `length <= n` を許容する仕様のため、そのまま要件を満たす）。

## 4. エラーハンドリング

- バリデーションエラー: 既存の `parseRequest` の共通エラーハンドリングに従う（zod のバリデーションエラーは自動的に 400 Bad Request として返却される、既存の `domain`/`name` と同じ経路）。新規のエラーレスポンス形式は追加しない。
- 権限エラー: 既存の `unauthorized()` ヘルパーをそのまま使用（US-201-6 が要求する「既存の更新API権限チェックと同様のレスポンス」を満たす）。

## 5. 設計判断の根拠まとめ

| 判断 | 根拠 |
|---|---|
| 既存の `POST /websites` / `POST /websites/:id` エンドポイントにフィールド追加 | 単一属性の追加であり、新規エンドポイントを設けるとクライアント側で2回の API 呼び出しが必要になり UX・実装コストが悪化する。既存の部分更新パターン（`name`/`domain`/`replayConfig` と同様）に合わせるのが自然。 |
| `notes` を `nullable().optional()` に | `shareId` と同じパターンを踏襲し、「未指定＝変更なし」「null＝クリア」という既存の意味論と統一する。 |
| GET 系のレスポンススキーマを変更しない | 既存実装が Prisma モデルをそのまま返す設計であり、新規カラムは自動的に反映されるため変更不要。無駄な変更は既存動作へのリグレッションリスクを高める。 |

## 6. 却下した代替案

| 代替案 | 却下理由 |
|---|---|
| メモ専用エンドポイント `PATCH /api/websites/:websiteId/notes` | 単一フィールドのために独立エンドポイントを作ると、権限チェック・エラーハンドリングのロジックを重複させることになり、保守性が下がる。既存の汎用更新エンドポイントで十分要件を満たせる。 |
| `notes` のバリデーションをサーバー側のみ（クライアント側は行わない） | 要件の非機能要件で「クライアント・サーバー両方で検証する」と明記されているため、サーバーのみの実装は要件未達となる。 |
| GET レスポンスから `notes` を除外し、専用の詳細取得エンドポイントを設ける | 一覧・編集画面双方でメモの表示が要件化されており（US-201-1, US-201-3）、既存の詳細取得レスポンスに含める方がシンプルで往復回数も増えない。 |
