# E2E テスト実行結果 US-201: ウェブサイトへのメモ（Notes）機能

`docs/e2e/e2e-US-201.md` に設計された Playwright E2E テスト（`tests/e2e/website-notes.spec.ts`,
`tests/e2e/api-website-notes.spec.ts`）を実行した結果を記録する。

## 1. 実行環境

- OS: Windows
- DB: PostgreSQL 16（ローカル、`umami_e2e` データベースを新規作成し `prisma migrate deploy` で
  スキーマ適用。マイグレーション `21_add_website_notes` を含む全21件が正常に適用されたことを確認）
- アプリ起動方法: `next build` の本番ビルドを `next start -p 3002` で起動
  （`next dev`（Turbopack）はテスト実行中にリクエストが応答しなくなる不安定な挙動が見られたため、
  再現性を優先し本番ビルドに切り替えて実行した）
- テスト実行: `npx playwright test website-notes.spec.ts api-website-notes.spec.ts --workers=1`
  （`playwright.config.ts` の既定どおり `chromium` プロジェクトのみ）
- 認証: `admin` / `umami`（既定のシードユーザー）
- ブラウザ: Playwright Chromium（`npx playwright install chromium` で追加インストール）

## 2. 総合結果

| 項目 | 件数 |
|---|---|
| 実行テスト数 | 13（16件中、直列実行中の失敗により3件が未実行） |
| 成功 | 5 |
| 失敗 | 8 |
| 未実行（直列モードでの前段失敗によりスキップ） | 3 |

## 3. 受入条件（AC）ごとの合否

| AC | 受入条件の要旨 | UI (`website-notes.spec.ts`) | API (`api-website-notes.spec.ts`) | 総合判定 |
|----|------|------|------|------|
| AC-1 | メモ入力・保存で成功メッセージが表示される | ✗ 失敗 | ✓（AC-1/2合算ケースで確認） | **NG** |
| AC-2 | 保存後の再読み込みでメモが保持される | ✓ 成功 | ✓（同上） | **OK** |
| AC-3 | 501文字でバリデーションエラー、保存不実行（クライアント側） | ✗ 失敗 | ✓ 成功（400応答・非保存を確認） | **一部NG**（クライアント側のエラーメッセージ表示が未確認） |
| AC-3(境界) | ちょうど500文字は許可 | - | ✓ 成功 | **OK** |
| AC-4 | メモ空欄でもエラーにならず保存できる | ✗ 失敗 | ✓ 成功 | **一部NG**（API側はOK、UI側は未確認） |
| AC-5 | 一覧にメモの内容が表示される | ✗ 失敗 | - | **NG** |
| AC-6 | 長いメモは省略表示され、レイアウトが崩れない | ✗ 失敗 | - | **NG**（前提条件のAC-5が成立せず未検証） |
| AC-7 | メモ未設定の行には何も表示されない | ✗ 失敗（ロケーター不一致） | - | **判定保留** |
| AC-8 | 既存（メモ`null`）ウェブサイトが一覧・詳細・他フィールド更新でエラーなく動作 | ✗ 失敗 | ✗ 失敗（`leaves existing notes untouched`）／未実行（`returns notes as null...`） | **NG** |
| AC-9 | 更新権限のないユーザーはメモを変更できない | - | 未実行（直列モードで前段失敗のためスキップ） | **未検証** |
| AC-10 | 閲覧権限のみのユーザーはメモを読み取り専用で閲覧できる | - | 未実行（同上） | **未検証** |

## 4. テストケース単位の結果一覧

### `api-website-notes.spec.ts`

| # | テストケース | 結果 |
|---|---|---|
| 1 | saves notes within the 500 character limit (AC-1/AC-2) | ✓ 成功 |
| 2 | rejects notes over 500 characters with a 400 error (AC-3) | ✓ 成功 |
| 3 | accepts exactly 500 characters as a boundary case (AC-3 boundary) | ✓ 成功 |
| 4 | accepts an empty string for notes (AC-4) | ✓ 成功 |
| 5 | leaves existing notes untouched when omitted from an update (AC-8) | ✗ **失敗** |
| 6 | returns notes as null without error for legacy websites (AC-8) | - 未実行（直列モードで #5 失敗のためスキップ） |
| 7 | permission boundary › a user without update permission cannot change notes (AC-9) | - 未実行（同上） |
| 8 | permission boundary › a user with view-only permission can read notes (AC-10) | - 未実行（同上） |

