# アーキテクチャ仕様書

このドキュメントは umami の全体アーキテクチャ設計の最終成果物である。ストーリーをまたいで累積更新する。

---

## US-201: ウェブサイトへのメモ（notes）機能

### 1. 概要

本機能は既存の Website エンティティに属性（`notes`）を1つ追加するものであり、新しいレイヤやコンポーネント種別を導入しない。既存の「Prismaスキーマ → クエリ関数 → APIルート（zodバリデーション＋権限チェック） → フロントエンドフォーム／一覧テーブル」という一気通貫のデータフローに、`notes` フィールドを1本追加する形で設計する。

### 2. コンポーネント構成とデータフロー

```
[Prisma Schema]                      prisma/schema.prisma
  Website.notes (String?, VarChar(500))
        │ (migration: 21_add_website_notes)
        ▼
[Query Layer]                        src/queries/prisma/website.ts
  getWebsite() / getWebsites()  … notesを含むWebsiteをそのまま返す（変更不要）
  updateWebsite()               … notesを含むdataをそのままPrismaに渡す（変更不要）
        │
        ▼
[Permission Layer]                   src/permissions/website.ts
  canUpdateWebsite() / canViewSharedWebsite() … 既存のロジックをそのまま流用（変更不要）
        │
        ▼
[API Route Layer]                    src/app/api/websites/[websiteId]/route.ts
  GET  … レスポンスにnotesが自動的に含まれる
  POST … zodスキーマにnotes: string().max(500).nullable().optional() を追加
        │ (HTTP JSON)
        ▼
[Frontend Data Hooks]                src/components/hooks/queries/useWebsiteQuery.ts 等
  既存のReact Query経由のfetchをそのまま利用（変更不要、レスポンス型にnotesが追加されるのみ）
        │
        ▼
[Frontend Components]
  WebsiteEditForm.tsx  (src/app/(main)/websites/[websiteId]/settings/)
    … FormField + TextArea（500文字カウンタ付き）を追加
  WebsitesTable.tsx    (src/app/(main)/websites/)
    … DataColumn「notes」を追加、省略表示ロジックを実装
```

### 3. レイヤ責務と依存方向

| レイヤ | 責務 | 本機能での変更 |
|---|---|---|
| データ層（Prisma Schema / Migration） | 永続化スキーマの定義 | `notes` カラム追加（データ仕様書参照） |
| クエリ層（`src/queries/prisma/website.ts`） | DBアクセスの抽象化 | 変更なし（汎用的な `data` オブジェクトを受け渡すため、フィールド追加は透過的に対応） |
| 権限層（`src/permissions/website.ts`） | 認可判定 | 変更なし（Website単位の既存の `update` 権限をそのまま適用） |
| APIルート層（`src/app/api/websites/[websiteId]/route.ts`） | HTTPインターフェース、入力検証、権限ゲート | zodスキーマに `notes` を追加（API仕様書参照） |
| フロントエンドフォーム（`WebsiteEditForm.tsx`） | 入力UI・クライアントバリデーション | メモ入力欄（複数行テキスト、文字数カウンタ、500文字上限）を追加 |
| フロントエンド一覧（`WebsitesTable.tsx`） | 一覧表示 | メモ列（省略表示）を追加 |

依存方向は既存構成を踏襲し、上位レイヤ（フロントエンド）が下位レイヤ（API・クエリ・DB）に依存する一方向のみとする。ドメインロジック（500文字上限、null正規化等）はAPIルート層とzodスキーマに集約し、フロントエンドは表示・簡易バリデーション（早期フィードバック用）に徹する。これによりビジネスルールの実体はサーバー側1箇所に保つ（フロント側の文字数チェックは補助的なUXであり、信頼の境界はサーバー側とする）。

### 4. フロントエンド設計（frontend-engineer観点）

#### 4.1 編集画面（`WebsiteEditForm.tsx`）

