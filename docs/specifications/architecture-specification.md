# アーキテクチャ設計仕様書

このドキュメントは umami のアーキテクチャ設計の最終成果物であり、ストーリーをまたいで蓄積される。

## 1. 全体構成（既存踏襲）

umami は Next.js（App Router）による Web アプリケーションで、以下のレイヤ構成を持つ。

```
[ブラウザ / UI]
   │  React コンポーネント (src/app/**/*.tsx, src/components/**)
   ▼
[API ルート]  src/app/api/**/route.ts
   │  - リクエストパース・スキーマ検証 (parseRequest + zod, src/lib/schema.ts)
   │  - 認可チェック (src/permissions/**)
   ▼
[クエリ層]    src/queries/prisma/**
   │  - Prisma Client を用いたデータアクセス
   ▼
[データベース] PostgreSQL (prisma/schema.prisma)
```

依存方向は常に「UI → API → 権限/クエリ層 → DB」の一方向であり、下位レイヤが上位レイヤ（UI）に依存することはない。

## 2. US-201: ウェブサイトへのメモ（notes）追加 の位置づけ

メモ機能は新しいレイヤやコンポーネント種別を追加するものではなく、既存の「ウェブサイト」ドメインの属性拡張として実装する。

### 2.1 変更が及ぶコンポーネント

| レイヤ | 変更内容 | ファイル |
|---|---|---|
| DB スキーマ | `Website` モデルに `notes` 列（nullable）を追加 | `prisma/schema.prisma` + マイグレーション |
| API ルート | 作成/更新エンドポイントの入力スキーマに `notes` を追加 | `src/app/api/websites/route.ts`, `src/app/api/websites/[websiteId]/route.ts` |
| 権限 | 既存の `canUpdateWebsite` / `canViewWebsite` をそのまま再利用（新規権限区分は設けない） | `src/permissions/website.ts`（変更なし） |
| クエリ層 | `createWebsite` / `updateWebsite` は汎用的な `data` を受け取る実装のため変更不要。`getWebsite` 系の戻り値にも自動的に `notes` が含まれる | `src/queries/prisma/website.ts`（変更なし） |
| UI（編集画面） | `WebsiteEditForm` にメモ入力欄（複数行テキスト）を追加 | `src/app/(main)/websites/[websiteId]/settings/WebsiteEditForm.tsx` |
| UI（一覧） | `WebsitesTable` にメモ列（省略表示・空なら非表示）を追加 | `src/app/(main)/websites/WebsitesTable.tsx` |
| i18n | ラベル・エラーメッセージを `messages.ts` に追加 | `src/components/messages.ts` |

### 2.2 設計判断

- **新規サービス/レイヤを追加しない**: メモは「ウェブサイトの1属性」であり、独立したドメインではないため、既存の Website 集約に追加カラムとして持たせる。これにより API・権限・クエリの既存コードパスをそのまま再利用でき、実装コストと不整合リスクを最小化する（YAGNI）。
- **権限は新設しない**: 要件（非機能要件・US-201-6）が既存の更新権限モデルへの準拠を明示しているため、`canUpdateWebsite` をメモ更新にもそのまま適用する。専用の `canUpdateWebsiteNotes` のような権限は設けない（過剰設計を避ける）。
- **クエリ層の変更は不要**: `createWebsite`/`updateWebsite` は Prisma の `data` オブジェクトをそのまま渡す薄いラッパーであり、`notes` フィールドを含む `data` を渡すだけで対応可能。クエリ層に手を入れないことで既存のテスト・挙動への影響範囲を最小化する。
- **UI は既存フォーム/テーブルの拡張として実装**: 新規画面やモーダルを追加せず、既存の `WebsiteEditForm`（編集）と `WebsitesTable`（一覧）にフィールド／カラムを追加するのみに留める。frontend-engineer の観点から、既存の `@umami/react-zen` の `TextField`（`asTextArea`）パターン（`BoardEditForm` の `description` フィールドと同一パターン）を踏襲し、学習コストと実装コストを抑える。

## 3. 非機能要件への対応

| 非機能要件 | 対応方針 |
|---|---|
| データ整合性・後方互換性 | 追加カラムは nullable（`String?`）とし、デフォルト値は設定しない。既存レコードは `NULL` のまま扱われ、API/UI は `null` を「未入力」として扱う。 |
| セキュリティ・権限 | 更新は既存の `canUpdateWebsite` チェックを通過した場合のみ許可。閲覧は既存の `canViewSharedWebsite`／一覧取得クエリの権限フィルタに従う。 |
| バリデーション | クライアント（zod による `FormField` バリデーション）・サーバー（API ルートの zod スキーマ）の双方で 500 文字上限を検証する二重バリデーション方針を採用（詳細は api-specification.md）。 |
| 一貫性・実装スタイル | 既存の TypeScript / Next.js App Router / zod / Prisma / `@umami/react-zen` の実装パターンを踏襲。 |
| 可用性・性能 | 追加カラムは単一の nullable な `VARCHAR(500)` であり、既存クエリ（一覧・詳細取得）に対する性能影響は無視できるレベル。追加のインデックスは不要（検索・フィルタ対象外のため）。 |
| 国際化 | UI ラベル・エラーメッセージは `src/components/messages.ts` の既存 i18n の仕組み（`label.*` / `message.*` キー）に追加する。 |

## 4. 却下した代替案

| 代替案 | 却下理由 |
|---|---|
| メモを別テーブル（`WebsiteNote` 等）に切り出す1対1関連として設計 | 変更履歴・複数メモ等の将来拡張が要件で明確に対象外（Won't）とされており、1対1の別テーブルは JOIN コストと実装複雑度を増やすだけで現時点での利益がない。将来「変更履歴」が必要になった場合に別テーブル化する方が要件変化に対して自然な移行パスになる。 |
| メモ専用の API エンドポイント（例: `PATCH /websites/:id/notes`）を新設 | 既存の `POST /websites/:id` が汎用的な部分更新エンドポイントとして確立されており、単一属性追加のために新エンドポイントを増やすと権限チェック・エラーハンドリングを二重に持つことになる。既存エンドポイントの入力スキーマ拡張で十分に要件を満たせる。 |
| メモ専用の権限（例: `websiteNotesUpdate`）を新設 | 要件（非機能要件）で「既存の更新権限チェックの対象に含める」と明記されており、新権限は要件外の過剰設計となる。 |
