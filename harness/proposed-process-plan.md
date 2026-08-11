# 提案プロセス（proposed）実装プラン

> 別セッションで実装を引き継ぐためのハンドオフ文書。**まだ何も実装していない**（本ファイルのみ）。
> 関連: [improvement-plan.md](improvement-plan.md) 改善点#1（P0）/ [measurement_indicators.md](measurement_indicators.md) の「コードレビュー省略率」

## 背景

既存プロセス（5フェーズ）とベースライン（プロセス指定なし）は実装済みだが、**検証の核である提案プロセスが未実装**で、主指標「コードレビュー省略率」が測定不能な状態にある。

中心仮説は「**テストで要件充足を確認できた箇所はコードレビューを省略できる**」。これを成立させるため、E2E／コンポーネントテストの設計とコード化を実装より前に置いて重点レビューする。実装フェーズは「レビュー済みテストを緑にする作業」に変わるため、レビューを**テストで担保できない差分だけ**に絞れる、という筋書きを実際に回せる形にするのがゴール。

ハーネスは `harness/processes/<variant>.json` ＋ `harness/prompts/<variant>/*.md` を汎用的に読む（`Invoke-Process.ps1:275, 433`）ため、**プロセス追加自体はスクリプト改修なしで `-Variant proposed` として動く**。改修が要るのは省略率の記録だけ。

## 確定した設計判断（ユーザー合意済み）

| 論点 | 決定 |
|---|---|
| 自動テストコードの作成時期 | **E2E・CT は②でコード化しレビュー対象にする**。UT は詳細設計に依存するため③で実装と同時に作成 |
| ③のレビュー方式 | **テスト未カバー差分のみレビュー**（完全スキップはしない）。省略率＝skip対象 ÷ 全対象で測定 |
| ③でのテスト改変 | **原則禁止**。やむを得ない変更は理由を必ず記録し、レビューで確認する |

---

## フェーズ定義（4フェーズ）

| # | id | 名称 | 担当Skill | ゲート | 既存プロセスとの対応 |
|---|---|---|---|:---:|---|
| ① | `requirements` | 要件定義 | requirements-analyst | ✅ 標準レビュー | 既存① と**同一**（本文も同一に保つ） |
| ② | `test-design` | E2E/IF/CT設計＆テストコード作成＆レビュー | test-engineer + backend-architect | ✅ **重点レビュー** | 既存②IF設計 ＋ 既存④E2E設計 の統合＋前倒し |
| ③ | `implementation` | テスト起点実装＆ユニットテスト＆差分レビュー | backend-architect + frontend-engineer | ✅ **差分レビューのみ** | 既存③ に相当 |
| ④ | `e2e-run` | E2Eテスト実施 | test-engineer | ✅ 結果確認 | 既存⑤ と**同一** |

phase id を既存と揃える（`requirements` / `implementation` / `e2e-run`）ことで、`metrics.jsonl` を工程単位で突き合わせられる。

---

## 新規作成ファイル

### 1. `harness/processes/proposed.json`

`existing.json` と同じスキーマ。`variant: "proposed"`、4フェーズすべて `gate: true`。
③のフェーズにのみ **`"reviewScope": true`** を追加する（後述のとおり、どのゲートで省略率を記録するかをスクリプトが判定するために使う。`processes/*.json` にこのキーが無いフェーズでは省略率を記録しない）。

### 2. `harness/prompts/proposed/01-requirements.md`

`harness/prompts/existing/01-requirements.md` を**見出しの「（既存プロセス）」→「（提案プロセス）」以外は一字一句同一**にコピーする。要件定義を独立変数から外し、①の差が結果に混入しないようにするため。

### 3. `harness/prompts/proposed/02-test-first-design.md` ← **中核**

既存の `02-interface-design.md` と `04-e2e-design.md` の構造・書式を踏襲して1フェーズに統合する。

**入力**: `{{DOCS_REQUIREMENTS}}/requirement-{{STORY}}.md`

