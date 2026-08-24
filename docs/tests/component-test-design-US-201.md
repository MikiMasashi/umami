# Component Test Design - US-201

## Target pages
- `src/app/(main)/websites/[websiteId]/settings/page.tsx`
- `src/app/(main)/websites/page.tsx`

## Test framework
- Vitest
- jsdom
- Testing Library (`data-test` attribute enabled in `src/test/setup.ts`)

## Scenarios

### Settings page
- notes 入力欄が表示される
- notes 未設定時は空で初期表示
- notes 既存値が表示される
- 入力変更で値が更新される
- クリアで空文字になる
- 500文字で submit 可能
- 501文字で `メモは500文字以内です` 表示
- エラー時に `data-test="notes-error-message"` が表示
- 権限なし時に textarea が read-only/disabled
- 権限なし時に保存ボタンが disabled/非表示
- API 400 時にバリデーション文言表示
- API 401 時に `メモを編集する権限がありません` 表示
- 保存成功時に `メモが保存されました`
- クリア保存時に `メモが削除されました`
- 既存メモの上書き保存ができる

### Websites page
- notes 列が表示される
- notes あり website は値表示
- notes なし website は空表示
- 50文字超は省略表示
- tooltip 採用時は全文取得可能

## Boundary values
- 0文字: 削除扱い
- 1文字: 正常
- 500文字: 正常
- 501文字: エラー

## Test doubles
- page ルート単位で API hook/query hook を mock
- 実 DOM 観測は `data-test` / role / text に限定

## Stability policy
- 実装詳細 class 名に依存しない
- 各 test で query state を初期化
- toast/assertion は文言固定値で確認