### `website-notes.spec.ts`

| # | テストケース | 結果 |
|---|---|---|
| 1 | saves a notes value and shows the success message (AC-1) | ✗ **失敗** |
| 2 | persists notes across a page reload (AC-2) | ✓ 成功 |
| 3 | blocks submit and shows a validation error when notes exceed 500 characters (AC-3) | ✗ **失敗** |
| 4 | allows saving with an empty notes field (AC-4) | ✗ **失敗** |
| 5 | shows notes in the website list when set (AC-5) | ✗ **失敗** |
| 6 | truncates long notes in the website list without breaking layout (AC-6) | ✗ **失敗** |
| 7 | shows nothing in the website list when notes are unset (AC-7) | ✗ **失敗** |
| 8 | legacy website without notes still lists, opens, and updates other fields (AC-8) | ✗ **失敗** |

## 5. 検出した欠陥・不具合の切り分け

実装（`src`）は変更せず、原因調査のみ実施した（追加のAPI直叩き・ブラウザでの手動確認による再現テストを行い、
根本原因を切り分けた）。

### 【欠陥1】ウェブサイト新規作成API (`POST /api/websites`) が `notes` を受け付けず、常に破棄される

- **重要度: 高（AC-1, AC-5, AC-6, AC-7, AC-8 の複数の失敗の根本原因）**
- `src/app/api/websites/route.ts` の `POST` ハンドラの zod スキーマに `notes` フィールドが定義されていない。
  更新API（`src/app/api/websites/[websiteId]/route.ts`）には `notes: z.string().max(500).nullable().optional()`
  が定義されているのに対し、作成APIには存在しない。
- 再現手順: `POST /api/websites` に `notes: "Requested by Sales team."` を含めて新規作成 →
  レスポンスの `notes` は `null` になる（サーバーログでも確認済み）。
  ```
  POST /api/websites { ..., "notes": "Requested by Sales team." }
  → レスポンス: { ..., "notes": null }
  ```
- 影響:
  - `api-website-notes.spec.ts` の `leaves existing notes untouched when omitted from an update (AC-8)` は、
    テストヘルパー `addWebsite` で作成時に `notes: 'Keep me.'` を指定しているが、作成APIがこれを無視するため
    メモが最初から保存されておらず、後続の「メモ未更新のはずが保持されているか」の検証で失敗した。
  - `website-notes.spec.ts` の AC-5（一覧表示）・AC-6（省略表示）・AC-8（一覧・詳細）も同様に、
    テストが `addWebsite(... , { notes: ... })` で作成した時点でメモが保存されないため、
    一覧に表示されるべきメモが空のまま表示され、失敗している。
  - なお、更新APIで別途 `notes` を設定した後に他フィールドのみを更新した場合は、`notes` は正しく保持されることを
    直接のAPI呼び出しで確認済み（この経路自体には欠陥はない）。

### 【欠陥2】501文字入力時、クライアント側のバリデーションエラーメッセージが画面に表示されない（AC-3）

- **重要度: 中**
- `WebsiteEditForm.tsx` の `notes` フィールドに `maxLength: { value: 500, message: t(messages.notesTooLong) }`
  のルールが設定されており、501文字入力するとフォームは正しく無効と判定され、Saveボタンは disabled になる
  （ここまでは意図どおり）。
- しかし、実ブラウザで再現したところ、`Notes must be 500 characters or less.` というエラーメッセージ文言は
  画面上のどこにも表示されない（`page.getByText(...)` で件数0を確認）。
- AC-3 は「クライアント側バリデーションエラーが表示される」ことを要求しており、Saveボタンの disabled化だけでは
  ユーザーに理由が伝わらないため、この点は受入条件を満たしていない。

### 【切り分け3】E2Eテストのロケーターが実装のDOM構造と一致していない箇所（テスト側の要修正候補、製品欠陥ではない可能性）

