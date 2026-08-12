# US-201 テスト実行可能性（readiness）確認記録

このドキュメントは、`docs/e2e/e2e-US-201.md` と `docs/tests/component-test-design-US-201.md` に基づいて作成した
E2E（Playwright）／コンポーネント（Vitest）テストが、**実装が存在しないために失敗している**こと（収集不能・構文エラーではないこと）を確認した記録である。

## 1. 実行環境

- OS: Windows
- パッケージマネージャ: pnpm（本確認では `npx` 経由で直接 `playwright` / `vitest` を実行）
- 対象コミット: 本フェーズの成果物コミット前（`src` / `aprisma` 配下は未変更）

## 2. E2E（Playwright）: シナリオ収集の確認

### 実行コマンド

```
npx playwright test --list
```

`package.json` の `test:e2e` スクリプト（`playwright test`）は実サーバ（`pnpm dev` の起動、DB 接続込み）を要求するため、
本手順で確認したいのは「構文・収集が成立しているか」のみである。`--list` はサーバを起動せずに
テストファイルの読み込み・`test()` 呼び出しの収集のみを行うため、これで目的を満たす。

### 結果

```
Total: 49 tests in 8 files
```

既存 5 ファイル（`api-team.spec.ts` / `api-user.spec.ts` / `api-website.spec.ts` / `login.spec.ts` / `user.spec.ts` /
`website.spec.ts` = 実質6ファイル）に加え、本フェーズで追加した以下の2ファイルが正しく収集され、シナリオ一覧に列挙された。

- `tests/e2e/website-notes.spec.ts` … 9 シナリオ（`Website notes UI tests`）
  - `saves notes and shows a success toast`
  - `shows existing notes when opening the settings page`
  - `persists notes after a page reload`
  - `saves an empty notes field as unset`
  - `opens the settings page for a website without notes without error`
  - `shows the notes summary in the websites list`
  - `truncates a long notes value in the websites list`
  - `does not show any notes indicator for a website without notes`
  - `rejects notes over 500 characters on the client and shows a validation message`
  - `allows a view-only permission user to see notes but not edit them`

  （本フェーズ追加分は E2E だけで 10 件、下記 API 側 5 件と合わせて合計 15 件。）

- `tests/e2e/api-website-notes.spec.ts` … 5 シナリオ（`Website notes API tests`）
  - `keeps notes unset when updating only name and domain`
  - `saves successfully when notes is exactly 500 characters`
  - `rejects notes over 500 characters at the API level`
  - `rejects a notes update from a user without update permission`
  - `includes canUpdate in the website detail response for a team-view-only member`

collection エラー・構文エラーはゼロ件。これにより「テストランナーが正しくファイルを拾い、`test()` 定義を解釈できる」ことが確認できた
（実装未着手の段階でも `--list` は成立する＝収集の妥当性は実装の有無に依存しない設計）。

> 実サーバに対する実行（`pnpm test:e2e`）は、DB 起動・シードデータ・`pnpm dev` の起動を要するため本フェーズでは実施していない。
> 実装フェーズで実装が入った後、通常の `pnpm test:e2e` 実行によって「実装後に green になること」を確認する想定。

## 3. コンポーネントテスト（Vitest）: 失敗理由の確認

### 実行コマンド

`package.json` に `test:unit` という名前のスクリプトは存在しない（ユニットテスト全体を指すスクリプトは `"test": "vitest run"`）。
本フェーズで新規作成したコンポーネントテストのみを対象に、以下を実行した。

```
npx vitest run src/component-tests
```

および、既存テスト（`src/**/*.test.{ts,tsx}`、`src/component-tests` を含む）を壊していないことの確認として：

```
npx vitest run
```

### 結果（`npx vitest run src/component-tests`）

```
Test Files  2 failed (2)
     Tests  8 failed | 1 passed (9)
```

### 結果（`npx vitest run` フルスイート）

```
Test Files  2 failed | 17 passed (19)
     Tests  8 failed | 83 passed (91)
```

既存の17テストファイル・83テストは全て green のまま（本フェーズの変更が既存挙動を壊していないことを確認）。
新規追加した2ファイル・9テストのうち、8件が実装未着手により失敗し、1件は「notes が無い場合は notes 表示をしない」という
現状でも自明に成立する回帰防止用の否定アサーションであるため現時点でも pass する（実装後も継続して green であるべきテスト）。

