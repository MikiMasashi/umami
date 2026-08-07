# API仕様

このドキュメントは umami の API 設計に関する最終成果物である。ストーリーをまたいで蓄積し、各ストーリーで追加・変更した内容を追記していく。

## US-201: ウェブサイトへのメモ（Notes）機能

### 1. 対象エンドポイント

既存のウェブサイトAPIに `notes` フィールドを追加する。新規エンドポイントは設けない（NFR-3: 既存フィールドを維持したフィールド追加のみ）。

| メソッド | パス | 変更内容 |
|---|---|---|
| GET | `/api/websites/:websiteId` | レスポンスに `notes` を含める（Prismaの `Website` 型をそのまま返却しているため自動的に追加される） |
| GET | `/api/websites` | 一覧レスポンスの各要素に `notes` を含める（同上） |
| POST | `/api/websites/:websiteId` | リクエストボディに任意項目 `notes` を追加。バリデーション・更新処理に反映 |

`POST /api/websites`（新規作成）は本要件のスコープ外（作成時にメモを入力するUIはFR-1〜10に含まれないため）とし、`notes` パラメータは追加しない。ただし将来拡張時に備え、`data` に含めても Prisma スキーマ上問題なく動作する。

### 2. `POST /api/websites/:websiteId` 更新API

#### 2.1 リクエストスキーマ（zod）

`src/app/api/websites/[websiteId]/route.ts` の `POST` ハンドラのスキーマに `notes` を追加する。

```ts
const schema = z.object({
  name: z.string().max(100).optional(),
  domain: z.string().max(500).optional(),
  notes: z.string().max(500).nullable().optional(), // ★追加
  shareId: z.string().max(50).nullable().optional(),
  replayConfig: z.object({ /* 既存のまま */ }).nullable().optional(),
});
```

- **型**: `z.string().max(500).nullable().optional()`
  - `optional()`: リクエストボディに `notes` を含めない場合は既存値を変更しない（部分更新の既存パターン `name`/`domain` に準拠）。
  - `nullable()`: 明示的に `null` を送ることでメモをクリア（空にする）できるようにする。
  - `.max(500)`: FR-4（500文字上限）のサーバー側バリデーション。超過時は `parseRequest` の共通バリデーション機構により自動的に400（Bad Request）が返る（既存の `name`/`domain` と同じ仕組みを踏襲。詳細は「設計レビュー」参照）。
- 空文字列 `''` は許可する（FR-3: 空欄でも保存可能、AC-4）。zodの `.max(500)` は空文字列を許容するため追加のバリデーションは不要。

#### 2.2 認可

既存の `canUpdateWebsite(auth, websiteId)` チェックをそのまま利用する。`notes` 専用の権限チェックは設けない（FR-9, AC-9: 更新権限がない場合はメモを含む更新リクエスト全体を401/403で拒否する既存の仕組みに準拠）。

```ts
if (!(await canUpdateWebsite(auth, websiteId))) {
  return unauthorized();
}
```

#### 2.3 更新処理

```ts
const { name, domain, notes, shareId, replayConfig } = body;
...
const website = await updateWebsite(websiteId, {
  name,
  domain,
  notes, // ★追加。undefinedの場合はPrismaにより「更新しない」扱いとなる
  ...(replayConfig !== undefined && { ... }),
});
```

- Prisma の `update` は値が `undefined` のフィールドを更新対象から除外するため、`notes` を含めなければ既存値は保持される（AC-8: メモ以外の更新でエラーが起きないことの担保）。
- `notes: null` を明示的に送った場合はDB上も `NULL` に更新される（メモのクリア）。

#### 2.4 レスポンス

既存同様、更新後の `website` オブジェクト（Prismaの `Website` 型 + `shareId`）をそのまま返す。`notes` は自動的に含まれる。

```jsonc
{
  "id": "...",
  "name": "...",
  "domain": "...",
  "notes": "本番環境。A社案件。",
  "resetAt": null,
  "createdAt": "...",
  "updatedAt": "...",
  "shareId": null
  // 他既存フィールド
}
```

