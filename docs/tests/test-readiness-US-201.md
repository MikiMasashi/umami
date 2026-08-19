# テスト準備状況 US-201

このファイルは、実装前に必要なテストファースト検証を記録する。

## コマンド

| コマンド | 結果 |
| --- | --- |
| `npx playwright test --list` | 収集に成功。7ファイルにまたがる38件のE2Eテストが一覧表示された。US-201では `tests/e2e/website-notes.spec.ts` に4シナリオを追加した。 |
| `npm run test:unit` | 収集と実行が完了。18件のVitestファイルが収集され、82件のテストが成功し、US-201のコンポーネントテスト2件はUI契約が未実装のため想定どおり失敗した。 |

## 追加ライブラリ

なし。既存のPlaywright、Vitest、Testing Library、jsdomの依存関係で十分である。

## スクリプト調整

`package.json` には要求されたコマンドが存在しなかったため、`test:unit` を `vitest run --pool=threads` として定義した。threadsプールは、初回の `vitest run` 実行時にWindowsで確認されたfork worker起動タイムアウトを回避するためのもので、Vitestのincludeルールは変更しない。

## 確認された実装ギャップによる失敗

| テスト | 実装前に想定される理由 |
| --- | --- |
| `tests/e2e/website-notes.spec.ts` | Playwrightによる一覧表示には成功した。UIがまだ `input-notes` を公開しておらず、APIがまだ `notes` を永続化または返却せず、501文字のバリデーションレスポンスも未実装のため、実行時は失敗する想定。 |
| `src/component-tests/website-notes-page.test.tsx` / `US-201 edit page exposes the Notes field with the saved value and 500 character contract` | `TestingLibraryElementError: Unable to find an element by: [data-test="input-notes"]` で失敗した。これは想定された実装ギャップであり、ルートページがレビュー済みのメモtextarea契約をまだ表示していないため。 |
| `src/component-tests/website-notes-page.test.tsx` / `US-201 websites list page renders note summaries only for websites with notes` | `TestingLibraryElementError: Unable to find an element by: [data-test="website-note-summary-11111111-1111-4111-8111-111111111111"]` で失敗した。これは想定された実装ギャップであり、一覧ページがレビュー済みのメモサマリーをまだ表示していないため。 |
