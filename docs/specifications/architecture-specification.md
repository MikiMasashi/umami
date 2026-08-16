# 全体アーキテクチャ設計仕様書

対象プロダクト: **umami** / 実装領域: `src` / `prisma`

本書は各ユーザーストーリーをまたいで蓄積するアーキテクチャ設計の最終成果物である。設計判断の根拠を併記する。設計レビューの過程・懸念点は `reviews/` 配下に記録する。

---

## 0. アーキテクチャ前提（既存資産）

umami は以下の構成。本ストーリーはこの様式に完全準拠する（新しい構造・依存を導入しない）。

- **プレゼンテーション**: Next.js App Router + React（`src/app/(main)/...`）。UI は `@umami/react-zen` のコンポーネント（`Form`, `FormField`, `TextField`, `DataTable` 等）。
- **API 層**: App Router の Route Handlers（`src/app/api/**/route.ts`）。`parseRequest(request, zodSchema)` で認証・入力検証。`@/lib/response` の `json/ok/badRequest/unauthorized/serverError` で応答。
- **認可**: `src/permissions/*`（`canUpdateWebsite`, `canViewSharedWebsite` 等）。
- **ドメイン/データアクセス**: `src/queries/prisma/*`（`updateWebsite`, `getWebsite` 等）が Prisma Client を薄くラップ。
- **永続化**: Prisma + PostgreSQL（`prisma/schema.prisma`、`@/generated/prisma/client`）。
- **i18n**: `useMessages()`（`t`, `labels`, `messages`）＋ `public/intl/messages/*.json`。
- **データ取得（クライアント）**: `useWebsite`, `useUpdateQuery`, `useUserWebsitesQuery` 等のフック。

依存方向は プレゼン → API → permissions/queries → prisma の内向き一方向。本設計はこの方向を維持する。

---

## US-201: ウェブサイトへのメモ（notes）機能

### 1. 概要

Website エンティティに単一の自由記述メモ `notes` を追加する。**新規レイヤ・新規サービス・新規エンドポイントを作らず**、既存の Website 更新フロー（フォーム → POST API → zod → `updateWebsite` → Prisma）に `notes` を1フィールド通す、垂直方向の最小拡張とする。

### 2. コンポーネント別 変更点と責務

| レイヤ | ファイル（既存） | 変更内容 | 責務 |
| --- | --- | --- | --- |
| 永続化 | `prisma/schema.prisma` | `Website.notes String? @db.VarChar(500)` を追加 + マイグレーション | データ保持・後方互換 |
| データアクセス | `src/queries/prisma/website.ts` | 変更不要（`updateWebsite` は汎用 update） | 永続化の薄いラッパ |
| API | `src/app/api/websites/[websiteId]/route.ts` | zod に `notes` 追加、`updateWebsite` へ受け渡し | 入力検証・認可・正規化 |
| 認可 | `src/permissions/website.ts` | 変更不要（`canUpdateWebsite`/`canViewSharedWebsite` を再利用） | 権限判定 |
| プレゼン（編集） | `src/app/(main)/websites/[websiteId]/settings/WebsiteEditForm.tsx` | `notes` 用の複数行入力欄（textarea）を追加 | 入力・保存・クライアント検証 |
| プレゼン（一覧） | `src/app/(main)/websites/WebsitesTable.tsx`（＋ `WebsitesDataTable`） | `notes` の省略表示カラム/要素を追加 | 一覧表示・truncate |
| i18n | `src/components/messages.ts` + `public/intl/messages/*.json` | `labels.notes` 等のラベル・エラーメッセージ追加 | 文言 |

### 3. データフロー

#### 3.1 保存（US-201-1/2/4）
```
WebsiteEditForm (textarea notes)
  → useUpdateQuery POST /api/websites/{id}  { name, domain, notes }
    → parseRequest + zod (.max(500), trim→null)          // AC-2, Q5
    → canUpdateWebsite(auth, id)                          // AC-4.1/4.2
    → updateWebsite(id, { notes })                        // Prisma UPDATE
  → 200 Website(notes)  → toast(saved) + touch(cache)     // AC-1.1
```

