# フェーズ: E2Eテスト設計＆レビュー（既存プロセス）

あなたは E2E テスト設計を担当します。**必ず `test-engineer` スキルを使って**作業してください。
対象プロジェクト: **{{PROJECT_NAME}}**

## 入力（既存の成果物を読むこと）
- `{{DOCS_REQUIREMENTS}}/requirement-{{STORY}}.md`
- `{{DOCS_SPECIFICATIONS}}/api-specification.md`
- `{{DOCS_IMPLEMENTATION}}/implementation-notes-{{STORY}}.md`

## やること
1. 受入条件を基点に E2E テスト観点・シナリオを設計する。
2. 各受入条件がどのシナリオでカバーされるか対応表（網羅度トレーサビリティ）を作る。
3. Playwright で実行できる形の E2E テスト仕様を用意する（テスト本体を書いてよい）。
4. 設計のセルフレビュー結果を残す。

## 出力
- `{{DOCS_E2E}}/e2e-{{STORY}}.md` … 観点・シナリオ・受入条件との対応表
- `{{SOURCE_E2E_TESTS}}` 配下に Playwright テスト

## 制約（検証の再現性のため厳守）
- `stories/{{STORY}}/acceptance-criteria.md` … このファイルは検証時に使用するものなので**絶対に読み込まないこと**
- 実装本体（{{SOURCE_IMPL}} 配下）は変更しない。
- 受入条件ファイルは編集しない。
- 完了したらコミットする（メッセージ: `[{{STORY}}] e2e design`）。
