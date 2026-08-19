# Architecture Review: US-201

## セルフレビュー結果

### 採用案

既存の Website 設定アーキテクチャに `notes` フィールドを通す設計を採用した。対象は Prisma `Website`、Prisma query、Next.js route handler、React query hooks、`WebsiteEditForm`、`WebsitesTable` に限定する。

根拠:

- 既存の権限境界である `canUpdateWebsite` をそのまま使える。
- 既存の `touch('websites')` / `touch('website:{id}')` により、保存後の一覧・詳細再取得導線が保たれる。
- 追加 API や追加 client state を作らず、保守性を損なわない。

### 懸念点

| 懸念 | 評価 | 対応 |
| --- | --- | --- |
| `WebsiteEditForm` の payload が `any` のままだと `notes` 型の保証が弱い | 既存コードの型安全性課題に乗る | 実装時は可能なら Website update payload 型を導入。ただし本設計では既存責務を変えない。 |
| 一覧の行高が増え、可読性が下がる可能性 | メモありサイトだけ表示すれば影響は限定的 | 補助テキスト・省略表示・最大幅指定を UI 責務にする。 |
| 共有表示や view-only ユーザーにメモが見える | 要件では閲覧者・チームメンバーがメモを確認する用途がある | 参照権限は Website と同一にし、更新のみ `canUpdateWebsite` で制限する。 |
| ローカライズキー追加漏れで UI 表示が崩れる | 新規ラベル・エラー文言が必要 | `messages.ts` と既存 locale に `notes` / 文字数超過文言を追加する方針を明記。 |

### 代替案と却下理由

| 代替案 | 却下理由 |
| --- | --- |
| メモ専用の Client Component と API hook を作る | 状態とエラー処理が WebsiteEditForm から分離し、保存 UX が二重化する。 |
| 一覧表示用に server 側で省略済み文字列を作る | UI 幅・レスポンシブ条件に依存するため、プレゼンテーション層で扱う方が自然。 |
| メモをチーム設定や別の Settings セクションで管理する | ユーザーが編集したい対象は個別 Website であり、既存 Website 編集画面が最短導線。 |
| optimistic update を追加する | 既存保存フローは mutation 成功後に cache touch する設計。メモだけ optimistic にすると一貫性が崩れる。 |

### フロントエンド観点レビュー

- `notes` 入力欄は `name` / `domain` と同じフォーム内に置くため、ユーザーは「ウェブサイト設定の保存」として理解しやすい。
- 複数行入力と文字数上限表示を使うと UX はよいが、必須ではない。最低限、保存失敗理由が既存フォームエラーとして伝われば要件を満たす。
- 一覧はメモ本文を常に列として追加すると横幅を圧迫するため、サイト名セル内の補助テキストとして表示する案が妥当。DataTable の既存列構造への影響を抑えられる。

### 結論

US-201 は既存 Website 設定フローのフィールド追加として実現するのが最も妥当である。アーキテクチャ上の新規境界は不要で、既存の API・権限・query cache・UI コンポーネント責務に沿って拡張できる。

