# アーキテクチャ仕様

## US-201 Webサイトメモ

### アーキテクチャ決定

Webサイトメモは、既存の `Website` 集約に追加する新しいnullableフィールドとして実装し、既存の「Settings > Websites」画面、Webサイト更新API、Prismaクエリ層、Webサイト一覧クエリ層を通じて扱う。これにより、メモを現在のWebサイト設定境界内に収め、既存の認証、認可、キャッシュ、modified keyによる無効化を再利用する。

### コンポーネントとデータフロー

1. Webサイト編集ページは既存のWebサイトクエリで対象Webサイトを読み込み、Webサイト設定フォームの一部として `Notes` のtextareaを表示する。
2. フォーム送信時は、既存のname/domain更新ペイロードとともに `notes` を `POST /api/websites/{websiteId}` へ送信する。
3. ルートハンドラーは文字数を検証し、空白のみの入力を `null` に正規化し、既存のWebサイト更新権限を確認してからフィールドを保存する。
4. 更新成功時は `notes` を含むWebサイトを返し、既存の `websites` と `website:{websiteId}` のmodified keyを更新する。
5. 「Settings > Websites」の一覧は既存のWebサイト行データで `notes` を受け取り、値が空でない場合のみサマリーを表示する。

### UI契約

編集フォームでは、`Notes` ラベル付きの通常のtextareaを使用する。一覧のサマリーはプレーンテキストとして表示し、読みやすさのために視覚的に省略してもよい。ただし、永続化される値とAPI値は省略しない。

### テスタビリティ契約

このセクションは、レビュー対象のE2Eテストおよびコンポーネントテストに対する外部契約である。意図的に、観測可能なURL、DOM、HTTPの挙動のみを固定する。子コンポーネントの分割やpropsシグネチャは制約しない。

#### ルーティング

| ルート | ページモジュール | 目的 |
| --- | --- | --- |
| `/settings/websites` | `src/app/(main)/settings/websites/page.tsx` | メモサマリーを表示する設定用Webサイト一覧。 |
| `/settings/websites/{websiteId}` | `src/app/(main)/settings/websites/[websiteId]/page.tsx` | ルートレベルのコンポーネントテスト向けWebサイト編集エントリーポイント。 |
| `/websites/{websiteId}/settings` | `src/app/(main)/websites/[websiteId]/settings/page.tsx` | Webサイト設定一覧の編集アクションから到達するアプリ内編集ルート。 |

#### `data-test` 命名規則

kebab-caseを使用し、役割ごとの接頭辞を付ける。

| 接頭辞 | 用途 |
| --- | --- |
| `input-*` | フォーム入力ラッパー。 |
| `button-*` | クリック可能なアクションボタン。 |
| `website-note-*` | Webサイトメモの表示領域。 |

US-201のセレクタ:

| セレクタ | 要素 |
| --- | --- |
| `input-notes` | メモ用textareaフォームフィールドのラッパー。内包するコントロールは `textarea`。 |
| `button-submit` | 既存のWebサイト設定保存ボタン。 |
| `website-note-summary-{websiteId}` | 特定Webサイトに対するWebサイト一覧上のメモサマリー。メモ未設定時は要素自体を出力しない。 |

#### フォームフィールド識別子

| フィールド | HTML name | ラベル | コントロール |
| --- | --- | --- | --- |
| Webサイトメモ | `notes` | `Notes` | `maxlength="500"` を持つ `textarea` |

#### UIメッセージ

| 状況 | メッセージ |
| --- | --- |
| メモが500文字を超える | `Notes must be 500 characters or fewer.` |
| 保存成功 | 既存の保存完了トーストメッセージ（`Saved`） |
| 一覧でメモが未設定 | メモ文言もプレースホルダーも表示しない。 |

#### HTTP契約

| リクエスト | 成功 | エラー |
| --- | --- | --- |
| `notes` の長さが500文字以下の `POST /api/websites/{websiteId}` | `200`、`notes` が文字列または `null` の更新後Webサイト | 該当なし |
| `notes` の長さが501文字以上の `POST /api/websites/{websiteId}` | 該当なし | `400`、`{ "error": { "message": "Notes must be 500 characters or fewer.", "code": "validation-error", "status": 400, "field": "notes" } }` |
| 更新権限なしの `POST /api/websites/{websiteId}` | 該当なし | `401`、`{ "error": { "message": "Unauthorized", "code": "unauthorized", "status": 401 } }` |

#### コンポーネントテストのエントリーポイント

| テスト対象 | ページモジュール |
| --- | --- |
| Webサイト編集ページ | `src/app/(main)/settings/websites/[websiteId]/page.tsx` |
| Webサイト一覧ページ | `src/app/(main)/settings/websites/page.tsx` |
