# Architecture Specification

## US-201: ウェブサイトメモ

### 全体方針

ウェブサイトメモは既存の Website 設定フローに統合する。新しいドメインサービスや API エンドポイントは追加せず、既存の Next.js App Router API、Prisma repository、React フォーム、Websites 一覧コンポーネントの境界を保ったまま `notes` フィールドを通す。

この方針により、権限・キャッシュ無効化・エラー表示・フォーム送信の既存パターンを再利用でき、メモだけが特別な処理経路を持つことを避ける。

### コンポーネント構成

```text
Settings / Websites UI
  ├─ WebsitesDataTable
  │   └─ WebsitesTable
  │       └─ notes が存在する行だけ省略表示
  └─ WebsiteSettings
      └─ WebsiteEditForm
          └─ notes 入力欄を name/domain と同じ FormField として送信

Client hooks
  ├─ useUserWebsitesQuery -> GET websites list
  ├─ useWebsiteQuery      -> GET website detail
  └─ useUpdateQuery       -> POST website update

Next.js API
  ├─ GET /api/*/websites
  ├─ GET /api/websites/{websiteId}
  └─ POST /api/websites/{websiteId}

Application / Data access
  ├─ canView... / canUpdateWebsite
  ├─ getWebsites / getWebsite
  └─ updateWebsite

Database
  └─ website.notes varchar(500) nullable
```

### データフロー

#### 編集画面表示

1. `WebsiteProvider` / `useWebsiteQuery(websiteId)` が `GET /api/websites/{websiteId}` を呼ぶ。
2. API は `canViewSharedWebsite` で既存の参照権限を確認する。
3. `getWebsite` が Prisma から Website を取得し、`notes` を含めて返す。
4. `WebsiteEditForm` は `values={website}` により `notes` を初期値として表示する。

#### メモ保存

1. `WebsiteEditForm` が `name`、`domain`、`notes` を `useUpdateQuery(/websites/{websiteId})` で送信する。
2. API は zod で `notes` 最大 500 文字を検証する。
3. API は `canUpdateWebsite` で既存の Website 更新権限を確認する。
4. API は空文字相当の `notes` を `null` に正規化し、`updateWebsite` で保存する。
5. クライアントは既存どおり `touch('websites')` と `touch('website:{id}')` を実行し、一覧・詳細キャッシュを再取得可能にする。

#### 一覧表示

1. `WebsitesDataTable` が `useUserWebsitesQuery` で既存の一覧 API を呼ぶ。
2. API はページング済み Website 一覧に `notes` を含めて返す。
3. `WebsitesTable` は `notes` が存在する行だけ、サイト名またはドメインの下に補助テキストとして表示する。
4. 長いメモは UI 側で省略表示する。API は編集再利用のため全文を返す。

### UI インターフェース設計

フロントエンド観点では、`notes` はフォーム項目と一覧補助表示の 2 か所に閉じる。

| UI | インターフェース | 状態設計 |
| --- | --- | --- |
| `WebsiteEditForm` | `FormField name="notes"` と複数行入力コンポーネント | 初期値は `website.notes ?? ''`。500 文字超過は client rules と server validation の両方で扱う。 |
| `WebsitesTable` | row の `notes` を任意表示 | `notes` が `null` / 空文字なら描画しない。存在する場合は省略表示し、一覧の行高増加を抑える。 |
| query hooks | Website response に `notes` を追加 | 既存 query key と cache touch を維持し、追加の client state は持たない。 |

入力欄は既存の `@umami/react-zen` の `FormField` / テキスト入力系コンポーネントに合わせる。複数行入力コンポーネントが既存にある場合はそれを使い、ない場合は既存デザインに合わせた最小の textarea ラッパーを選ぶ。ラベル・エラーメッセージは `src/components/messages.ts` と既存ローカライズ資産に追加する。

### 権限・検証

メモの変更は Website 更新と同じ操作として扱う。クライアント側で編集 UI を制御しても、最終的な保護は必ず `POST /api/websites/{websiteId}` の `canUpdateWebsite` と zod validation で行う。

文字数上限は UI だけに依存しない。サーバーで `z.string().max(500).nullable().optional()` を通し、超過時は DB 更新前に拒否する。

### 性能・可用性

メモは Website 行の `varchar(500)` 1 カラムであり、一覧 API の既存クエリに追加 JOIN は不要。通常の一覧件数ではレスポンス増加は限定的で、追加リクエストを避ける方が UX と実装単純性の面で有利。

nullable カラム追加により、既存ウェブサイトは移行直後から `notes = null` として扱える。メモ未設定でも一覧・詳細・更新処理が失敗しない。

### テスト方針

実装時は以下を最小セットとして確認する。

| 層 | 観点 |
| --- | --- |
| API / route | `notes` 保存、空文字の `null` 化、500 文字超過拒否、権限なし更新拒否。 |
| repository / Prisma | 既存 Website に `notes = null` が許容され、一覧・詳細取得に含まれること。 |
| UI | 編集画面の初期表示・保存、一覧でメモありのみ表示、長文省略、サーバーエラー表示。 |