#### 3.2 表示（US-201-1/3/5）
```
編集画面: useWebsite() → Form values に notes → textarea 初期表示  // AC-1.2
一覧:     useUserWebsitesQuery() → 各 row.notes → truncate 表示     // AC-3.1/3.2
          notes が null/空 → 何も描画しない                          // AC-3.3
```

### 4. UI 設計（frontend-engineer 観点）

| 項目 | 設計 | 根拠 |
| --- | --- | --- |
| 入力コンポーネント | `@umami/react-zen` の複数行対応入力（`TextField` の multiline、または `TextArea` 相当）を `FormField name="notes"` 内に配置。`name`/`domain` と同じ `FormField` パターンを踏襲。 | Q6（改行可）、実装スタイル準拠。 |
| 配置 | `WebsiteEditForm` の `domain` フィールドの下、`FormButtons` の上。 | 既存項目に馴染む並び。 |
| クライアント検証 | `rules={{ maxLength: { value: 500, message: ... } }}`（Should）。サーバ検証には依存しない前提でガイド表示。 | 非機能バリデーション、AC-2。 |
| 文字数カウンタ | 残文字数表示は Should（任意）。MVP では必須ではない。 | 優先度サマリ Should。 |
| 一覧の省略表示 | 1行 truncate（CSS `text-overflow: ellipsis` / 既存 DataTable セルの truncate 手法）。複数行メモは改行を潰して1行省略。 | AC-3.2 / Q6。 |
| 未設定時 | 一覧セルに空文字・プレースホルダを一切出さない（条件描画で `null`/空なら要素自体を出さない）。 | AC-3.3。 |
| XSS | React の既定エスケープに委ね、`dangerouslySetInnerHTML` を使わない。 | 非機能セキュリティ。 |
| ラベル/文言 | `t(labels.notes)` 等、`useMessages` 経由。ハードコードしない。 | 非機能 i18n。 |

### 5. 非機能・横断的関心

| 分類 | 設計 | 根拠 |
| --- | --- | --- |
| パフォーマンス | `notes` は Website 行の1カラム。一覧・詳細とも既存クエリの取得結果に含まれ、追加クエリ・JOIN・N+1 は発生しない。 | 非機能パフォーマンス。 |
| セキュリティ/認可 | 更新は `canUpdateWebsite`、閲覧は `canViewSharedWebsite` を再利用。共有ページには露出させない。サーバ側 zod を正準の検証境界とする。 | AC-4、Q2、非機能。 |
| バリデーション境界 | 正準 = サーバ zod（`max(500)` + trim）。DB `VarChar(500)` は多層防御。クライアントは UX ガイド。 | Q1、非機能。 |
| 後方互換 | nullable 追加・optional API のみ。既存データ/既存クライアントの挙動不変。 | US-201-5。 |
| 可観測性 | 既存の API エラーハンドリング（`serverError`）に委譲。追加のログ/メトリクスは不要。 | YAGNI。 |
| トランザクション | 単一行 UPDATE で完結。追加のトランザクション境界不要。 | 整合性要件。 |

### 6. 設計原則の適用

- **最小侵襲・垂直スライス**: 1フィールドを既存フローに通すのみ。新抽象を作らないことで保守性と後方互換を最大化（YAGNI）。
- **既存様式への一貫性**: 命名（`notes`）・検証（zod）・認可（既存 permission 再利用）・UI（`FormField`/`DataTable`）をすべて既存パターンに合わせ、認知負荷と回帰リスクを抑える。
- **依存方向の維持**: ドメイン（Prisma スキーマ・queries）は UI/i18n に依存しない内向き構造を保つ。

### 7. スコープ外（アーキテクチャ判断）

履歴/版管理、検索/フィルタ、リッチテキスト、共有ページ露出、複数メモ、専用テーブル化はいずれも採用しない（要件 Won't）。将来これらが必要になった場合の拡張点はレビュー文書に記載。
