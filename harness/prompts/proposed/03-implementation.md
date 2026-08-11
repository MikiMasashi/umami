# フェーズ: テスト起点実装＆ユニットテスト＆差分レビュー範囲の提案（提案プロセス）

あなたは実装を担当します。バックエンドは **`backend-architect` スキル**、UI は **`frontend-engineer` スキル**を使って作業してください。
対象プロジェクト: **{{PROJECT_NAME}}**

前フェーズで作成された E2E／コンポーネントテストは**人間のレビュー済み**です。
このフェーズは「**レビュー済みのテストを緑にする作業**」であり、テストは仕様として扱います。

## 入力（既存の成果物を読むこと）
- `{{DOCS_REQUIREMENTS}}/requirement-{{STORY}}.md`
- `{{DOCS_SPECIFICATIONS}}/api-specification.md`
- `{{DOCS_SPECIFICATIONS}}/data-specification.md`
- `{{DOCS_SPECIFICATIONS}}/architecture-specification.md`（**テスト容易性の契約**の節を必ず読むこと）
- `{{DOCS_E2E}}/e2e-{{STORY}}.md`
- `{{DOCS_COMPONENT_TESTS}}/component-test-design-{{STORY}}.md`
- **前フェーズが書いたテストコード**（＝**レビュー済みテスト**）
  - `{{SOURCE_E2E_TESTS}}` 配下の E2E テスト
  - {{SOURCE_COMPONENT_TESTS}} 配下のコンポーネントテスト

## やること
1. 前フェーズのテストコードを読み、**テストを緑にする実装**を設計に従って書く。
2. ユニットテストを {{SOURCE_UNIT_TESTS}} **直下**に追加する。
   **テストランナーが拾える置き場所・命名規則**（設定ファイルの include / testMatch 等）に必ず従うこと。

   > **{{SOURCE_COMPONENT_TESTS}} 配下には一切書き込まないこと。**
   > このディレクトリは前フェーズで作成され**レビューを受けたテスト**の置き場であり、
   > このフェーズが書く**未レビューのテスト**とパスで区別できなければならない。
   > 混在させると、下記4のレビュー範囲判定で「レビュー済みテストが担保している」という
   > 根拠が成立しなくなる。
3. ユニットテスト・コンポーネントテスト・E2E テストを**すべて実行して合格させる**。

   > **コンポーネントテストはこのフェーズでは原則追加しない**（前フェーズで作成済み）。
   > やむを得ず追加する場合も **{{SOURCE_COMPONENT_TESTS}} 配下には置かず**、
   > {{SOURCE_UNIT_TESTS}} 直下に置くこと（未レビューのテストであるため）。
   > 前フェーズのカバー漏れとして `{{DOCS_IMPLEMENTATION}}/implementation-notes-{{STORY}}.md` に
   > 理由を記録し、**その追加テストが担保する変更は下記4で `review` 扱いにする**
   > （未レビューのテストは省略の根拠にできないため）。
4. **レビュー範囲の提案を作る**（下記のルールに従う）。

## レビュー範囲判定のルール
このフェーズの変更のうち、**どこを人間がコードレビューすべきか**を判定する。

- `skip`（コードレビュー不要）にできるのは、次の**両方**を満たすときだけ:
  - 受入条件に紐づく **E2E またはコンポーネントテスト**で、振る舞いとして検証されている
  - そのテストが**前フェーズで作成され、レビュー済み**である
    ＝ `{{SOURCE_E2E_TESTS}}` または {{SOURCE_COMPONENT_TESTS}} 配下にあるもの
- **このフェーズで新規に書いたテスト（{{SOURCE_UNIT_TESTS}} 直下のユニットテスト、
  および例外的に追加したコンポーネントテスト）だけで担保される変更は `review`**。
  そのテスト自体が未レビューであり「テスト合格＝正しい」の根拠にならない。
- 次のものは**常に `review`**:
  - 設定・環境・依存追加に関する変更
  - テストが到達しない分岐（エラー処理・認可・例外系など）
  - 非機能に関わる変更（性能・セキュリティ）
  - **前フェーズのテストを変更した場合、その差分**

## 出力
- {{SOURCE_IMPL}} 配下の実装（既存のコードスタイルに合わせる）
- ユニットテスト一式（{{SOURCE_UNIT_TESTS}} 直下。{{SOURCE_COMPONENT_TESTS}} 配下には置かない）
- `{{DOCS_IMPLEMENTATION}}/implementation-notes-{{STORY}}.md` … 実装メモとセルフレビュー。
  **前フェーズのテストを変更した場合は、変更内容と理由を必ず記載する。**
- `{{DOCS_REVIEW_RESPONSES}}/review-scope-{{STORY}}.md` … レビュー範囲の対応表（人が読む形式）
- `{{DOCS_REVIEW_RESPONSES}}/review-scope-{{STORY}}.json` … 同じ内容の機械可読版（ハーネスが集計する）

### `review-scope-{{STORY}}.json` の形式
```json
{
  "story": "US-000",
  "targets": [
    { "path": "apps/api/src/routes/expenses.ts",
      "decision": "skip", "acceptance_criteria": ["AC-01-1", "AC-01-3"],
      "covered_by": ["tests/e2e/expense-submit.spec.ts::上限ちょうどは申請できる"],
      "reason": "申請の受理・却下の振る舞いはレビュー済みE2Eで検証済み" },
    { "path": "apps/api/src/config.ts",
      "decision": "review", "acceptance_criteria": [], "covered_by": [],
      "reason": "設定値。テストから到達しない" }
  ]
}
```
- `path` … リポジトリルートからの相対パス（`/` 区切り）。
- `decision` … `skip` または `review` のどちらか。
- **このフェーズで変更・追加した全ファイルを漏れなく列挙すること**（設計書・テスト・設定ファイルも含む）。
  列挙は `git diff --name-only` などで機械的に確認し、取りこぼさないこと。
- **行数は書かない。** レビュー規模はハーネスが `git diff` から実測する。
  このファイルの役割は「どのパスを `skip` とみなすか」の申告だけ。

## 制約（検証の再現性のため厳守）
- `stories/{{STORY}}/acceptance-criteria.md` … このファイルは検証時に使用するものなので**絶対に読み込まないこと**
- **前フェーズで作成されたテスト（`{{SOURCE_E2E_TESTS}}` および {{SOURCE_COMPONENT_TESTS}} 配下）の
  変更は原則禁止**。アサーションの緩和・削除・`skip` 化は**不可**。テストが落ちる場合は実装側を直すこと。
  やむを得ず変更した場合のみ、`{{DOCS_IMPLEMENTATION}}/implementation-notes-{{STORY}}.md` に理由を記録する。
- **{{SOURCE_COMPONENT_TESTS}} 配下へのファイル追加もしない**（レビュー済みテストの集合を汚さないため）。
- 欠陥の意図的な作り込みは**しない**（欠陥注入は実験者が別工程で人手で行う）。
- 要件・設計・受入条件ファイルは編集しない。
- **既存依存のバージョンは変更しない**（lockfile で固定されている。アップグレード・ダウングレード禁止）。
  ライブラリを追加した場合は `{{DOCS_IMPLEMENTATION}}/implementation-notes-{{STORY}}.md` に
  **追加したライブラリと採用理由**を記録する。
- E2E テスト（`{{SOURCE_E2E_TESTS}}` 配下）の**新規追加はしない**（前フェーズの担当）。
- テストがすべて合格することを確認してからコミットする（メッセージ: `[{{STORY}}] implementation + unit tests`）。
