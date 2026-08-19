# API Specification

## US-201: ウェブサイトメモ

### 設計方針

ウェブサイトメモは Website 設定情報の一部として扱い、既存の Websites API に `notes` フィールドを追加する。新規エンドポイントは作らず、既存の取得・更新・一覧 API のレスポンスへ同じ形で含める。

理由は、メモの権限境界が既存のウェブサイト更新権限と一致し、一覧表示でも既存のウェブサイト取得結果に同梱すれば追加リクエストを増やさずに表示できるため。

### ドメイン上の値定義

| 項目 | 型 | 制約 | 説明 |
| --- | --- | --- | --- |
| `notes` | `string \| null` | 最大 500 文字 | ウェブサイト運用者が任意入力する自由記述メモ。未設定は `null` として扱う。 |

空文字、空白のみの文字列、未指定値は保存時に `null` へ正規化する。API レスポンスでは未設定状態を `null` に統一し、クライアントが `undefined` / 空文字 / `null` を個別判定しなくてよい契約にする。

### API 契約

#### `GET /api/websites`

ユーザーが参照可能なウェブサイト一覧を返す。既存のページング・検索・ソート仕様は変更しない。

レスポンスの各 Website に `notes` を追加する。

```json
{
  "data": [
    {
      "id": "8b8f7f4a-0000-0000-0000-000000000000",
      "name": "Production site",
      "domain": "example.com",
      "notes": "本番環境。マーケティングチーム管理。",
      "createdAt": "2026-08-19T00:00:00.000Z",
      "updatedAt": "2026-08-19T00:00:00.000Z"
    }
  ],
  "count": 1,
  "page": 1,
  "pageSize": 10
}
```

#### `GET /api/users/{userId}/websites`

ユーザー単位のウェブサイト一覧を返す。レスポンスの各 Website に `notes` を追加する。`includeTeams` 指定時も同じ形で返す。

#### `GET /api/me/websites`

ログインユーザーのウェブサイト一覧を返す。レスポンスの各 Website に `notes` を追加する。

#### `GET /api/teams/{teamId}/websites`

チームに紐づくウェブサイト一覧を返す。レスポンスの各 Website に `notes` を追加する。

#### `GET /api/websites/{websiteId}`

単一ウェブサイトを返す。`canViewSharedWebsite` による既存の参照制御を維持し、レスポンスに `notes` を追加する。

```json
{
  "id": "8b8f7f4a-0000-0000-0000-000000000000",
  "name": "Production site",
  "domain": "example.com",
  "notes": null,
  "shareId": null,
  "replayConfig": null,
  "recorderEnabled": false
}
```

#### `POST /api/websites/{websiteId}`

ウェブサイト設定を更新する。既存の `name`、`domain`、`shareId`、`replayConfig` に加えて、任意の `notes` を受け付ける。

リクエスト:

```json
{
  "name": "Production site",
  "domain": "example.com",
  "notes": "本番環境。マーケティングチーム管理。"
}
```

入力スキーマ:

| フィールド | 型 | 必須 | 制約 |
| --- | --- | --- | --- |
| `notes` | `string \| null` | 任意 | 最大 500 文字。`null` または空文字はメモ削除として扱う。 |

処理順序:

1. `parseRequest` と zod で `notes` の型・最大長を検証する。
2. `canUpdateWebsite(auth, websiteId)` で既存と同じ更新権限を確認する。
3. `notes` がリクエストに含まれる場合のみ更新対象に含める。未指定の場合は既存メモを変更しない。
4. `notes` が `null`、空文字、空白のみの場合は DB に `null` を保存する。
5. 更新後の Website を `notes` を含めて返す。

文字数超過時は既存の `parseRequest` / zod エラー応答に合わせて `400 Bad Request` を返し、更新処理は実行しない。これにより既存の保存済みメモは不正入力で上書きされない。

#### `POST /api/websites`

ウェブサイト作成時のメモ入力は US-201 の必須範囲外とする。API 後方互換を優先し、当初は `notes` を受け付けない。作成直後にメモが必要な場合は既存の編集 API で保存する。

### クライアントインターフェース

`Website` 型相当の取得結果に `notes: string | null` を追加し、以下の既存フックは追加リクエストなしでメモを扱う。

| フック | 役割 | US-201 での扱い |
| --- | --- | --- |
| `useWebsiteQuery(websiteId)` | 編集画面の初期値取得 | `notes` をフォーム初期値として受け取る。 |
| `useUserWebsitesQuery(...)` | 一覧画面のデータ取得 | 各行の `notes` を表示判定に使う。 |
| `useUpdateQuery(/websites/{websiteId})` | 設定保存 | `notes` を他の Website 更新項目と同じ payload で送る。 |

UI 側は一覧で `notes` が `null` または空文字相当の場合は表示しない。長文は表示コンポーネント側で省略し、API は全文を返す。これは編集画面で完全なメモを復元する必要があるため。

### エラー・認可

| ケース | 応答 | 根拠 |
| --- | --- | --- |
| `notes` が 500 文字を超える | `400 Bad Request` | 入力検証はサーバー側で保証するため。 |
| 更新権限がない | `401 Unauthorized` | 既存の `canUpdateWebsite` 境界を維持するため。 |
| 対象 Website が存在しない | 既存と同じ `400 Bad Request` | 既存 API の振る舞いと一貫させるため。 |

