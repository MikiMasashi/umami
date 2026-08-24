# API仕様書

このドキュメントはストーリーをまたいで蓄積される、umami の API 設計の最終成果物である。
各ストーリーで追加・変更された内容は該当セクションに追記する。

## US-201: ウェブサイトへのメモ（notes）機能

### 変更方針・根拠

- 既存の `Website` エンティティ・API（`GET /api/websites/{websiteId}`、`POST /api/websites/{websiteId}`、
  一覧系 `GET /api/me/websites` 等）に `notes` フィールドを追加する形で対応する。新規エンドポイントは設けない
  （既存の CRUD API に乗せるほうが、既存のクライアントフック `useWebsiteQuery` / `useUpdateQuery` /
  `useUserWebsitesQuery` をそのまま再利用でき、後方互換性も担保しやすいため）。
- 検討した代替案: `notes` 専用の `PATCH /api/websites/{websiteId}/notes` エンドポイントを新設する案。
  → 却下。メモは「ウェブサイトの属性の一つ」であり、変更履歴やメモ専用権限を持たない（要件の Won't
  スコープ）ため、専用エンドポイントを設ける理由がない。既存更新APIに含めるほうがシンプルで一貫性がある。
- 文字数上限（500文字）はクライアント・サーバー双方でバリデーションする（要件の非機能要件・受け入れ条件
  US-201-4 に基づく Must 要件）。サーバー側は zod スキーマで担保し、クライアント側のみに依存しない。
- 更新権限は既存の `canUpdateWebsite` をそのまま利用し、メモ専用の権限区分は設けない
  （要件スコープ外: 「メモごとの個別権限設定」）。
- 詳細画面での編集可否をクライアント側でも判定できるよう、`GET /api/websites/{websiteId}` のレスポンスに
  `canUpdate`（真偽値）を追加する。これは既存の `canUpdateWebsite(auth, websiteId)` の結果をそのまま
  返すものであり、メモ専用の新しい権限ロジックではない。追加理由: フロントエンドが「閲覧はできるが編集は
  できない」（受け入れ条件 US-201-5-2）をサーバーの権限判定と一致させて表示制御するため、既存の権限モデルの
  再実装（クライアント側での独自権限判定）を避ける目的。
- 却下した代替案: フロントエンドで `canUpdateWebsite` 相当のロジックを再実装する。
  → 却下。権限ロジックの二重管理は不整合を生みやすく、既存の「権限チェックは既存の仕組みに準拠する」
  という非機能要件に反する。

### GET /api/websites/{websiteId}

- 認可: `canViewSharedWebsite(auth, websiteId)`（既存のまま変更なし）。
- レスポンス 200 のボディに以下のフィールドを追加する（既存フィールドは変更しない）。

```jsonc
{
  "id": "uuid",
  "name": "string",
  "domain": "string | null",
  "resetAt": "string | null",
  "userId": "uuid | null",
  "teamId": "uuid | null",
  "createdBy": "uuid | null",
  "createdAt": "string",
  "updatedAt": "string",
  "deletedAt": "string | null",
  "recorderEnabled": "boolean",
  "replayConfig": "object | null",
  "notes": "string | null",   // 追加: 未設定の既存サイトは null
  "canUpdate": "boolean",     // 追加: canUpdateWebsite(auth, websiteId) の結果
  "shareId": "string | null"
}
```

### GET /api/me/websites, GET /api/users/{userId}/websites, GET /api/teams/{teamId}/websites

- 既存のページングレスポンス（`{ data: Website[], count, page, pageSize, orderBy, search }`）の
  各 `data[]` 要素に `notes: string | null` を追加する（`canUpdate` は一覧では返さない。一覧は
  行の編集導線＝詳細画面遷移のみで、直接編集操作を持たないため）。

### POST /api/websites/{websiteId}（更新）

- 認可: `canUpdateWebsite(auth, websiteId)`（既存のまま。メモの更新もこのチェックの対象に含まれる）。
- リクエストボディのスキーマに `notes` を追加する。

```ts
const schema = z.object({
  name: z.string().max(100).optional(),
  domain: z.string().max(500).optional(),
  notes: z.string().max(500).nullable().optional(), // 追加
  shareId: z.string().max(50).nullable().optional(),
  replayConfig: z.object({ /* 既存のまま */ }).nullable().optional(),
});
```

- `notes` の扱い:
  - 空文字列 `""` を送信した場合は「未設定」として `null` に正規化して保存する
    （受け入れ条件 US-201-1-4: 空にして保存 → 「未設定」として保存される）。
  - `notes` フィールド自体を省略（`undefined`）した場合は既存値を変更しない
    （受け入れ条件 US-201-2-3: メモ以外の項目のみの更新でメモを維持する）。
  - 500文字を超える場合、zod の `max(500)` バリデーションにより **リクエストが `parseRequest` の
    スキーマ検証段階で拒否される**（`canUpdateWebsite` のチェックより前）。
- レスポンス 200 のボディ形式は GET と同じ（`notes` を含む更新後の website オブジェクト + `shareId`）。

### エラーレスポンス形式（既存 `src/lib/response.ts` を踏襲、変更なし）

#### バリデーションエラー（400 Bad Request）

`notes` が500文字を超える場合、`parseRequest` が zod の `safeParse` 失敗を検出し、
`badRequest(z.treeifyError(result.error))` を返す。HTTP ステータスは **400**。

```jsonc
{
  "error": {
    "message": "Bad request",
    "code": "bad-request",
    "status": 400,
    // z.treeifyError() の出力がマージされる（既存の name/domain バリデーションと同じ形式）
    "properties": {
      "notes": {
        "errors": ["Too big: expected string to have <=500 characters"]
      }
    }
  }
}
```

> 注: `properties.notes.errors` の正確な文言は zod のバージョンに依存するため、
> テストでは `response.status() === 400` と `body.error.code === 'bad-request'` の検証を必須とし、
> `properties` の存在確認までに留める（zod のエラーメッセージ文言そのものへの依存を避ける）。

#### 認可エラー（401 Unauthorized）

更新権限（`canUpdateWebsite`）を持たないユーザーが更新APIを呼び出した場合、既存の `unauthorized()` が
返す形式のまま変更しない。HTTP ステータスは **401**。

```jsonc
{
  "error": {
    "message": "Unauthorized",
    "code": "unauthorized",
    "status": 401
  }
}
```

このレスポンスが返る時点で `notes` を含むいかなるフィールドも更新されない
（`canUpdateWebsite` のチェックは Prisma の `updateWebsite` 呼び出しより前に行われるため）。

### 後方互換性

- 既存ウェブサイト（メモ機能導入前に作成、`notes` カラムは `null`）に対して:
  - `GET /api/websites/{websiteId}` は `notes: null` を返す（エラーにならない）。
  - 一覧APIは該当行の `notes: null` を返す。
  - `notes` を含まない POST リクエスト（既存クライアントからの呼び出しを含む）は、`notes` を
    変更せず、既存の name/domain 更新のみ成功する。
