# API 仕様

## US-201 Webサイトメモ

### 背景

WebサイトメモはWebサイト設定の一部として扱うため、既存のWebサイトAPIと更新権限を再利用する。これにより、現在の「Settings > Websites」の導線と互換性を保ち、メモ専用の権限モデルを追加しない。

### Webサイトリソースの形式

`GET /api/websites/{websiteId}`、`POST /api/websites/{websiteId}`、およびWebサイト一覧APIが返す `Website` レスポンスには、以下を含める。

| フィールド | 型 | 必須 | 備考 |
| --- | --- | --- | --- |
| `notes` | `string \| null` | はい | プレーンテキストのメモ。`null` は未設定を表す。非 `null` の場合は最大500文字。 |

`id`、`name`、`domain`、`createdAt`、`updatedAt`、`teamId`、`shareId`、`recorderEnabled`、`replayConfig` などの既存フィールドは、現在の挙動を維持する。

### Webサイト更新

`POST /api/websites/{websiteId}` は、既存のWebサイト更新ボディに加えて任意の `notes` フィールドを受け付ける。

```json
{
  "name": "Marketing site",
  "domain": "example.com",
  "notes": "Production storefront. Owner: Growth team."
}
```

処理ルール:

1. `notes` が省略された場合、既存のメモは変更しない。
2. `notes.trim()` が空文字列の場合、`notes` は `null` として保存する。
3. `notes` に空白以外の文字が含まれ、長さが1文字以上500文字以下の場合、元のテキストをプレーン文字列として保存する。
4. `notes` が501文字以上の場合、保存前にリクエストを拒否する。
5. 認可は既存の `canUpdateWebsite(auth, websiteId)` ルールを使用する。

成功レスポンス: HTTP `200` で、`notes` を含む更新後のWebサイトリソースを返す。

### エラーレスポンス

すべてのエラーは既存の `error` エンベロープを使用する。

| ケース | HTTPステータス | レスポンスボディ |
| --- | --- | --- |
| メモが500文字を超える | `400` | `{ "error": { "message": "Notes must be 500 characters or fewer.", "code": "validation-error", "status": 400, "field": "notes" } }` |
| 認証済み主体にWebサイト更新権限がない | `401` | `{ "error": { "message": "Unauthorized", "code": "unauthorized", "status": 401 } }` |
| Webサイトが存在しない | `400` | `{ "error": { "message": "Website not found.", "code": "bad-request", "status": 400 } }` |

### Webサイト一覧

「Settings > Websites」を構成するWebサイト一覧エンドポイントは、各行オブジェクトに `notes` を含める。

- `GET /api/me/websites`
- `GET /api/users/{userId}/websites`
- `GET /api/teams/{teamId}/websites`
- `GET /api/admin/websites`

APIはメモの全文を返す。UIでの省略表示はプレゼンテーション層の責務とする。