**やること（この順序で明示する）**
1. API・ドメインモデル・データ構造・コンポーネント間IFを設計する（既存②と同じ）
2. **テスト容易性の契約を確定する** ← 提案プロセス固有。実装が無い状態でテストを書くために必須
   - ルーティング（パス ↔ ページ）
   - テスト用セレクタ規約（`data-testid` の命名規則と一覧）
   - フォーム項目の識別子
   - 画面に表示するエラーメッセージ文言
   - APIのエラーレスポンス形式とHTTPステータス
   - CT のエントリポイント（ルート単位のページモジュールのパス）

   > **契約に含めないもの: 子コンポーネントの分割方針と props 署名。**
   > 実装前に内部構造まで固定すると、③で「設計どおりに分割したらテストが落ちる」が発生し、
   > 「②のテスト改変は原則禁止」（③の制約）と正面衝突する。改変が常態化すると
   > 「レビュー済みテストが実装を担保する」という中心仮説の前提そのものが崩れ、検証が無効になる。
   > 契約は**外から観測できるもの（URL・DOM・HTTP）に限る**。
3. 要件を基点に E2E テスト観点・シナリオを設計し、受入条件との対応表を作る
4. コンポーネントテストの観点・シナリオを設計し、受入条件との対応表を作る
5. **E2E（Playwright）と CT（Vitest）のテストコードを実際に書く**
6. **テストが「実装が無いために失敗している」ことを確認する**
   - `npx playwright test --list` … シナリオが列挙できる＝構文・収集が成立している
   - `npm run test:unit` … 失敗理由が「実装未存在／期待値未達」であることを確認
   - **この確認を省くと、収集すらされないテストが③で「全部緑」に化けて仮説検証が無効になる**
7. 設計とテストのセルフレビュー結果を残す

**出力**
- `{{DOCS_SPECIFICATIONS}}/{api,data,architecture}-specification.md`（既存②と同一。蓄積型。テスト容易性契約は architecture 側に節を設ける）
- `{{DOCS_SPEC_REVIEWS}}/{api-specification,data-specification,architecture}-review-{{STORY}}.md`（既存②と同一）
- `{{DOCS_E2E}}/e2e-{{STORY}}.md`（既存④と同一。観点・シナリオ・AC対応表）
- `{{DOCS_COMPONENT_TESTS}}/component-test-design-{{STORY}}.md`（新規。CT観点・シナリオ・AC対応表）
- `{{DOCS_COMPONENT_TESTS}}/test-readiness-{{STORY}}.md`（新規。手順6の red 確認記録）
- `{{SOURCE_E2E_TESTS}}` 配下の Playwright テスト
- `{{SOURCE_UNIT_TESTS}}` 配下の CT テスト

**制約**（既存プロンプトの「## 制約（検証の再現性のため厳守）」節の書式を踏襲）
- `stories/{{STORY}}/acceptance-criteria.md` は**絶対に読み込まない**（全プロンプト共通）
- **実装本体（`{{SOURCE_IMPL}}` の `src` 配下）は書かない**。テストを通すためのスタブ・空実装も作らない
- UT はこのフェーズでは書かない（③の担当）
- **CT の対象はルート単位のエントリポイント（`app/**/page.tsx` 等）に限定する。**
  内部の子コンポーネントをどう分割するかは③の裁量に残す
- **CT のアサーションは DOM ベース（role / `data-testid` / 表示文言）のみ。**
  props 署名・内部の構造・子コンポーネントの呼ばれ方には依存させない（③でのテスト改変を防ぐため）
- 既存依存のバージョン変更禁止。テスト用ライブラリの追加は可（理由を記録）
- テストが失敗する状態でコミットしてよい（メッセージ: `[{{STORY}}] test-first design + tests`）

### 4. `harness/prompts/proposed/03-implementation.md`

**入力**: requirement / 3設計書 / `e2e-{{STORY}}.md` / `component-test-design-{{STORY}}.md` / ②が書いたテストコード