- 使用コンポーネント: `@umami/react-zen` の `TextArea`（複数行入力）を新たに使用する。既存の `TextField` は単一行入力用であり、自由記述メモという性質上、複数行入力が適切。
- 文字数カウンタ: `TextArea` に `maxLength={500}` を設定し、入力欄近傍に残り文字数（または `現在文字数/500`）を表示する。ブラウザネイティブの `maxLength` 制約により、501文字目以降の入力自体を防止する一次防御とする。
- バリデーションルール: `FormField` の `rules` に `maxLength: { value: 500, message: t(messages.notesTooLong) }` を追加し、`react-hook-form` ベースの `Form` コンポーネントの検証フローに乗せる（既存の `name`/`domain` と同じパターン）。
- 未設定時の表示: `website.notes` が `null` の場合、`TextArea` は空文字として初期表示される（`Form` の `values={website}` により自動バインドされるため、追加のnullガードは不要。既存の `WebsiteEditForm` は `values={website}` を渡す設計のため、`notes: null` はそのままフォームライブラリ側で空文字扱いされる想定。もし空文字への変換が必要な場合は `values={{ ...website, notes: website?.notes ?? '' }}` のように明示変換する）。
- 権限制御: 更新権限がない場合の編集画面自体の扱いは、既存の `WebsiteEditForm` 呼び出し元（設定画面）が権限に応じてフォーム全体を読み取り専用表示に切り替えている前提を踏襲する。メモ欄のみを個別に無効化する特別分岐は設けず、フォーム全体の既存の権限ガードに乗せる（FR-6、実装時に既存の権限ガード実装箇所を確認し統一する）。

#### 4.2 一覧画面（`WebsitesTable.tsx`）

- 新規 `DataColumn id="notes"` を `domain` 列の後（または既存レイアウトとの整合を見て決定、要件定義書 8章-5 の通り配置はUI実装時判断）に追加。
- 表示ロジック: `row.notes` が `null` または空文字の場合は何も描画しない（プレースホルダーなし、FR-4）。値がある場合はCSSの `text-overflow: ellipsis` 等、既存の umami UI パターン（他の長文カラムがあればそれに準拠）で省略表示する。具体的な省略文字数・ツールチップ表示の要否はUI実装時に既存コンポーネント（`@umami/react-zen`）の一般的な挙動に従う（要件定義書 8章-3）。
- パフォーマンス: 追加カラムはAPIレスポンスに1フィールド増えるのみで、既存の `getWebsites()` のクエリ構造（フィルタ・ページング）には影響しない（非機能要件「パフォーマンス」を満たす）。

### 5. 非機能要件への対応

| 非機能要件 | 対応方針 |
|---|---|
| データ整合性 | `notes` を既存の Website 更新トランザクション（`updateWebsite()` 単一の `prisma.client.website.update()` 呼び出し）に含め、他フィールドと同一のアトミックな更新にする。専用トランザクションは設けない。 |
| セキュリティ（XSS対策） | フロントエンドは React の標準的な文字列レンダリング（自動エスケープ）に任せ、`dangerouslySetInnerHTML` 等は使用しない。メモはプレーンテキストとして扱い、HTML/Markdownのレンダリングは行わない。 |
| 入力検証 | フロント（`TextArea maxLength` + `react-hook-form` の `rules.maxLength`）とサーバー（zod `.max(500)`）の両方に実装し、片方のみに依存しない二重チェック構成とする。 |
| 互換性 | マイグレーションは追加のみ、既存カラムは無変更。APIレスポンスもフィールド追加のみで既存フィールドは変更しない。 |
| 国際化 | `src/components/messages.ts` に `notes: 'label.notes'` 等のメッセージキーを追加し、既存のi18nメッセージ管理の枠組みに乗せる（翻訳作業自体は対象外）。 |
| パフォーマンス | 追加カラム1つのみで、既存の一覧取得クエリのJOIN構造やインデックス戦略に変更は不要。 |
| アクセシビリティ | `@umami/react-zen` の `TextArea` / `FormField` を使用し、既存のラベル付け・フォーカス管理・エラーメッセージ表示パターンを踏襲する。 |
| 運用性 | マイグレーションは既存のPrisma Migrateフロー（`prisma/migrations/NN_description`）に従い、単純な `ADD COLUMN` のためロールバックも `DROP COLUMN` のみで容易。 |

### 6. 却下した代替案

| 代替案 | 却下理由 |
|---|---|
| メモ専用の新規APIリソース・専用フロントエンドページを設ける | メモはWebsiteの付随情報であり独立したライフサイクル（作成・削除等）を持たないため、独立リソース化は過剰設計。既存の編集画面・一覧画面に統合する方がユーザー体験・実装コストの両面で妥当。 |
| フロントエンドの状態管理ストア（`src/store/websites.ts`）に `notes` 専用のキャッシュ・同期ロジックを追加する | 既存の React Query ベースのデータフェッチ（`useWebsiteQuery` 等）がWebsiteオブジェクト全体をキャッシュしており、`notes` はその一部として自然に扱えるため、個別の状態管理を追加する必要はない。 |
| メモの保存を非同期キュー（ジョブキュー等）で処理する | メモは即時反映・小さなテキストデータであり、他フィールド同様に同期的なリクエスト/レスポンスで十分。非機能要件のレイテンシ懸念もない。 |
