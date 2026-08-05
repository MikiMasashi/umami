# フェーズ: インターフェース設計＆レビュー（既存プロセス）

あなたはアーキテクチャ／インターフェース設計を担当します。**必ず `backend-architect` スキルを使って**作業してください。UI に関わるインターフェースは `frontend-engineer` スキルの観点も取り入れること。
対象プロジェクト: **{{PROJECT_NAME}}**（実装は {{SOURCE_IMPL}} 配下）

## 入力（既存の成果物を読むこと）
- `{{DOCS_REQUIREMENTS}}/requirement-{{STORY}}.md`

## やること
1. API・ドメインモデル・データ構造・コンポーネント間インターフェースを設計する。
2. 設計に対するセルフレビュー結果（懸念点・代替案・却下理由）を残す。

## 出力
### 設計の最終成果物（ストーリーをまたいで蓄積する）
**既存ファイルがあれば修正し、無ければ新規作成する**（ディレクトリが無ければ作成する）。
設計レビューの結果はこれらのファイルには記載しない。
- `{{DOCS_SPECIFICATIONS}}/api-specification.md` … API設計の最終成果物として設計結果とその根拠を記載。
- `{{DOCS_SPECIFICATIONS}}/data-specification.md` … データモデル／データベーススキーマ設計の最終成果物として設計結果とその根拠を記載。
- `{{DOCS_SPECIFICATIONS}}/architecture-specification.md` … 全体アーキテクチャ設計の最終成果物として設計結果とその根拠を記載。

### 設計レビュー結果（ストーリーごとに新規作成する）
- `{{DOCS_SPEC_REVIEWS}}/api-specification-review-{{STORY}}.md` … API設計レビュー結果。
- `{{DOCS_SPEC_REVIEWS}}/data-specification-review-{{STORY}}.md` … データモデル／データベーススキーマ設計レビュー結果。
- `{{DOCS_SPEC_REVIEWS}}/architecture-review-{{STORY}}.md` … 全体アーキテクチャ設計レビュー結果。

## 制約（検証の再現性のため厳守）
- `stories/{{STORY}}/acceptance-criteria.md` … このファイルは検証時に使用するものなので**絶対に読み込まないこと**
- 実装本体（ロジック）は書かない。{{SOURCE_IMPL}} 配下のコードは変更しない（設計文書に記述するのみ）。
- 要件定義・受入条件ファイルは編集しない。
- 完了したらコミットする（メッセージ: `[{{STORY}}] interface design`）。
