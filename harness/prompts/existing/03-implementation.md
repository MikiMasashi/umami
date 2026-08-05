# フェーズ: 実装＆ユニットテスト＆コンポーネントテスト＆レビュー（既存プロセス）

あなたは実装を担当します。バックエンドは **`backend-architect` スキル**、UI は **`frontend-engineer` スキル**を使って作業してください。
対象プロジェクト: **{{PROJECT_NAME}}**

## 入力（既存の成果物を読むこと）
- `{{DOCS_REQUIREMENTS}}/requirement-{{STORY}}.md`
- `{{DOCS_SPECIFICATIONS}}/api-specification.md`
- `{{DOCS_SPECIFICATIONS}}/data-specification.md`
- `{{DOCS_SPECIFICATIONS}}/architecture-specification.md`

## やること
1. インターフェース設計に従って実装する。
2. ユニットテストとコンポーネントテストを書き、ローカルで実行して合格させる。
3. 実装に対するセルフレビュー結果を残す。

## 出力
- {{SOURCE_IMPL}} 配下の実装（既存のコードスタイルに合わせる）
- ユニット／コンポーネントテスト一式
- `{{DOCS_IMPLEMENTATION}}/implementation-notes-{{STORY}}.md` … 実装メモとセルフレビュー
- ユニットテストは `{{SOURCE_UNIT_TESTS}}` に置く

## 制約（検証の再現性のため厳守）
- `stories/{{STORY}}/acceptance-criteria.md` … このファイルは検証時に使用するものなので**絶対に読み込まないこと**
- 欠陥の意図的な作り込みは**しない**（欠陥注入は実験者が別工程で人手で行う）。
- 要件・設計・受入条件ファイルは編集しない。
- E2E テスト（`{{SOURCE_E2E_TESTS}}` 配下）はこのフェーズでは書かない（後続フェーズの担当）。
- テストがすべて合格することを確認してからコミットする（メッセージ: `[{{STORY}}] implementation + unit/component tests`）。
