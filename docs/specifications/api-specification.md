# API 設計仕様書

対象プロダクト: **umami** / 実装領域: `src/app/api`

本書は各ユーザーストーリーをまたいで蓄積する API 契約の最終成果物である。設計判断の根拠を併記する。設計レビューの過程・懸念点は `reviews/` 配下に記録する。

---

## US-201: ウェブサイトへのメモ（notes）機能

### 1. 方針サマリ

既存の Website 更新 API を拡張し、`notes` を **追加の optional フィールド**として受け付ける。新規エンドポイントは作らない。認可・エラー・レスポンス形状は既存契約を踏襲し、後方互換を維持する。

### 2. 対象エンドポイント

| メソッド | パス | 役割 | 本ストーリーでの変更 |
| --- | --- | --- | --- |
| `GET` | `/api/websites/{websiteId}` | ウェブサイト取得 | レスポンスに `notes` が自然に含まれる（Website 全体を返すため）。コード変更不要。認可は既存 `canViewSharedWebsite`。 |
| `POST` | `/api/websites/{websiteId}` | ウェブサイト更新 | zod スキーマに `notes` を追加。認可は既存 `canUpdateWebsite`。 |
| `GET` | 一覧取得（`getUserWebsites`/`getTeamWebsites` 経由） | 一覧 | 各行の Website に `notes` が含まれる。追加取得・N+1 は発生しない。 |

### 3. POST `/api/websites/{websiteId}` 契約（最終形）

#### 3.1 リクエストスキーマ（zod）

既存スキーマに `notes` を1行追加する。

```ts
const schema = z.object({
  name: z.string().max(100).optional(),
  domain: z.string().max(500).optional(),
  notes: z.string().max(500).nullable().optional(),   // ← 追加
  shareId: z.string().max(50).nullable().optional(),
  replayConfig: z.object({ /* 既存のまま */ }).nullable().optional(),
});
```

| 制約 | 値 | 根拠 |
| --- | --- | --- |
| `.max(500)` | 500文字（500許可 / 501不許可） | AC-2.1 / AC-2.3。JS `String.length` 準拠（Q1）。超過時 zod が検証エラー→ `parseRequest` が 400 相当を返す（AC-2.2）。 |
| `.nullable()` | `null` 許可 | 「未設定へ戻す」操作を明示的に表現するため。AC-1.4。 |
| `.optional()` | 省略可 | フィールド未指定時は既存挙動を変えない（後方互換）。AC-5.2。 |

#### 3.2 入力正規化（トリム）

- Q5 に従い、**前後空白をトリム**し、**トリム後が空文字なら `null` として保存**する。
- 実現方法（設計指針・実装はしない）:
  - zod の `.transform(v => { const t = v?.trim(); return t ? t : null; })` を `notes` に付与するか、ハンドラ内で正規化する。
  - トリムは `max(500)` 判定の前後どちらで行うか要決定 → 本設計では**トリム後の文字数で500判定**する（前後空白のみで超過扱いになるのを防ぐ）。zod では `.transform` 後に `.refine(len<=500)` する形を推奨。詳細トレードオフはレビュー参照。

#### 3.3 ハンドラでの受け渡し

`body` から `notes` を分解し、`updateWebsite` に渡す。`undefined`（未指定）のときは更新対象に含めない＝既存値を保持する。

```ts
const { name, domain, notes, shareId, replayConfig } = body;
// ...
const website = await updateWebsite(websiteId, {
  name,
  domain,
  ...(notes !== undefined && { notes }),   // 未指定なら既存値維持（AC-5.2）
  ...(replayConfig !== undefined && { /* 既存 */ }),
});
```

> `name` / `domain` は既存コードで `undefined` でもそのまま `update` に渡している（Prisma は `undefined` フィールドを無視する）。`notes` も同様に扱えるが、意図を明示するため上記のように条件付きスプレッドで渡すことを推奨（レビューで代替案を比較）。

#### 3.4 認可

| 操作 | ガード | 根拠 |
| --- | --- | --- |
| 更新（POST） | `canUpdateWebsite(auth, websiteId)` — 既存のまま | AC-4.1 / AC-4.2。`notes` はサイト名・ドメインと同一経路・同一ルールで制御される。追加のガードは設けない。 |
| 閲覧（GET） | `canViewSharedWebsite(auth, websiteId)` — 既存のまま | AC-4.3。閲覧権限があればメモも取得可能。 |
| 共有ページ | 露出させない | Q2。共有 API・共有ページのレスポンスに `notes` を含めない（現状のまま。共有ページは別経路で最小フィールドを返すため、`notes` を明示的に足さないこと）。 |

#### 3.5 レスポンス

- 成功時: 既存と同一形状の Website オブジェクト（`shareId` 付き）を返す。`notes` フィールドが含まれる。ステータス 200。
- 認可失敗: 既存 `unauthorized()` を使用し **401** を返す。AC-4.1。既存 API は認可失敗を一貫して `unauthorized()`（`lib/response.ts`：`status: 401`）で表現しており（`forbidden()` は別途 403 として存在するが本経路では使用しない）、その設計思想に合わせる。
- バリデーション失敗（501文字超過など）: `parseRequest` が zod エラーを 400 相当で返す。AC-2.2。
- Website 不在: 既存 `badRequest({ message: 'Website not found.' })`。

### 4. 後方互換性

- `notes` は optional 追加のため、既存クライアント（`notes` を送らない）は挙動不変（AC-5.2）。
- レスポンスへのフィールド追加は非破壊的変更（既存消費者は無視できる）。
- API バージョニングは不要（追加のみ、破壊的変更なし）。

### 5. 契約テスト観点（実装しない・指針のみ）

- 500文字は 200、501文字は 400。
- 更新権限なしユーザーの POST は 401（`unauthorized()`）。
- `notes` 未指定の更新で既存 `notes` が保持される。
- 空文字/空白のみ入力が `null` として保存される。