**やること**
1. ②のテストコードを読み、**テストを緑にする実装**を書く
2. UT を `{{SOURCE_UNIT_TESTS}}` に追加する
3. UT / CT / E2E をすべて実行して合格させる

> **CT はこのフェーズでは原則追加しない**（②で作成済み）。
> 既存プロセスの③は UT と CT の両方を書くため、同じ指示を残すと CT を重複作成してしまい、
> 「②でレビュー済みの CT」と「③で新規に書いた未レビューの CT」が混在して skip 判定の根拠が濁る。
> やむを得ず CT を追加した場合は、②のカバー漏れとして implementation-notes に理由を記録し、
> **その CT が担保する差分は `review` 扱い**にする（未レビューのテストは skip の根拠にできない）。
4. **レビュー範囲の提案を作る** ← 提案プロセス固有・省略率の分子

**レビュー範囲判定のルール**（プロンプトに明記する）
- `skip` にできるのは次の両方を満たすとき
  - 受入条件に紐づく **E2E または CT** で振る舞いとして検証されている
  - その E2E／CT が **②でレビュー済み**である
- **③で新規に書いたテスト（UT、および例外的に追加した CT）だけで担保される変更は `review`**。そのテスト自体が未レビューで「テスト合格＝正しい」の根拠にならないため
- 常に `review` にするもの: 設定・環境・依存追加／テストが到達しない分岐（エラー処理・認可等）／非機能（性能・セキュリティ）／**②のテストを変更した場合はその差分**

**出力**
- `{{SOURCE_IMPL}}` 配下の実装、`{{SOURCE_UNIT_TESTS}}` 配下の UT
- `{{DOCS_IMPLEMENTATION}}/implementation-notes-{{STORY}}.md`（実装メモ＋セルフレビュー。**テストを変更した場合は変更内容と理由を必ず記載**）
- `{{DOCS_REVIEW_RESPONSES}}/review-scope-{{STORY}}.md`（人が読む対応表）
- `{{DOCS_REVIEW_RESPONSES}}/review-scope-{{STORY}}.json`（機械可読。ハーネスが集計する）

```json
{
  "story": "US-001",
  "targets": [
    { "path": "apps/api/src/routes/expenses.ts",
      "decision": "skip", "acceptance_criteria": ["AC-01-1","AC-01-3"],
      "covered_by": ["tests/e2e/expense-submit.spec.ts::上限ちょうどは申請できる"],
      "reason": "..." },
    { "path": "apps/api/src/config.ts",
      "decision": "review", "acceptance_criteria": [], "covered_by": [],
      "reason": "設定値。テストから到達しない" }
  ]
}
```

> **重要**: JSON に行数は書かせない。行数は下記のとおりハーネスが `git diff` から実測する。
> AIに書かせると分母・分子が自己申告になり指標が壊れる。JSONの役割は「どのパスを skip とみなすか」の申告だけ。
> **変更した全ファイルを漏れなく列挙すること**をプロンプトで指示する。

**制約**
- AC 閲覧禁止（共通）
- **②で作成した E2E／CT の変更は原則禁止**。assertion の緩和・削除・skip は不可。やむを得ない場合のみ implementation-notes に理由を記録
- 欠陥の意図的な作り込みはしない（欠陥注入は実験者が別工程で人手で行う）
- 既存依存のバージョン変更禁止
- 全テスト合格を確認してコミット（メッセージ: `[{{STORY}}] implementation + unit tests`）

### 5. `harness/prompts/proposed/04-e2e-run.md`

`harness/prompts/existing/05-e2e-run.md` を見出し以外**同一内容**でコピー。E2E実施工程を変数から外す。

### 6. `harness/prompts/proposed/99-revise.md`

`harness/prompts/existing/99-revise.md` を見出し以外同一内容でコピー（`-Revise` の差し戻し対応用。**無いと差し戻しが動かない**）。

---

## 変更するファイル

### `harness/project.json`