#### 2.5 エラーケース

| ケース | HTTPステータス | 挙動 |
|---|---|---|
| `notes` が501文字以上 | 400 | zodバリデーションエラー（`parseRequest` の共通エラーハンドリングにより自動応答） |
| 更新権限なし | 401 | `unauthorized()`（既存の権限チェックに準拠、AC-9） |
| `notes` を含めずに他フィールドのみ更新 | 200 | 既存の `notes` 値を保持したまま更新（AC-8） |
| `notes` に空文字列を指定 | 200 | 空文字列として保存（AC-4） |

### 3. `GET /api/websites/:websiteId`, `GET /api/websites` 取得API

- ロジック変更なし。Prismaの `Website` モデルに `notes` が追加されることで、既存の `getWebsite` / `getWebsites` の戻り値に自動的に `notes` フィールドが含まれる。
- 閲覧権限は既存の `canViewSharedWebsite` / `canViewWebsite` に準拠し、メモ専用の追加権限チェックは行わない（FR-10, AC-10）。
- 既存クライアント（`notes` を意識しない古いUI）への互換性は、フィールド追加のみで既存フィールドを変更しないため保たれる（NFR-3）。

### 4. フロントエンド側インターフェース

#### 4.1 設定編集フォーム（`WebsiteEditForm.tsx`）

`@umami/react-zen` の複数行入力コンポーネント `TextArea` を用いて、`name`/`domain` の `FormField` と同様のパターンでメモ欄を追加する。

```tsx
<FormField
  label={t(labels.notes)}
  data-test="input-notes"
  name="notes"
  rules={{
    maxLength: { value: 500, message: t(messages.notesTooLong) },
  }}
>
  <TextArea rows={4} />
</FormField>
```

- クライアント側バリデーション（FR-4前半）は既存の `FormField` の `rules` 機構（react-hook-form相当）を用いる。`maxLength: 500` で500文字超過時にエラーメッセージを表示し送信を止める。
- `required` は指定しない（FR-3: 任意項目）。
- ラベル文言キー: `labels.notes`（`src/components/messages.ts` に `notes: 'label.notes'` を追加。命名規則はNFR-2に準拠し既存の `label.name` / `label.domain` と同様のパターン）。
- エラーメッセージキー: `messages.notesTooLong`（例: `message.notes-too-long`）。

#### 4.2 ウェブサイト一覧（`WebsitesTable.tsx`）

一覧表示用に `notes` 列を追加する。長い場合は省略表示（CSSの `text-overflow: ellipsis` 等、既存の省略表示パターンがあればそれに合わせる。無ければコンポーネント側で切り詰め文字列を生成）。

```tsx
<DataColumn id="notes" label={t(labels.notes)} width="240px">
  {(row: any) => (row.notes ? <TruncatedText text={row.notes} maxLength={40} /> : null)}
</DataColumn>
```

- `row.notes` が `null` または空文字列の場合は何も描画しない（`null` を返す）ことで、FR-7 / AC-7（未入力時は何も表示しない）を満たす。
- 省略表示ロジック（例: 40文字を超えたら末尾を `…` に置換）は共通コンポーネント `TruncatedText` として切り出すか、`DataColumn` 内でインラインに実装するかは実装フェーズで決定する（本設計では表示契約のみを規定し、具体的な文字数・実装手段は実装フェーズに委ねる。「疑問点」参照）。
- レイアウト崩れ防止（AC-6）のため、列に固定幅または `max-width` とCSSの `overflow: hidden; white-space: nowrap; text-overflow: ellipsis;` を適用する契約とする。

### 5. 互換性・後方互換性

- `notes` は全APIにおいて `optional` かつ `nullable` として扱われるため、`notes` を含まないリクエスト・レスポンスでも既存動作に影響しない（NFR-3, AC-8）。
- 既存の自動テスト・E2Eテストで `website` オブジェクトの完全一致比較を行っている箇所がある場合は、フィールド追加により差分が生じる可能性がある点に留意する（実装フェーズでの確認事項として記載。設計レビュー参照）。
