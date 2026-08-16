# API 設計仕様書: umami

- 対象プロダクト: umami
- 管理方針: ストーリーをまたいで蓄積する最終成果物（設計結果 + 根拠）
- 最終更新: US-201

---

## 1. 方針

umami の API は Next.js App Router のルートハンドラ（`src/app/api/**/route.ts`）で実装し、
入力検証は zod、権限判定は `src/permissions`、レスポンス整形は `src/lib/response.ts` の
ヘルパ（`json` / `ok` / `badRequest` / `unauthorized` / `forbidden` / `serverError`）に統一する。
新規ストーリーは、可能な限り既存エンドポイントの拡張で対応し、専用エンドポイントの新設は最小化する。

### 1.1 共通エラーレスポンス形式

全ハンドラは `src/lib/response.ts` の形式に従う。ボディは常に `error` を頂点に持つ。

```jsonc
{
  "error": {
    "message": "Bad request",
    "code": "bad-request",
    "status": 400
    // 追加フィールド（例: zod の treeify 結果）が展開される
  }
}
```

| 種類 | HTTP | code | 生成元 |
| --- | --- | --- | --- |
| バリデーション失敗 | 400 | `bad-request` | `parseRequest` が `badRequest(z.treeifyError(...))` |
| 認証・権限なし | 401 | `unauthorized` | `unauthorized()` |
| リソース不整合（例: not found） | 400 | `bad-request` | `badRequest({ message })` |
| サーバエラー | 500 | `server-error` | `serverError()` |

zod 検証失敗時は `parseRequest`（`src/lib/request.ts`）が `z.treeifyError` の結果を
`error` に展開する。フィールド単位のエラーは `error.properties.<field>.errors[]` に入る。

---

## 2. US-201: ウェブサイトのメモ（notes）

### 2.1 設計判断（専用エンドポイントを作らない）

要件（対象外: 「メモ単体の専用 API エンドポイントの新設」）に従い、**既存の
ウェブサイト更新 API に `notes` フィールドを載せる**。これにより権限判定・監査・
キャッシュ無効化などの既存経路を再利用でき、退行リスク・保守コストを最小化できる。

- 取得: `GET /api/websites/{websiteId}`（既存）— レスポンスに `notes` を含める。
- 更新: `POST /api/websites/{websiteId}`（既存）— リクエストで `notes` を受け付ける。

### 2.2 `GET /api/websites/{websiteId}`

- 権限: `canViewSharedWebsite`（既存のまま）。
- レスポンス: 既存の Website オブジェクトに `notes: string | null` を追加。
  - 未設定（レガシー含む）は `null`。

```jsonc
{
  "id": "…",
  "name": "…",
  "domain": "…",
  "notes": "本番環境 / マーケ依頼",   // 未設定は null
  "shareId": null,
  "createdAt": "…"
  // 既存フィールドは変更しない
}
```

### 2.3 `POST /api/websites/{websiteId}`

既存の zod スキーマに `notes` を追加する（他フィールドは不変）。

```ts
notes: z
  .string()
  .trim()                     // 前後空白・改行のみは空とみなす（OQ-2）
  .max(500, { message: 'Notes must be 500 characters or less.' })  // コードポイント数（OQ-1）
  .nullable()
  .optional()                 // 後方互換: 省略時は notes を変更しない
  .transform(v => (v === '' ? null : v)) // トリム後に空なら未設定(null)へ正規化
```

処理仕様:

| 入力 | サーバの扱い | 結果 |
| --- | --- | --- |
| `notes` 省略 | 変更しない | 既存値を保持（後方互換, AC-8） |
| `notes` = 有効文字列（≤500 codepoints, トリム後非空） | `notes` を更新 | 200 |
| `notes` = `""` / 空白のみ / 改行のみ | トリム後空 → `null` に正規化 | 200（未設定と同等, AC-9） |
| `notes` = `null` | `null` に更新（クリア） | 200 |
| `notes` = 501 codepoints 以上 | zod で拒否 | 400 `bad-request`（下記） |

権限:

- `canUpdateWebsite(auth, websiteId)` が偽なら **他の処理より前に** `unauthorized()`（401）。
  クライアント検証をバイパスした直接リクエストでも同様に 401（FR-5 / NFR-2 / AC-7）。

文字数超過時（AC-6）の 400 レスポンス例:

```jsonc
{
  "error": {
    "message": "Bad request",
    "code": "bad-request",
    "status": 400,
    "properties": {
      "notes": { "errors": ["Notes must be 500 characters or less."] }
    }
  }
}
```

### 2.4 一覧 API

一覧は既存の以下を再利用する（`src/queries/prisma/website.ts`）。レスポンスの各行に
`notes` を含め、フロントの一覧表示に利用する。**取得列に `notes` を含めるだけで、
新規クエリ・N+1 は発生させない**（NFR-4）。

- `GET /api/me/websites`
- `GET /api/users/{userId}/websites`
- `GET /api/teams/{teamId}/websites`

各行:

```jsonc
{ "id": "…", "name": "…", "domain": "…", "notes": "…"|null, "createdAt": "…", "shareId": null }
```

---

## 3. セキュリティ

- 文字数上限（500 codepoints）は**サーバ側でも zod で検証**し、クライアント検証の
  バイパスを防ぐ（NFR-2）。
- メモはプレーンテキストとして保存し、表示は既存の React エスケープ描画（`{text}`）に
  従い、`dangerouslySetInnerHTML` を用いない（XSS 防止, NFR-2）。
- 権限判定は既存 `canUpdateWebsite` に準拠し、新規権限体系は作らない。

---

## 4. 後方互換

- `notes` は任意（`optional`）かつ NULL 許容。省略時は既存値を保持するため、
  メモに無関係な更新（名前・ドメイン等）は従来どおり動作する（AC-8）。