`docs` セクションに CT設計書の置き場を追加する。トークン名は `ConvertTo-TokenName`（`Invoke-Process.ps1:212`）の規則で `{{DOCS_COMPONENT_TESTS}}` になる。

```json
"componentTests": "docs/tests"
```

既存プロセスのプロンプトは新トークンを参照しないため影響なし（未解決チェックはプロンプト側に現れたトークンのみ検査する — `Invoke-Process.ps1:244-250`）。

### `harness/Invoke-Process.ps1`

**① `Get-DiffFiles($base)` を新設**（`Get-DiffStats`（`:501-515`）の隣）
`Get-DiffStats` は集計値しか返さずパス一覧が無いため、`git diff --numstat <base> HEAD` を
`@{ path; added; deleted }` の配列として返す関数を足す。バイナリ（`-`）は 0 として扱う。

**② `Write-ReviewRound`（`:616-703`）の `$row` に列を追加**

省略率の**分母は必ず実測の `git diff`**、JSON は decision の参照にのみ使う。
JSON に載っていない変更ファイルは**保守的に `review` として数える**（AIの列挙漏れで分子が水増しされるのを防ぐ）。

| 列 | 内容 |
|---|---|
| `scope_source` | `review-scope` / `none`（existing・baseline は `none`） |
| `scope_total_files` / `scope_skipped_files` | 対象数ベースの分母・分子 |
| `scope_total_added` / `scope_skipped_added` | **規模ベースの分母・分子（主）** |
| `scope_unlisted_files` | JSON未記載の変更ファイル数。**データ品質のシグナル**（0でないラウンドは集計時に要確認） |

- 省略率＝`scope_skipped_added ÷ scope_total_added`
- `review_time_source` は `pending-review` のまま、`outcome` も `continue`/`revise` のまま使う。
  **完全スキップではないので `skipped` / `skip` は使わない**
- 記録するのは `reviewScope: true` を持つフェーズのゲートだけ。それ以外は全列 `$null` ＋ `scope_source="none"`。
  `review-scope-<STORY>.json` は一度作られると後続フェーズにも存在し続けるため、
  **ファイルの有無で判定してはいけない**（④のゲートで誤記録される）。フェーズ定義を見て判定すること。
  → 現在の変種の `processes/<variant>.json` から該当フェーズ定義を引くヘルパーが必要
  （`$proc` は `:898` でメインスコープに読み込まれているが、`Write-ReviewRound` からは見えない）

**③ `Start-ReviewRound`（`:577-589`）に警告を追加**

`reviewScope: true` のフェーズで、`review-scope-<STORY>.json` が無い／変更ファイルに JSON 未記載のものがある場合に警告を出す。**停止はさせない**（`Get-DiffStats` 同様、計測の失敗で実験を止めない方針に合わせる）。
`-Revise` の push 完了時にも呼ばれるので、差し戻し後の再判定漏れも拾える。

### ドキュメント整合（既存の記述と食い違うため必須）

- `README.md:32-42` — 提案プロセスの定義を実体（4フェーズ・②でテストコード作成）に更新。`:123-134` の実行例に `-Variant proposed` を追記。`:152` の「拡張ポイント」記述を実装済みに変更
- `harness/README.md:358-359` — `outcome` / `review_time_source` の「提案プロセスの省略・未実装」注記を修正し、`scope_*` 列を計測列表に追加。③の差分レビュー運用手順を追記
- `harness/measurement_indicators.md:85` — コードレビュー省略率の定義を `scope_skipped_added ÷ scope_total_added` で確定し 🔴 → 🟡 へ。`:121` の `review_time_source` 説明から「省略率の分子は `skipped`」を削除
- `harness/improvement-plan.md:22` — 改善点#1 を完了として記載

### `.claude/skills/` は変更しない

4スキルは**定数**（`README.md:58`）。提案プロセス固有の指示はすべてプロンプト側に置く。

---

## 実験の妥当性に関する明示事項（報告書に書く前提で織り込む）

