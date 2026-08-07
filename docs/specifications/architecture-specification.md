# アーキテクチャ仕様

このドキュメントは umami 全体のアーキテクチャ設計に関する最終成果物である。ストーリーをまたいで蓄積し、各ストーリーで追加・変更した内容を追記していく。

## US-201: ウェブサイトへのメモ（Notes）機能

### 1. 全体構成における位置づけ

本機能は既存の「ウェブサイト（Website）」エンティティに対する属性追加であり、umamiの既存レイヤードアーキテクチャ（Next.js App Router + API Route Handlers + Prisma + PostgreSQL）の枠組み内で完結する。新規のレイヤー・サービス・外部連携は追加しない。

```
[ブラウザ]
  └─ WebsitesTable.tsx（一覧・省略表示）
  └─ WebsiteEditForm.tsx（入力・クライアントバリデーション）
        │  fetch (useUpdateQuery hook)
        ▼
[Next.js API Route Handler]
  src/app/api/websites/route.ts          … 一覧取得
  src/app/api/websites/[websiteId]/route.ts … 個別取得・更新
        │  zodバリデーション（notesを追加）
        │  権限チェック（canUpdateWebsite / canViewSharedWebsite: 既存を再利用）
        ▼
[Permission Layer]
  src/permissions/website.ts（変更なし・既存関数を再利用）
        ▼
[Data Access Layer]
  src/queries/prisma/website.ts（変更なし・汎用的なdata引数のため）
        ▼
[Prisma Client] → [PostgreSQL: website.notes カラム]
```

### 2. レイヤー別の責務と変更方針

| レイヤー | 役割 | US-201での変更 |
|---|---|---|
| UIコンポーネント（`src/app/(main)/websites/...`） | 入力フォーム・一覧表示 | `WebsiteEditForm.tsx` にメモ入力欄追加、`WebsitesTable.tsx` にメモ列追加 |
| APIルート（`src/app/api/websites/...`） | リクエストの受付・スキーマ検証・権限判定・レスポンス整形 | POSTスキーマに `notes` を追加、更新処理に `notes` を含める |
| 権限（`src/permissions/website.ts`） | ユーザーの操作可否判定 | 変更なし。既存の `canUpdateWebsite` / `canViewSharedWebsite` / `canViewWebsite` をそのまま利用し、メモ専用の権限は設けない |
| データアクセス（`src/queries/prisma/website.ts`） | Prisma経由でのCRUD | 変更なし。関数シグネチャが汎用的な `data: Prisma.WebsiteUpdateInput` を受け取るため、Prismaスキーマ変更のみで対応可能 |
| スキーマ（`prisma/schema.prisma`） | データモデル定義 | `Website.notes` カラム追加 |

この設計により、**変更差分をUI・APIスキーマ・DBスキーマの3箇所に限定**でき、既存のクエリ関数や権限関数への修正を避けられる（後述レビューで妥当性を検討）。

### 3. コンポーネント間インターフェース

- **UI → API**: 既存の `useUpdateQuery` フック（`src/components/hooks`）を通じたPOSTリクエスト。`WebsiteEditForm` の `handleSubmit` が `data`（フォーム全体の値、`notes` を含む）をそのままAPIに送信する既存パターンをそのまま踏襲する。
- **API → 権限層**: `canUpdateWebsite(auth, websiteId)` の戻り値（`boolean`）によってAPI全体（`notes` を含む全フィールドの更新）を許可/拒否する。メモだけを個別に許可/拒否する分岐は設けない（FR-9はAPI全体の権限判定で満たされる）。
- **API → データアクセス層**: `updateWebsite(websiteId, data)` の `data` に `notes` を含めるかどうかで部分更新を制御する（`undefined` なら変更なし、値ありなら更新、`null` ならクリア）。
- **一覧UI → データ**: `WebsitesTable` は `DataTable` の `data` propとして渡される `Website[]`（`notes` を含む）をそのまま参照する。データ取得元（`useUserQuery` 等）は変更不要（GETレスポンスに `notes` が自動的に含まれるため）。

### 4. 非機能面の設計判断

- **パフォーマンス**: `notes` は `VARCHAR(500)` の小さなカラムであり、一覧取得時に毎回全文を取得しても性能上の懸念は小さいと判断（既存の `domain: VARCHAR(500)` と同等）。将来的に一覧APIのペイロード削減が必要になった場合は、一覧専用の `select` 句で `notes` を先頭N文字に切り詰める最適化を検討可能（本設計では実施しない。「設計レビュー」参照）。
- **セキュリティ**: メモはユーザー入力の自由記述文字列であり、XSS対策として既存のReactの自動エスケープに依存する（`dangerouslySetInnerHTML` 等は使用しない）。SQLインジェクション対策はPrismaのパラメータ化クエリにより既存と同様に担保される。
- **国際化**: メモ自体はユーザー入力のため翻訳対象外。ラベル文言（「メモ」等）は既存の `src/components/messages.ts` の多言語辞書パターン（`label.notes` キー）に追加することで、既存の国際化基盤にそのまま乗せる。
- **移行・運用**: Prismaマイグレーションはカラム追加のみで、既存データへの影響がない「安全な」マイグーレーションに分類される（ダウンタイムなしで適用可能。既存の運用フロー・CI/CDパイプラインの変更は不要）。

### 5. 影響を受けないコンポーネント（明示）

以下は本機能により変更が不要であることを明示する（スコープの明確化・レビュー時の確認観点として記載）。

- `src/permissions/website.ts` … 権限ロジックは既存のまま流用
- `src/queries/prisma/website.ts` … クエリ関数のシグネチャ変更不要
- Share（共有）関連のAPI・ロジック（`src/app/api/share/...`、`shareId` 周りの処理） … メモの共有可否は既存の閲覧権限モデルに準拠するため変更不要
- ダッシュボード・レポート系画面（Overview, Events, Sessions等） … メモは設定画面・一覧画面のみのスコープであり、詳細ダッシュボードには表示しない
