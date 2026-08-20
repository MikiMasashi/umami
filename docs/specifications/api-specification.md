# API Specification

## US-201: Website Notes

### 目的
- Website に運用メモ（`notes`）を保存・取得できる API 契約を追加し、既存の Website 一覧/詳細取得フローでそのまま参照可能にする。

### 対象エンドポイント
1. `POST /api/websites/[websiteId]`（既存更新 API の拡張）
2. `GET /api/websites/[websiteId]`（既存詳細 API、レスポンス項目拡張）
3. `GET /api/me/websites` / `GET /api/users/[userId]/websites` / `GET /api/teams/[teamId]/websites` / `GET /api/admin/websites`（既存一覧 API、レスポンス項目拡張）

### リクエスト契約
#### `POST /api/websites/[websiteId]`
- 既存の `name`, `domain`, `shareId`, `replayConfig` に加えて `notes` を受け付ける。

```json
{
  "name": "example",
  "domain": "example.com",
  "notes": "本番サイト。広告施策A/Bテスト中。",
  "shareId": "optional-share-id",
  "replayConfig": {
    "replayEnabled": true
  }
}
```

- `notes` 型: `string | null | undefined`
- バリデーション:
  - 500 文字以下のみ許可（501 文字以上は 400）
  - `null` は「メモ削除」を意味する
  - 空文字は許可するが、永続化前に `null` 正規化（一覧表示条件を単純化するため）

### レスポンス契約
- Website 取得系レスポンスに `notes` を追加する。

```json
{
  "id": "uuid",
  "name": "example",
  "domain": "example.com",
  "notes": "本番サイト。広告施策A/Bテスト中。",
  "createdAt": "2026-08-20T00:00:00.000Z"
}
```

- `notes` は `string | null`。未設定は `null` を返す。
- 一覧 API では省略前の生テキストを返し、省略表示は UI 側責務とする（表示ルール変更時に API 互換性を壊さないため）。

### 認可・エラー
- 更新は既存の `canUpdateWebsite(auth, websiteId)` をそのまま利用。
- 権限なし: `401 Unauthorized`
- バリデーション違反（文字数超過）: `400 Bad Request`（既存エラーレスポンス形式に準拠）

### 互換性方針
- 既存クライアントに必須パラメータ追加はしない（`notes` は optional）。
- 既存レスポンスへの nullable フィールド追加のみ（後方互換）。

### 根拠（採用理由）
1. 既存 `POST /api/websites/[websiteId]` を拡張することで権限制御・更新導線を再利用できる。
2. 一覧 API で `notes` 生値を返せば、UI 側での省略・非表示判定が柔軟になる。
3. `notes` の `null` 正規化で「未表示条件（notes なし）」を全画面で一貫化できる。