- 成果物集合は既存プロセスとほぼ同一に保つ（提案側の追加は CT設計書・test-readiness・review-scope の3点のみ）。品質指標を同条件で比較するため
- **提案プロセスにのみ存在する要素**＝「テスト容易性契約」と「レビュー範囲判定」。これらは提案プロセスの構成要素であり独立変数の一部として明記する（隠さない）
- **既存プロセスのプロンプト・プロセス定義は一切変更しない**（比較基準の固定）
- ③のゲートでは、レビュアーはまず review-scope の skip 判定の妥当性を確認し、その上で `review` 対象のみコードを読む。**判定の妥当性確認にかかる時間も `review_ms` に含まれる**（正直に測る）
- 省略率の分母には docs 等の非コード変更も含まれる（AIが `review` と判定するため省略率は保守的に出る）。集計時にコードのみへ絞りたい場合は `path` でフィルタできるよう、JSONは全変更ファイルを列挙させる
- 欠陥注入のタイミングは既存プロセスと同じく「実装フェーズ完了・ゲート停止後、レビュー前」（③の後）。④のE2E実施で検出される

---

## 検証手順

1. **プレースホルダ解決の確認**
   新規プロンプト内の `{{...}}` を列挙し、`project.json` 由来のトークン集合（`PROJECT_NAME` / `DOCS_*` / `SOURCE_*`）＋ `STORY` に含まれることを確認する。未解決があると `Expand-Prompt` が `Invoke-Process.ps1:249` で停止する。
2. **パイロット1本を通す**（brief 記入済みの `US-SAMPLE01` を使う。AC 未記入でも②はACを読まないため支障なし）
   ```powershell
   powershell -File harness/Start-Sample.ps1 -N 1 -Story US-SAMPLE01 -Variant proposed
   ```
3. **各ゲートで3ステップ**を回す（`-Review` → GitHubで Submit review → `-Continue`）
4. **②完了時に確認**すること
   - `tests/e2e` と `apps/*/test` にテストコードが生成されている
   - `npx playwright test --list` でシナリオが列挙される（収集が成立している）
   - `npm run test:unit` が「実装未存在」で失敗する（＝ red）
   - `apps/*/src` が変更されていない（`git diff` で確認）
5. **③完了時に確認**すること
   - `npm run test:unit` と `npm run test:e2e` がすべて緑
   - ②のテストファイルに差分が無い（あれば implementation-notes に理由が記録されている）
   - `docs/reviews/review-scope-US-SAMPLE01.json` が生成され、`git diff` の変更ファイルを網羅している（`scope_unlisted_files = 0`）
6. **計測データの確認**
   - `.harness-data/metrics.jsonl` に `variant=proposed` の4行が揃う
   - `.harness-data/reviews.jsonl` の③の行に `scope_*` 列が入り、`review_ms` が実測されている
   - `existing` の行では `scope_source=none` / `scope_*=null` になる（回帰していない）

---

## 実施順序

1. `project.json` に `componentTests` を追加
2. `processes/proposed.json` と `prompts/proposed/*.md` 6本を作成
3. `Invoke-Process.ps1` に `Get-DiffFiles` / `scope_*` 記録 / 警告を追加
4. 手順1〜2で US-SAMPLE01 のパイロットを1本通す
5. パイロットの結果を見てプロンプトを調整（特に②のテストコード品質と③の skip 判定粒度）
6. ドキュメント整合（README / harness README / measurement_indicators / improvement-plan）

---

## 任意拡張（今回のスコープ外・別途判断）

- **カバレッジ実測による skip 判定の裏取り**: `@vitest/coverage-v8` を `main` の雛形に追加し、③で `--coverage` を実行して review-scope の根拠に実測値を添える。skip 判定がAIの自己申告でなくなり指標の信頼性が上がる。
  ただし**雛形の変更は全variantに影響する**ため、本サンプル取得を開始する前に決める必要がある
  （`.harness-data/` には現在パイロットのみで実サンプル未取得のため、**今なら安全に入れられる**）
