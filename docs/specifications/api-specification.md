# API Specification

## US-201 Website notes

### Context
- 対象画面: `src/app/(main)/websites/[websiteId]/settings/page.tsx`
- 一覧画面: `src/app/(main)/websites/page.tsx`
- 既存の website 更新 API は `POST /api/websites/{websiteId}` を使用しているため、US-201 も同じ集約を更新する。
- 権限判定は既存の `canUpdateWebsite(auth, websiteId)` / `canViewSharedWebsite(auth, websiteId)` に合わせる。

### Endpoint overview

| Purpose | Method | Path | AuthZ |
|---|---|---|---|
| ウェブサイト詳細取得（notes を含む） | GET | `/api/websites/{websiteId}` | `canViewSharedWebsite` |
| ウェブサイト更新（notes の保存・削除を含む） | POST | `/api/websites/{websiteId}` | `canUpdateWebsite` |
| 一覧表示用データ取得（notes を含む） | GET | `/api/websites` | 既存一覧 API を拡張して `notes` を返却 |

### 1. GET `/api/websites/{websiteId}`

#### Purpose
- ウェブサイト設定詳細画面のメモ初期値取得
- 再読み込み後の保持確認
- 既存の website GET エンドポイントに notes を追加返却

#### Response 200
```json
{
  "id": "3c4a4ed3-7f71-4a42-9bc8-0f9f34e5fa12",
  "name": "My Website",
  "domain": "example.com",
  "notes": "本番用サイト。2026年Q4キャンペーン計測に利用。",
  "updatedAt": "2026-08-18T11:20:00.000Z"
}
```

#### Response 200 (no note yet)
```json
{
  "id": "3c4a4ed3-7f71-4a42-9bc8-0f9f34e5fa12",
  "name": "My Website",
  "domain": "example.com",
  "notes": null,
  "updatedAt": "2026-08-18T11:20:00.000Z"
}
```

#### Status codes
- `200 OK`: 取得成功
- `401 Unauthorized`: 未認証、または閲覧不可
- `404 Not Found`: 対象 website が存在しない
- `500 Internal Server Error`: 想定外エラー

### 2. POST `/api/websites/{websiteId}`

#### Purpose
- ウェブサイト情報の更新（既存の website 更新 API）
- メモの新規入力・上書き更新・削除（空文字送信）を統合

#### Request body
```json
{
  "name": "Updated Name",
  "domain": "newdomain.com",
  "notes": "本番用サイト。障害調査時はCSチームへ連絡。"
}
```

#### Request body (delete note via empty string)
```json
{
  "name": "Updated Name",
  "domain": "newdomain.com",
  "notes": ""
}
```

#### Validation
- `notes`: string, max 500
- 空文字は許可し、永続化時は `null` に正規化する
- 改行は許可

#### Response 200 (save/update)
```json
{
  "id": "3c4a4ed3-7f71-4a42-9bc8-0f9f34e5fa12",
  "name": "Updated Name",
  "domain": "newdomain.com",
  "notes": "本番用サイト。障害調査時はCSチームへ連絡。",
  "updatedAt": "2026-08-18T11:20:00.000Z"
}
```

#### Response 200 (delete via empty string)
```json
{
  "id": "3c4a4ed3-7f71-4a42-9bc8-0f9f34e5fa12",
  "name": "Updated Name",
  "domain": "newdomain.com",
  "notes": null,
  "updatedAt": "2026-08-18T11:20:00.000Z"
}
```

#### Status codes
- `200 OK`: 保存/削除成功
- `400 Bad Request`: Zod バリデーションエラー
- `401 Unauthorized`: 未認証、または更新不可
- `404 Not Found`: 対象 website が存在しない
- `500 Internal Server Error`: 想定外エラー

### 3. GET `/api/websites`

#### Purpose
- 一覧画面で notes 列を表示するため、既存レスポンスへ `notes` を追加する

#### Response item example
```json
{
  "id": "3c4a4ed3-7f71-4a42-9bc8-0f9f34e5fa12",
  "name": "Marketing Prod",
  "domain": "example.com",
  "notes": "本番用サイト。2026年Q4キャンペーン計測に利用。",
  "createdAt": "2026-08-01T10:00:00.000Z"
}
```

#### UI display rule
- `notes === null` または `notes === ""` は空表示
- 50文字超は省略表示（例: `xxxxxxxx...`）
- 全文確認は tooltip または設定詳細遷移で担保

### Error response contract

#### Validation error (`400`)
```json
{
  "error": {
    "message": "メモは500文字以内です",
    "code": "VALIDATION_ERROR",
    "status": 400
  }
}
```

#### Unauthorized (`401`)
```json
{
  "error": {
    "message": "メモを編集する権限がありません",
    "code": "FORBIDDEN_WEBSITE_UPDATE",
    "status": 401
  }
}
```

#### Not found (`404`)
```json
{
  "error": {
    "message": "対象のウェブサイトが見つかりません",
    "code": "WEBSITE_NOT_FOUND",
    "status": 404
  }
}
```

### Authorization policy
- 読み取り:
  - 設定詳細画面・一覧とも既存 website 閲覧可能ユーザーのみ
  - 詳細 notes API は `canViewSharedWebsite(auth, websiteId)` を採用
- 更新:
  - `canUpdateWebsite(auth, websiteId)` を採用
  - 個人所有 website: owner のみ更新可
  - team 所有 website: `PERMISSIONS.websiteUpdate` を持つ member のみ更新可
  - 閲覧専用ユーザーは UI で read-only + API で拒否

### Design decision
- **既存 website API に notes を統合する**。理由は、notes は website の単純な属性拡張であり、独立 API にするとN+1問題が生じるため。
- **一覧 API は既存 `/api/websites` を拡張する**。notes はすべてのユーザーが参照する可能性があり、別 API に分けるのは非効率なため。