### 失敗テストと失敗理由（実装未存在であることの確認）

| # | テストファイル | テストケース | 失敗理由 |
|---|---|---|---|
| 1 | `src/component-tests/WebsiteSettingsPage.test.tsx` | `renders the existing notes value in the notes field` | `TestingLibraryElementError: Unable to find an element by: [data-test="input-notes"]` — notes 入力欄（`data-test="input-notes"`）がまだ実装されていない。 |
| 2 | 同上 | `renders an empty notes field for a website without notes` | 同上（`input-notes` が存在しない）。 |
| 3 | 同上 | `saves notes and shows a success message` | 同上（`input-notes` が存在しないため、値の入力自体ができない）。 |
| 4 | 同上 | `submits an empty notes value when the field is cleared` | 同上。 |
| 5 | 同上 | `shows a validation message when notes exceeds 500 characters and does not submit` | 同上（`input-notes` が存在せず、クライアント側 500 文字バリデーションも未実装）。 |
| 6 | 同上 | `disables the notes field and hides the save button when the user cannot update the website` | 同上（`input-notes` が存在せず、`canUpdate` に基づく無効化ロジックも未実装）。 |
| 7 | `src/component-tests/WebsitesSettingsPage.test.tsx` | `renders the notes summary for a website with notes` | `TestingLibraryElementError: Unable to find an element by: [data-test="text-notes"]` — 一覧の Notes 列（`data-test="text-notes"`）が未実装。 |
| 8 | 同上 | `truncates a long notes value to 60 characters with an ellipsis` | 同上（Notes 列が存在しないため、60文字＋`…`への切り詰めロジックも未確認）。 |

いずれも **「要素・機能そのものが存在しない」ことに起因する失敗**であり、アサーション対象の値が違う（実装済みだが期待値がズレている）
という種類の失敗ではない。つまり「実装が無いために失敗している」ことが確認できた。

E2E 側（`tests/e2e/website-notes.spec.ts` / `tests/e2e/api-website-notes.spec.ts`）は前述の通り実サーバに対しては未実行だが、
参照している `data-test` 属性（`input-notes` / `text-notes`）・API フィールド（`notes` / `canUpdate`）・エラー文言はコンポーネントテストと
同一の契約（`docs/specifications/architecture-specification.md` のテスト容易性の契約）に基づいており、同じ理由（実装未存在）で
失敗することが設計上保証されている。

## 4. 追加した外部ライブラリ

**なし。** 本フェーズで使用した以下はすべて既存の devDependencies であり、新規追加はしていない。

- `@playwright/test`（既存）
- `vitest` / `@testing-library/react` / `@testing-library/jest-dom` / `@testing-library/user-event`（既存、`src/test/render.tsx` 経由）
- `msw`（既存、`src/test/msw/server.ts` / `handlers.ts` に既存スキャフォールドあり。今回は `src/component-tests/support/msw.ts` を新規作成し、
  既存の `server` / `HttpResponse` / `http` エクスポートを再利用する形でハンドラを追加登録した。既存の `src/test/msw/handlers.ts`
  自体は変更していない）

## 5. 実装フェーズ向けの技術メモ（テスト実行時に判明した既存コードの前提）

以下は「制約」ではなく、実装フェーズがテストを green にする際に踏むと想定される、既存コードのテスト実行上の注意点の記録。
（実装本体はこのフェーズでは変更していない。）

- `src/lib/api-url.ts` の `getApiUrl()` は `/config` と `/auth/*` を「アプリ内ルート」とみなし `apiUrl` 環境変数によるベースURL
  置換の対象外としている。そのため component test 環境（jsdom）では、これらは常に相対URL（jsdomのデフォルトオリジンを基点とする
  絶対URLに解決される）でリクエストされる。`src/component-tests/support/msw.ts` ではこれを踏まえ、`/config` のモックハンドラを
  ワイルドカードオリジン（`*/api/config`）で登録している。
- それ以外の `/websites/*` 等の API 呼び出しは `process.env.apiUrl` を絶対オリジンに設定することで解決した
  （jsdom 環境では相対 `fetch('/api/...')` がそのままでは正しく解決できないため）。