- AC-1 / AC-8(UI) の `getByText(/Details/i)` は、`WebsiteEditForm` およびその周辺のDOMに "Details" という
  テキストが一切存在しないため、常に失敗する（スナップショットで確認済み）。要件書・実装いずれにも
  "Details" という見出しの記載は見当たらず、テスト設計時の想定と実装が一致していない可能性が高い。
- AC-6 / AC-7 の `td[label="Notes"]` セレクタは、実際の一覧テーブル（`@umami/react-zen` の `DataTable`）が
  `role="row"` / `role="rowheader"` ベースの構造でレンダリングされ、`td[label=...]` という属性を持つ要素が
  存在しないため要素が見つからない（スナップショットで `rowheader` 要素のみで `label` 属性なしを確認）。
- これらは実装のバグというより、テストのロケーター設計が実際のUIコンポーネント（react-aria/react-zenの
  DataTable）のレンダリング結果と乖離している可能性が高い。ただし「実装は修正しない」「テストは変更しない」
  という本フェーズの制約上、原因の切り分けのみ記録し、テスト自体の修正は行っていない。

### 【切り分け4】AC-4（UI）: メモを空欄のまま保存しようとするとSaveボタンが disabled のままになる

- 新規作成直後（メモ未設定=空）のウェブサイトに対し、メモ欄に空文字を入力してもフォームが「変更なし」と
  判定され、Saveボタンが disabled のままになることを実ブラウザで確認した。
- これは「メモが既に空の状態から空文字を入力しても実質的な変更がない」ためフォームライブラリが送信を
  ブロックしている可能性があり、必ずしも実装欠陥とは言い切れない（変更検知に基づく妥当な挙動である可能性も
  あるが、AC-4「メモ空欄でもエラーにならず保存できる」の検証観点からは、この経路でユーザーが保存操作を
  完了できないという事実は変わらない）。API経由（`api-website-notes.spec.ts` の同等ケース）では空文字での
  保存に成功しており、UI層とAPI層で挙動に差異がある。

### 未実行テスト（AC-9 / AC-10）について

- `api-website-notes.spec.ts` は `test.describe.configure({ mode: 'serial' })` で直列実行される設定であり、
  先行するテスト（AC-8関連）が失敗した時点で後続のテスト（AC-8の2件目、AC-9、AC-10）がスキップされた。
  そのため、権限まわり（AC-9・AC-10）は今回の実行では未検証である。
  欠陥1（作成API）を修正すれば、直列実行の先頭失敗が解消され、AC-9/AC-10も実行できる可能性が高い。

## 6. 環境起因の留意事項（テスト実施上の記録）

- 当初 `next dev`（Turbopack）で実行したところ、初回コンパイル負荷が高い状態で複数テストを並列実行すると
  `apiRequestContext.post: Request context disposed` エラーが多発し、再現性のある結果が得られなかった。
  ワーカー数を1にしても dev サーバー自体が無応答になる事象が発生したため、本番ビルド
  （`next build` → `next start`）に切り替えたところ安定して実行できた。本結果は本番ビルドでの実行結果である。
- ローカル環境の制約により、Playwrightの既定の `webServer`（`pnpm dev`, ポート3000）を使わず、
  別ポート（3002）で起動した本番サーバーに対し `PLAYWRIGHT_BASE_URL` / `PLAYWRIGHT_SKIP_WEB_SERVER` を指定して
  実行した。

## 7. 結論

- AC-2、AC-3(境界値)、AC-4(APIのみ) は合格。
- AC-1、AC-3(UI)、AC-4(UI)、AC-5、AC-6、AC-8 で欠陥・不具合を検出した。特に **ウェブサイト新規作成API
  (`POST /api/websites`) が `notes` フィールドを受け付けない欠陥（欠陥1）** が、AC-5/AC-6/AC-8を含む
  複数の失敗の根本原因であり、優先的な修正が必要である。
- AC-3のクライアント側バリデーションメッセージ非表示（欠陥2）も受入条件未達である。
- AC-7は実装欠陥かテストのロケーター不一致か切り分けが完了していない（判定保留）。
- AC-9・AC-10は直列実行で前段が失敗したため未検証。欠陥1の修正後に再実行が必要。
