# API Specification

## US-201: Website Notes

### 1. 対象 API
- 本仕様で扱うエンドポイントは**すべて既存 API**であり、新規エンドポイントの追加はありません。
- `POST /api/websites`（Website 作成）
- `POST /api/websites/{websiteId}`（Website 更新）
- `GET /api/websites`
- `GET /api/websites/{websiteId}`

### 2. 設計方針
- `notes` は Website の任意項目として保持する（`null` 許容）。
- 文字数上限は **500 文字**。サーバー側で必須検証する。
- 認可は既存の Website 更新権限（`canUpdateWebsite`）を継続利用する。
- 一覧表示での省略は API ではなく UI 責務とし、API は保存した全文を返す。

### 3. リクエスト/レスポンス契約

## 3.1 `POST /api/websites`

### Request Body（追加項目のみ抜粋）
```json
{
  "name": "Production",
  "domain": "example.com",
  "notes": "Primary production site for JP market."
}
```

- `notes`: `string | null | undefined`
  - `undefined`/`null`/空文字を許容
  - 1 文字以上の場合は最大 500 文字

### Success Response `200`
```json
{
  "id": "website-id",
  "name": "Production",
  "domain": "example.com",
  "notes": "Primary production site for JP market."
}
```

## 3.2 `POST /api/websites/{websiteId}`

### Request Body（追加項目のみ抜粋）
```json
{
  "notes": "Updated operations note."
}
```

### Success Response `200`
```json
{
  "id": "website-id",
  "name": "Production",
  "domain": "example.com",
  "notes": "Updated operations note."
}
```

## 3.3 `GET /api/websites`, `GET /api/websites/{websiteId}`

- Website オブジェクトに `notes` を含める。
- `notes` が未設定の場合は `null` または空文字（DB 保存値）をそのまま返す。

### 4. エラーレスポンス契約

| ケース | HTTP | `error.code` | `error.message` |
|---|---:|---|---|
| notes が 500 文字超過 | 400 | `bad-request` | `Bad request` |
| 更新権限なし | 401 | `unauthorized` | `Unauthorized` |
| 対象 Website 不在 | 400 | `bad-request` | `Website not found.` |

共通形式:
```json
{
  "error": {
    "message": "Bad request",
    "code": "bad-request",
    "status": 400
  }
}
```

### 5. 根拠
- 既存 API が `zod` + `parseRequest` + `badRequest/unauthorized` で統一されているため、同一形式に揃える。
- 一覧省略は画面要件（FR-201-05）であり、API レイヤで切り詰めると再利用時に情報損失が起きるため全文返却を採用。
