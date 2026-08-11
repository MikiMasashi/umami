# 検証ハーネス（土台）

4つのSkill（requirements-analyst / backend-architect / frontend-engineer / test-engineer）を
開発メンバーに見立て、**1つのユーザーストーリーを評価対象プロセス（変種）で実装**するための実行基盤。
現在の実装済み変種: `existing`（既存プロセス）/ `proposed`（提案プロセス）/
`baseline`（ベースライン・プロセス指定なし）。

## 設計方針
- **プロセス変種ごとにスクリプト1本**（`Invoke-Process.ps1`）。工程は「フェーズ」として定義し、
  状態ファイル `.harness/state.json` で進行を管理 → オーケストレーター（人間）の操作は
  「同じコマンドを叩く／PRを見る」に固定され、順序ミスが起きない。
- **各フェーズ = 1回のエージェント実行**（`claude -p` / `copilot -p`）。プロンプトは
  `harness/prompts/<variant>/*.md` に外出しし、モデルは `experiment.json` で固定
  → **指示文の固定化とプロンプト汚染の排除**。
- **実行エージェントは Claude / Copilot を切り替え可能**（`-Agent`）。CLI差分は `Agents.ps1` に
  閉じ込め、**どちらで回しても `metrics.jsonl` の列と定義が完全に一致**する
  → 詳細は [measurement_parity.md](measurement_parity.md)。
- **フェーズ間の文脈はコミット済み成果物ファイルで受け渡す**（セッション継続を使わない）
  → 再現性を最大化。
- **プロジェクト固有情報は `project.json` に外出し**（プロジェクト名・設計書パス・ソースコードパス）
  → プロンプト本体＝プロセスの定義はプロジェクト非依存になり、**別プロジェクトへ適用するときは
  `project.json` を差し替えるだけ**で済む（＝同一プロセスを別プロジェクトで回せる＝検証の外的妥当性）。
- **全工程の区切りごとにレビューゲート**で停止。人間がPRを確認してから次へ。
- **サンプルは git worktree で隔離**（`Start-Sample.ps1`）→ 相互汚染なく10サンプル取得。
- 各フェーズの実行時間・ターン数・ツール呼び出し数・トークン量・コストを
  `.harness/metrics.jsonl` に自動記録 → 成果③（ばらつき検証）の計測土台。
- **人手レビュー時間は GitHub のサーバ打刻で計測**（`-Review` が作るPENDINGレビューの
  `createdAt` → Submit の `submittedAt`）。レビュー対象数・指摘件数と併せて
  `.harness/reviews.jsonl` に1ラウンド1行で記録 → 成果①の計測土台。
- **計測データはメインリポジトリ側の `.harness-data/` へ集約**（worktree ローカルと二重書き）
  → **worktree を消してもデータは残る**。全行が `sample` 列を持つので10サンプルをそのままマージできる。

## ディレクトリ
```
harness/
  project.json                  # プロジェクト固有情報（名前・設計書パス・ソースコードパス）
  experiment.json               # 実験条件（既定エージェント・エージェント別モデル・上限）
  Agents.ps1                    # エージェント差分の吸収層（claude / copilot → 正規化レコード）
  processes/existing.json       # 既存プロセスのフェーズ定義（順序・使用skill・ゲート）
  processes/proposed.json       # 提案プロセスのフェーズ定義（③に reviewScope: true）
  processes/baseline.json       # ベースライン（プロセス指定なし・一括実装）のフェーズ定義
  prompts/existing/*.md         # フェーズごとの固定プロンプト
  prompts/proposed/*.md         # 提案プロセス用の固定プロンプト
  prompts/baseline/*.md         # ベースライン用の固定プロンプト（一括実装1本）
  prompts/verify/*.md           # 計測工程の固定プロンプト（受入検証・全変種共通）
  mcp/playwright.json           # 受入検証だけに渡すMCP定義（Playwright MCP）
  Invoke-Process.ps1            # ステートフル実行 + ゲート停止 + メトリクス収集
  Acceptance.ps1                # 受入条件充足率の計測（done の瞬間に自動実行）
  Export-Results.ps1            # 最終集計（results.csv の生成）
  Start-Sample.ps1              # worktree隔離ラッパ（サンプル開始）
  measurement_indicators.md     # 測定指標一覧（PPT P13〜P16 との対応）
  measurement_parity.md         # エージェント切替時の計測パリティ設計
stories/US-001/
  brief.md                      # 生の要望（人手）
  acceptance-criteria.md        # 受入条件＝充足率の基準（人手・固定）
  injected-defects.md           # 注入欠陥＝欠陥検出率の基準（人手・実装後に仕込む）

<メインリポジトリ>/
  .harness/                     # 実行時状態（そのworktree専用・デバッグ用の控え）
  .harness-data/                # ★全サンプルの計測データ集約先（gitignore・worktreeの寿命から独立）
    metrics.jsonl               #   全サンプルのフェーズ行
    reviews.jsonl               #   全サンプルのレビューラウンド行
    acceptance.jsonl            #   全サンプルの受入検証行（充足数・分母）
    acceptance/<sample>.json    #   受入条件1件ごとの判定（証跡）
    state/<sample>.json         #   各サンプルの state.json スナップショット
    results.csv                 # ★最終成果物（8カラム・発表の散布図用）
    results-detail.csv          #   突合・監査用
    acceptance-details.csv      #   受入条件1件ごとの判定（CSV版）
```

## プロジェクト定義（`project.json`）
プロンプトから「プロジェクト名・設計書パス・ソースコードパス」を切り離したファイル。
実行時に `Invoke-Process.ps1` がプロンプト中のプレースホルダへ差し込む。

```json
{
  "name": "KeihiSeisan",
  "setup": ["npm ci"],
  "docs": {
    "requirements":    "docs/requirements",
    "specifications":  "docs/specifications",
    "specReviews":     "docs/specifications/reviews",
    "implementation":  "docs/implementation",
    "e2e":             "docs/e2e",
    "e2eResults":      "docs/e2e/results",
    "componentTests":  "docs/tests",
    "reviewResponses": "docs/reviews"
  },
  "conventions": {
    "testIdAttribute": "data-testid"
  },
  "source": {
    "impl":           ["apps/api", "apps/web"],
    "unitTests":      ["apps/api/test", "apps/web/test"],
    "componentTests": ["apps/api/test/component", "apps/web/test/component"],
    "e2eTests":       "tests/e2e"
  }
}
```

`setup` は `Start-Sample.ps1` が worktree 内で実行するコマンド列（下記「計測の注意」参照）。
プロンプトへは差し込まれない（トークン化されるのは `docs` と `source` のみ）。

**トークン名の規則**: `<セクション>_<キー>` を SNAKE_UPPER にしたもの。
`docs.specReviews` → `{{DOCS_SPEC_REVIEWS}}` / `source.e2eTests` → `{{SOURCE_E2E_TESTS}}` /
`conventions.testIdAttribute` → `{{CONVENTIONS_TEST_ID_ATTRIBUTE}}` /
トップレベルの `name` のみ `{{PROJECT_NAME}}`。**キーを増やせばトークンも自動で増える**
（スクリプトの変更は不要）。

トークン化されるセクションは `docs` / `source` / `conventions` の3つ。
**`docs` と `source` は必須、`conventions` は任意**（持たない `project.json` でも全フェーズ動く）。
`verify` はトークン化されない（受入検証の起動設定であってプロンプトへ差し込む値ではないため。
`baseUrl` だけはスクリプトが `{{BASE_URL}}` として明示的に渡している）。

| トークン | 値（本リポジトリ） |
|----------|--------------------|
| `{{PROJECT_NAME}}` | KeihiSeisan |
| `{{DOCS_REQUIREMENTS}}` | docs/requirements |
| `{{DOCS_SPECIFICATIONS}}` | docs/specifications |
| `{{DOCS_SPEC_REVIEWS}}` | docs/specifications/reviews |
| `{{DOCS_IMPLEMENTATION}}` | docs/implementation |
| `{{DOCS_E2E}}` / `{{DOCS_E2E_RESULTS}}` | docs/e2e / docs/e2e/results |
| `{{DOCS_COMPONENT_TESTS}}` | docs/tests（提案プロセスのCT設計書・test-readiness の置き場） |
| `{{DOCS_REVIEW_RESPONSES}}` | docs/reviews（`-Revise` の回答ファイルと `review-scope-<STORY>.json` の置き場。スクリプトも同じ値を参照する） |
| `{{SOURCE_IMPL}}` | \`apps/api\` / \`apps/web\` |
| `{{SOURCE_UNIT_TESTS}}` | \`apps/api/test\` / \`apps/web/test\` |
| `{{SOURCE_COMPONENT_TESTS}}` | \`apps/api/test/component\` / \`apps/web/test/component\`（提案プロセスのCT置き場） |
| `{{SOURCE_E2E_TESTS}}` | tests/e2e |
| `{{CONVENTIONS_TEST_ID_ATTRIBUTE}}` | data-testid（提案プロセス②の「テスト容易性の契約」で使うテストID属性。umami のように `data-test` を使うプロジェクトはここを差し替える） |

> `unitTests` は「テストランナーが拾える置き場所」を明示するためのもの。プロジェクトによっては
> `tests/` 配下ではなく実装と併置（例 umami の `src/**/*.test.ts(x)`）で、そこを外すと
> **テストが1件も実行されないまま合格扱いになる**ため、必ず実体に合わせること。

> `componentTests` は**提案プロセス専用**（既存プロセスのプロンプトは参照しない）。
> `unitTests` の**サブディレクトリ**にしてあるので、既存の vitest 設定
> （`apps/web` は `include: ["test/**/*.test.{ts,tsx}"]`、`apps/api` は vitest 既定）のまま収集される。
> **雛形（テストランナー設定）を変更せずに済ませるのが要件**——変更すると全variantに影響し、
> 既存プロセスとの比較基準が動くため。別プロジェクトへ移す際もこの条件を満たすパスにすること。

書き方の注意:
- **配列値**はバッククオート付きで連結される（`` `apps/api` / `apps/web` ``）ので、
  プロンプト側でバッククオートを付けない。**スカラー値**は素の文字列なので、
  プロンプト側で `` `{{DOCS_E2E}}` `` のようにバッククオートで囲む。
- 未定義のトークンがプロンプトに残っていると**実行前に停止**する
  （literal な `{{DOCS_X}}` が成果物に書かれる静かな劣化を防ぐため）。
- レビューコメント（`{{REVIEW_COMMENTS}}`）は自由文のため、この検査の後に差し込まれる。

## 実験条件（`experiment.json`）とエージェント切替

「どのエージェントを・どのモデルで回すか」は**プロジェクト固有値ではなく変種をまたいだ実験条件**なので、
`project.json` とは分けて `experiment.json` に置く。**10サンプル取得中は変更禁止**。

```json
{
  "agent": "claude",
  "agents": {
    "claude":  { "model": "claude-sonnet-4-6", "expectModel": "claude-sonnet-4-6", "maxTurns": null },
    "copilot": { "model": "claude-sonnet-5",   "expectModel": null,                "maxAiCredits": null }
  }
}
```

| キー | 意味 |
|------|------|
| `agent` | 既定の実行エージェント（`claude` / `copilot`）。`-Agent` で上書きできる |
| `agents.<name>.model` | CLI の `--model` へ渡す値。**エイリアスではなく解決済みIDを書く**（下記）。`null` ならエージェント既定に従う |
| `agents.<name>.expectModel` | 実行時に解決されたモデルIDの**期待値**。不一致ならそのフェーズを失敗させる（比較が壊れたまま走り切るのを防ぐ） |
| `agents.claude.maxTurns` / `agents.copilot.maxAiCredits` | 暴走時の上限（任意） |

### モデルの固定

`sonnet` のようなエイリアスは**解決先が日をまたいで変わり得る**。10サンプルを数日かけて取ると
途中でモデル実体が入れ替わり、変種間の比較が静かに壊れる。そのため次の3点セットで扱う。

1. **固定** — `model` に解決済みIDを書く。値は次のコマンドの `system/init` イベントの `model` から取る:
   ```bash
   echo hi | claude -p --output-format stream-json --verbose --model sonnet | head -1
   ```
2. **記録** — 実行時に解決された実体を毎フェーズ `metrics.jsonl` の `model` に残す
   （CLI へ渡した値は `model_requested`）。
3. **検証** — `expectModel` と実体が食い違ったらそのフェーズを**失敗させる**。

`-Model` でコマンドラインから上書きした場合は検証を行わず、`model_overridden=true` を立てて実行する
（意図的な逸脱として記録される）。**この行は本番サンプルの分布に混ぜないこと。**

モデルに加えて、実行時の **CLIバージョン（`agent_version`）と ハーネスのSHA（`harness_commit`）** も
毎行に残る。「モデルは同じなのにCLIが上がって挙動が変わった」「プロンプトを触った」を
後から切り分けられるようにするため。`harness/**` や `.claude/skills/**` に未コミットの改変がある実行は
`harness_dirty=true` になる（＝`harness_commit` が実際に走った内容を指していない印）。

エージェントの指定:
```powershell
# Copilot でサンプルを開始（worktree名・ブランチ名にも copilot が入る）
powershell -File harness/Start-Sample.ps1 -N 1 -Story US-001 -Variant existing -Agent copilot
```

- **エージェントはサンプル開始時に確定**し、`state.json` に保存される。以降のフェーズは同じもので走り、
  途中で `-Agent` を変えようとすると**エラーで停止**する（1サンプルの計測値が2つのエージェントの
  混合になるのを防ぐため）。
- **サンプルIDにエージェント名が入る**（`existing-copilot-1`）。入れないと集計時に同一 variant の
  行を区別できず、「プロセスの差」を測っているつもりで「エージェントの差」を測ってしまう。
- **エージェントをまたいだサンプルを1つの分布に混ぜないこと**。
- 権限モードの対応: `acceptEdits ⇔ --allow-all-tools --deny-tool=shell` /
  `bypassPermissions ⇔ --allow-all`（`-Unattended`）。
- Skill（`.claude/skills/`）は **Copilot も同じディレクトリを探索する**ので共通で使える。

> どの指標がエージェント差の影響を受け、それをどう吸収しているかは
> [measurement_parity.md](measurement_parity.md) に整理してある。

## 計測データの保存先（`.harness-data/`）

`.harness/` は **gitignore かつ worktree ローカル**なので、`git worktree remove` した瞬間に
そのサンプルの計測値が消える。10サンプルを取り切る前に1本でも消せば取り直しになるため、
**メインリポジトリ側の `.harness-data/` へ二重書き**してデータの寿命を worktree から切り離す。

| 出力先 | 用途 |
|--------|------|
| `<worktree>/.harness/metrics.jsonl` `reviews.jsonl` `state.json` | サンプル単体のデバッグ用（従来どおり） |
| `<main>/.harness-data/metrics.jsonl` | **全サンプル追記。worktree を消しても残る** |
| `<main>/.harness-data/reviews.jsonl` | 同上（レビューラウンド） |
| `<main>/.harness-data/acceptance.jsonl` | 受入検証（1サンプル1行。`-Verify` で再実行すると追記され、集計は最新行を採用） |
| `<main>/.harness-data/acceptance/<sample>.json` | 受入条件1件ごとの判定（CSVには数しか入らないため、内訳をここに残す） |
| `<main>/.harness-data/state/<sample>.json` | `state.json` のスナップショット（保存のたび上書き） |
| `<main>/.harness-data/results.csv` ほか | 集計CSV（`done` のたびに**全サンプルから再生成**。追記ではないので二重計上しない） |

- 保存先は `git rev-parse --git-common-dir` から解決する（worktree 内から実行しても
  **メインリポジトリの `.git` を指す**）。`-Status` で実際のパスを確認できる。
- 環境変数 **`HARNESS_DATA_DIR`** を設定すると保存先を差し替えられる（別ドライブへ逃がす場合など）。
- 追記のみなので並列実行でも壊れにくい（短いリトライ付き）。ただし `-Rollback` の
  `rolled_back` タグ付けだけは全文の書き換えになるため、並列実行に踏み切る場合は排他が必要。
- **`-Rollback` は中央側にも同じタグを付ける**（対象は自サンプルの行のみ）。付け忘れると
  本番データ側だけ破棄済みの試行が生き残り、集計が二重計上になる。
- 分析が確定したら `experiments/<story>/metrics.jsonl` としてメインリポジトリへ**コミット**する。
  修了制作の生データはそれ自体が成果物であり、バックアップと監査証跡を兼ねる。

### サンプルID（`sample`）

`story` + `variant` だけでは**同一 variant の10サンプルをマージした行を区別できない**。
そこで `Start-Sample.ps1` が確定した `<variant>-<agent>-<N>`（例 `existing-claude-3`）を
`-Init` 時に `state.json` へ保存し、`metrics.jsonl` / `reviews.jsonl` の**全行**に載せる。

- `Invoke-Process.ps1` を直接 `-Init` した場合はブランチ名 `sample/<story>/<sample>` から導出する。
  それも取れない場合は `null` になり、警告が出る（本番サンプルでは `Start-Sample.ps1` から開始すること）。
- サンプル開始後に `-Sample` で別のIDを渡すと**エラーで停止**する（記録が2つのIDへ割れるため）。
- 本機能の導入前に取った `US-SAMPLE01` のデータは `sample` も `model` も持たない。
  **本番データに混ぜず、パイロットとして別ファイルに退避すること。**

## 計測される項目（`.harness/metrics.jsonl` と `.harness-data/metrics.jsonl`・1フェーズ1行）

**エージェントによらず同じ列・同じ定義**で記録される。主指標はハーネス自身が測り、
エージェントの申告値は `agent_*` / `api_*` に併記して突合用にとどめる。

| 列 | 意味 |
|----|------|
| `agent` / `agent_version` / `model` / `model_requested` / `permission` | 実験条件の来歴（`agent_version` = 実行時のCLIバージョン） |
| `model_overridden` | `-Model` で `experiment.json` を上書きした実行（`true` の行は本番の分布から除外する） |
| `harness_commit` / `harness_dirty` | 実行時の `harness/` + `.claude/skills/` の SHA と、未コミット改変の有無 |
| `duration_ms` | **フェーズ実行時間（主指標）**。ハーネスのストップウォッチ |
| `agent_duration_ms` / `api_duration_ms` | エージェント申告の実行時間・API時間（参考） |
| `num_turns` / `tool_calls` | **LLM往復回数・ツール呼び出し回数**。ストリームイベントから自前計数 |
| `agent_num_turns` | エージェント申告のターン数（参考） |
| `input_tokens` / `total_input_tokens` / `output_tokens` / `cache_read_tokens` / `cache_write_tokens` | トークン量。`input_tokens` は**キャッシュ分を除いた値**に統一（`total_input_tokens` が cache 込みの総量） |
| `cost_native` / `cost_unit` | 課金の生値と単位（Claude=`usd` / Copilot=`aiu`）。**通貨が違うので換算しない** |
| `premium_requests` | Copilot のみ。粒度が粗いのでコスト指標には使わない |
| `is_error` / `session_id` / `ts` / `story` / `variant` / `phase` | 実行の成否・追跡・分類キー |
| `sample` | **サンプルID**（`existing-claude-3`）。同一 variant の10サンプルを区別する集計キー |
| `rolled_back` | `-Rollback` で破棄した試行に付くフラグ（集計時に除外する） |

> **エージェントをまたいでコストを比較するときはトークン量を使う**こと。
> 金額は通貨が違うため直接比較できない（PPT P14 の定義「生成AI利用料＝トークン量×単価」とも一致）。

## 既存プロセスのフェーズ（`-Variant existing`）
要件定義 → IF設計&レビュー → 実装&ユニット&コンポーネントテスト&レビュー → E2E設計&レビュー → E2E実施
（各フェーズ末でゲート停止）

## 提案プロセスのフェーズ（`-Variant proposed`）

| # | id | 名称 | 担当Skill | ゲート |
|---|----|------|-----------|:---:|
| ① | `requirements` | 要件定義 | requirements-analyst | ✅ 標準レビュー |
| ② | `test-design` | E2E/IF/CT設計＆**テストコード作成**＆レビュー | test-engineer（+ backend-architect / frontend-engineer） | ✅ **重点レビュー** |
| ③ | `implementation` | テスト起点実装＆ユニットテスト＆差分レビュー | backend-architect（+ frontend-engineer） | ✅ **差分レビューのみ**（`reviewScope: true`） |
| ④ | `e2e-run` | E2Eテスト実施 | test-engineer | ✅ 結果確認 |

- **phase id を既存プロセスと揃えてある**（`requirements` / `implementation` / `e2e-run`）ので、
  `metrics.jsonl` を工程単位で突き合わせられる。
- **①と④のプロンプトは既存プロセスと見出し以外が一字一句同一**。要件定義とE2E実施を独立変数から外し、
  ②③の差だけが結果に出るようにしている。
- ②では **E2E と CT のテストコードを実装前に書き、`red` であることを確認**して
  `docs/tests/test-readiness-<STORY>.md` に記録させる。ここを省くと、収集すらされないテストが
  ③で「全部緑」に化けて中心仮説の検証が無効になる。
- ②の設計には**テスト容易性の契約**（ルーティング・テストID属性の規約・エラー文言・APIエラー形式）を
  含めるが、**子コンポーネントの分割方針と props 署名は含めない**。内部構造まで固定すると
  ③で「設計どおりに分割したらテストが落ちる」が起き、「②のテストは変更しない」という制約と衝突するため。
  契約は**外から観測できるもの（URL・DOM・HTTP）に限る**。
- ③は**②のテストを変更しない**のが原則。やむを得ず変更した場合は implementation-notes に理由を残し、
  その差分は `review` 扱いにする。
- ③のゲートで**コードレビュー省略率**を記録する（上記「コードレビュー省略率」参照）。

### テストコードの置き分け（提案プロセス）

省略率の分子は「**レビュー済みのテストが担保している変更**」なので、
**レビュー済みテストと未レビューテストがパスで区別できる**必要がある。同じディレクトリに混在すると、
`skip` 判定の裏取りも「②のテストを変更していないこと」の確認もできなくなる。

| 置き場 | 誰が書くか | レビュー状態 | skip の根拠になるか |
|--------|-----------|--------------|:---:|
| `tests/e2e`（`{{SOURCE_E2E_TESTS}}`） | ② | **レビュー済み** | ✅ |
| `apps/*/test/component`（`{{SOURCE_COMPONENT_TESTS}}`） | ② | **レビュー済み** | ✅ |
| `apps/*/test` 直下（`{{SOURCE_UNIT_TESTS}}`） | ③ | 未レビュー | ❌（担保する差分は `review`） |

- ③のプロンプトは `{{SOURCE_COMPONENT_TESTS}}` 配下への**書き込み・追加を禁止**している。
  例外的にCTを足す場合も `{{SOURCE_UNIT_TESTS}}` 直下に置かせる（未レビューのテストであるため）。
  **この禁止はハーネスが実測で検出する**（上記「レビュー済みテストの改変検出」）。
- `unitTests` は**既存プロセスと同じ値のまま**にしてある。ここを `apps/*/test/unit` へ狭めると
  既存プロセスのプロンプトが解決するパスが変わり、**比較基準（既存プロセスは一切変更しない）が崩れる**。
  そのため「`component/` 配下＝②のレビュー済みテスト、それ以外＝③」という一方向の規約にしている。

## ベースラインのフェーズ（`-Variant baseline`）
一括実装（要件のみ入力）の1フェーズのみ。進め方・スキルの使い分けはAIの自律判断に委ね、
**途中ゲートなし**。フェーズ完了時にPRを作成し、**最終成果物のみ人が確認**する
（1フェーズ構成なので、その唯一のゲートが最終ゲートになる。`-Review` → Submit review →
必要なら `-Revise` → `-Continue` で完了、という流れは他の変種と同じ）。
メトリクス（duration / cost / turns）は既存プロセスと同じく `metrics.jsonl` に記録される。

## 使い方

### 前提
- 使うエージェントの CLI が認証済みで動くこと
  - Claude: `claude`（`--print` ヘッドレス実行）
  - Copilot: `copilot`（`copilot login` 済み。非対話実行に対応した版が必要）
- PR連携を使う場合は `gh` が認証済みであること（無くてもフェーズ実行自体は動く）
- `harness/experiment.json` をコミット済みにしておくこと（worktree はコミット済みファイルしか持たない）
- `stories/US-001/` の brief / acceptance-criteria を先に埋めること

### 1サンプルを回す（隔離worktree）
```powershell
# サンプル1を開始（要件定義まで実行してゲート停止・PR作成）
# -Agent を省略すると experiment.json の agent が使われる
powershell -File harness/Start-Sample.ps1 -N 1 -Story US-001 -Variant existing -Agent claude

# （worktree作成後、project.json の setup が自動実行される。飛ばす場合は -SkipSetup）

# 表示されたworktreeに入り、PRをレビューしたら次フェーズへ
cd ..\KeihiSeisan-sample-existing-claude-1
powershell -File harness/Invoke-Process.ps1 -Review     # ← 必ずこれでPRを開く（レビュー時間の開始打刻）
#   …レビュー後、GitHub上で「Submit review」（指摘ゼロでも必ず提出）…
powershell -File harness/Invoke-Process.ps1 -Revise     # ← PRに指摘を残したら反映（何度でも可）
powershell -File harness/Invoke-Process.ps1 -Continue   # ← レビューOKなら次フェーズへ（ゲートごとに繰り返す）
powershell -File harness/Invoke-Process.ps1 -Status     # 進捗確認（計測データの保存先も表示される）
```

> **最後の `-Continue`（＝`done` にする操作）は受入条件充足率の測定まで走る。**
> アプリを起動 → Playwright MCP で受入条件を1件ずつ実機確認 → `acceptance.jsonl` に記録 →
> 集計CSV（`results.csv`）を再生成、までが自動で行われるため**数分かかる**。
> 詳細は「受入条件充足率」「最終集計CSV」を参照。

サンプルを取り終えたら worktree は削除してよい（計測データは `<main>/.harness-data/` に残る）。
```powershell
git worktree remove ..\KeihiSeisan-sample-existing-claude-1 --force
```

### ベースライン条件で1サンプルを回す
```powershell
# 一括実装フェーズを実行 → 完了時にPR作成・最終ゲートで停止（途中ゲートなし）
powershell -File harness/Start-Sample.ps1 -N 1 -Story US-001 -Variant baseline

# 最終成果物のPRを人が確認する（レビュー時間の計測はここだけ）
powershell -File harness/Invoke-Process.ps1 -Review     # 開始打刻 → ブラウザでPRを開く
#   …GitHub上で「Submit review」…
powershell -File harness/Invoke-Process.ps1 -Revise     # ← 指摘があれば反映（何度でも可）
powershell -File harness/Invoke-Process.ps1 -Continue   # ← 最後のラウンドを閉じて reviews.jsonl へ記録・done
```
> baseline は**唯一のゲートが最終フェーズ**。この `-Continue` は次フェーズへ
> 進む操作ではなく「最終レビューを記録して完了させる」操作。叩かないと**比較対象群のレビュー時間だけが
> 丸ごと欠測**するので必ず実行すること（`existing` の最終フェーズ `e2e-run` も同じ）。
テスト実行等を自動許可して無人で流す場合は `-Unattended` を付ける（隔離worktree前提）。

### 計測の注意: 依存インストールはフェーズの外で済ませる
worktree には `node_modules` が無いため、**フェーズを回す前に依存をインストール**する必要がある。
フェーズ実行中にインストールが走ると、その待ち時間が `metrics.jsonl` の `duration_ms`
（＝リードタイム指標）にそのまま混入し、サンプル間のばらつき（成果③）を汚すため。

これは `Start-Sample.ps1` が **`project.json` の `setup` を worktree 内で自動実行**して担保する
（`-SkipSetup` で抑止可）。`setup` は配列で、上から順に実行される。

```json
"setup": ["npm ci"]
```
- `npm install` ではなく **`npm ci`（pnpm なら `pnpm install --frozen-lockfile`）を推奨**。
  lockfile と `package.json` が食い違うと失敗するため、「既存依存のバージョンは変更しない」という
  検証ルールをセットアップ時点で機械的に強制できる。
- 型生成などインストール後の手順が要るプロジェクトは、そのまま配列に足す
  （例: `["pnpm install --frozen-lockfile", "pnpm build-db-client"]`）。
- 失敗した場合は **worktree を残したまま停止**する（原因調査のため自動削除はしない）。
  復旧手順はエラーメッセージに表示される。
- **`harness/project.json` は事前にコミットしておくこと**。worktree はコミット済みファイルしか
  持たないため、未コミットだと worktree 側に存在せずセットアップもフェーズ実行も失敗する。

依存の扱いのルール（既存プロセス／ベースラインで**同一**）:
- **既存依存のバージョン変更は禁止**（lockfile で固定。環境差を排除するため）
- **新規ライブラリの追加は許可**（通常の開発と条件を揃え、依存選定をレビュー対象として残すため）
- 追加した場合は成果物（`implementation-notes-<STORY>.md` / `e2e-<STORY>.md`）に理由を記録させる。
  追加の**有無自体**は lockfile の差分でも判別できるので、集計時は
  「依存追加が起きたサンプル」をフラグとして扱える。

### レビュー（人手レビュー時間の計測）

**PRは必ず `-Review` で開くこと。** GitHub の通知やブラウザの履歴から直接開くと、レビュー時間が
欠測または過小評価になる。

```powershell
powershell -File harness/Invoke-Process.ps1 -Review    # PENDINGレビューを作成 → ブラウザでPRを開く
# …レビューする…
# GitHub上で「Submit review」（自分のPRなので Approve / Request changes は選べない。Comment で提出）
powershell -File harness/Invoke-Process.ps1 -Continue  # または -Revise
```

**なぜこうするのか**: 壁時計時間（ゲート開閉の差分や `-Continue` を叩いた時刻）は
「実験者がいつPCの前に座ったか」であってレビュー時間ではない（実サンプルにはゲートが6日間
開きっぱなしの例がある）。`-Review` は**空のPENDINGレビューをGitHubに作る**ので、その瞬間が
サーバ側で `createdAt` として打刻され、Submit の `submittedAt` と合わせて
**両端がGitHubのサーバ時計**になる。自己申告値ではないので、修了制作の証拠として強い。

- **指摘ゼロでも計測できる**（開始打刻がコメントに依存しないため）。ダミーコメントは書かないこと。
- **読み込み時間が計測に入る**（読み始める前に打刻するため）。`read_ms` として別記される。
- `-Review` は**冪等**。同じラウンドで何度叩いても既存のPENDINGを再利用し、開始打刻を上書きしない。
- **Submit し忘れると `-Continue` / `-Revise` が警告して停止する**（終端が打刻されずラウンドが
  閉じないため）。指摘ゼロの回もこのガードで Submit を強制できる。
- 離席は検知できない。`-Review` の後に中断すると数値が膨らむ。PENDINGは作り直すと下書きが
  消えるため測り直しもできないので、**中断しない**運用と集計時の外れ値チェック（例: 60分超）で対処する。

計測結果は `.harness/reviews.jsonl` と `.harness-data/reviews.jsonl` に
**1レビューラウンド＝1行**で追記される。

| 列 | 意味 |
|----|------|
| `review_ms` | **実レビュー時間（主指標）**。`review_opened_at`（PENDING作成）→ `submitted_at` |
| `read_ms` | 参考: 読み込み時間。`review_opened_at` → `first_comment_at` |
| `write_ms` | 参考: 指摘を書いていた時間（旧定義）。`first_comment_at` → `submitted_at`。感度分析用 |
| `latency_ms` | 参考: 承認ラグ。`gate_opened_at`（ハーネス側・ローカル時刻）→ `submitted_at` |
| `outcome` | `continue`（合格）/ `revise`（差し戻し） |
| `review_time_source` | 開始打刻の由来。`pending-review`（正常）/ `first-comment`（`-Review` 忘れ・過小評価）/ `missing`（欠測＝`review_ms` は `null`） |
| `comments` | 人間の指摘件数。**ハーネスの自動返信（`replyTo` 付き）は除外済み** |
| `diff_files` / `diff_added` / `diff_deleted` | レビュー対象数。フェーズのベースSHA→HEAD の `git diff --numstat` |
| `scope_*` | コードレビュー省略率（提案プロセスのみ）。下記「コードレビュー省略率」参照 |
| `round` | ゲート内のラウンド番号。`-Revise` ごとに 1,2,3… と増える（フェーズが変われば1に戻る） |
| `pr` / `review_id` / `review_state` | 突合用の生値（`review_state` は自分のPRだと常に `COMMENTED`） |
| `story` / `variant` / `sample` / `phase` | 分類キー（`sample` の詳細は「計測データの保存先」参照） |
| `rolled_back` | `-Rollback` で破棄したラウンドに付く（**削除はしない**。集計時に除外する） |

> `outcome` は `review.state` からは決まらない。**GitHub は自分のPRを Approve / Request changes
> できない**ため常に `COMMENTED` になる。実験者が叩いたコマンド（`-Continue` / `-Revise`）で決める。

> 欠測は**必ず `null`** で残す（0分や6日に化けさせない）。`missing` の行は集計から除外し、
> `first-comment` の行は「過小評価」として区別して扱うこと。

> `outcome` に `skip` は使わない。提案プロセスも**レビュー自体は毎ゲート実施する**（省略するのは
> テストで担保できたコード差分だけ）ため、ラウンドの結末は `continue` / `revise` の2値で足りる。
> 省略の度合いは下記 `scope_*` 列が担当する。

### コードレビュー省略率（`scope_*` 列・提案プロセスの主指標）

提案プロセスの実装フェーズは、変更ファイルごとに `skip`（テストで担保済み＝コードを読まない）か
`review`（読む）かを判定した **`docs/reviews/review-scope-<STORY>.json`** を出力する。
ハーネスはこれを読み、**`git diff` の実測値**と突き合わせてレビュー範囲を記録する。

```
コードレビュー省略率 = scope_skipped_added ÷ scope_total_added   （規模ベース・主）
                     = scope_skipped_files ÷ scope_total_files   （対象数ベース・従）
```

| 列 | 意味 |
|----|------|
| `scope_source` | `review-scope`（正常）/ `missing`（JSONが無い・壊れている＝欠測）/ `none`（記録対象外のゲート） |
| `scope_total_files` / `scope_skipped_files` | 対象数ベースの分母・分子 |
| `scope_total_added` / `scope_skipped_added` | **規模ベースの分母・分子（主）** |
| `scope_unlisted_files` | JSONに記載の無い変更ファイル数。**データ品質のシグナル**（0でないラウンドは集計時に要確認） |
| `scope_reviewed_tests_changed` / `scope_reviewed_tests` | ③が**レビュー済みテストに出した差分**の件数とパス一覧。**検証の妥当性のシグナル**（下記） |

設計上の要点:
- **分母は必ず実測の `git diff`**（フェーズのベースSHA→HEAD）。JSONは「どのパスを `skip` とみなすか」の
  参照にしか使わない。**行数をAIに書かせない**のは、分母・分子が自己申告になると指標が壊れるため。
- **JSONに載っていない変更ファイルは保守的に `review` として数える**（列挙漏れで省略率が水増しされない）。
  そのぶん `scope_unlisted_files` として件数を残し、後から品質を判定できるようにしてある。
- **記録するのは `processes/<variant>.json` で `reviewScope: true` を持つフェーズのゲートだけ**。
  他は全列 `null` ＋ `scope_source="none"` になる（`existing` / `baseline` は常に `none`）。
  `review-scope-<STORY>.json` は一度作られると後続フェーズにも残るため、**ファイルの有無ではなく
  フェーズ定義で判定**している（そうしないと④のゲートでも誤って記録される）。
- 分母には docs 等の非コード変更も含まれる（AIが `review` と判定するため省略率は保守的に出る）。
  コードだけに絞りたい場合は JSON の `path` でフィルタできるよう、**全変更ファイルを列挙させている**。
- JSONが無い／未記載ファイルがある場合は**ゲート停止時に警告する**が、**実行は止めない**
  （計測の失敗で実験を止めない方針。`Get-DiffStats` と同じ）。

レビュアーの手順（③のゲート）: まず `review-scope-<STORY>.md` を読んで **`skip` 判定の妥当性を確認**し、
その上で `review` 対象のファイルだけコードを読む。**判定の妥当性確認にかかった時間も `review_ms` に
含まれる**（正直に測る）。判定が不当なら `-Revise` で差し戻す。

### レビュー済みテストの改変検出（`scope_reviewed_tests*`）

省略率が成立する前提は「**③はレビュー済みテストを緑にしただけ**」であること。③がテストの側を
実装に合わせて書き換えていたら、`skip` の根拠は消え**中心仮説の検証そのものが無効**になる。
プロンプトでは禁止しているが、遵守を自己申告に委ねないためハーネスが実測する。

- 対象は `project.json` の **`source.e2eTests` と `source.componentTests` 配下**
  （＝②が書き、人間のレビューを受けたテストの置き場）。`source.unitTests` 直下は③の担当なので対象外。
- フェーズのベースSHA→HEAD の diff に上記配下のファイルが現れたら、**ゲート停止時に警告**し、
  件数とパスを `scope_reviewed_tests_changed` / `scope_reviewed_tests` に記録する。
  変更・削除だけでなく**新規追加も検出**する（未レビューのテストが「レビュー済み」の集合に紛れるため）。
- **停止はしない**（計測の都合で実験を止めない方針）。レビュアーが次を確認して判断する:
  1. implementation-notes に変更理由が記録されているか
  2. アサーションの緩和・削除・`skip` 化になっていないか
  3. 当該差分が review-scope で `review` 扱いになっているか
- 省略率が欠測（`scope_source=missing`）のラウンドでも**この検出は独立に動く**。
- 集計時は `scope_reviewed_tests_changed > 0` のサンプルを「テスト改変が起きた試行」として区別すること。

### レビュー指摘の反映（修正フェーズ）
各ゲート（`awaiting-review`）では、次の2つの経路がある。
- `-Revise` … PR上のレビューコメント（会話・差分インライン・レビュー要約）を収集し、**固定プロンプト
  `prompts/<variant>/99-revise.md`** に注入して直前フェーズと同じ skill で再実行 → 同一PRへ push →
  **各コメントへ自動返信**。状態は `awaiting-review` のまま。**指摘が残る限り何度でも**繰り返せる。
- `-Continue` … レビュー合格として次フェーズへ進む。

**最終フェーズのゲートも同じ**。全フェーズを実行し終えた時点では `awaiting-review` のまま止まり、
`-Continue` で最終ラウンドを閉じたときに初めて `done` になる（＝最終ゲートの指摘も `-Revise` で
反映できる）。`done` になった後は `-Revise` を受け付けない。

前回の出力時刻を `state.json` の `lastRevisedAt` に記録し、それ以降に付いたコメントだけを対象にするため、
同じ指摘の二重対応は起きない。修正の実行も `metrics.jsonl` に `phase="<id>-revise"` で記録され、
**手戻り回数・コスト**（成果①）の指標になる。

#### 指摘への自動回答の仕組み（Skill ⇄ スクリプトの受け渡し）
1. スクリプトが収集したコメントに参照タグ `C1, C2, …` を振り、プロンプトへ注入する。
2. Skill は修正に加えて、回答ファイル **`docs/reviews/response-<story>.json`** を
   `[{ "ref": "C1", "reply": "…" }, …]` 形式で書き出す（参照タグごとの回答文）。
3. スクリプトがそれを読み、`ref` に対応する元コメントへ返信する
   （差分インラインコメントはスレッド返信、それ以外はPR会話コメント）。
   回答ファイルもコミットされるので監査証跡が残る。

回答ファイルが無い／JSONが壊れている場合は返信をスキップするだけで、修正・pushは通常どおり完了する。

> 再現性の注意: 修正フェーズは人間のコメント依存で本質的に再現不能。成果③（ばらつき検証）を回すときは
> `-Revise` を挟まず `-Continue` のみで流すこと。`-Revise` は主に成果①（レビューコスト計測）で用いる。

## 受入条件充足率（`acceptance.jsonl` / 測定指標②の主指標）

全ゲートを閉じて **`done` になる瞬間に自動実行**される計測工程。
`stories/<STORY>/acceptance-criteria.md`（人が事前に定義した基準）に対して、
**完成物が実際に何件満たしているか**を Playwright MCP の実機操作で測る。

```
受入条件充足率 = satisfied ÷ total
   total     = acceptance-criteria.md の AC 件数（ハーネスが自分でパースして数える）
   satisfied = verdict が satisfied だった AC の件数（同上）
```

### なぜ「プロセスの外側」に置くのか

開発フェーズのプロンプトは**全変種で `acceptance-criteria.md` の閲覧を禁止**している
（読ませると「答えを見てテストを書く」ことになり、充足率が実力を測らなくなる）。
この禁止を崩さないため、受入検証は `processes/<variant>.json` のフェーズに**含めず**、
`done` への遷移時に走る別工程として実装してある。したがって:

- 既存プロセス（5工程）・提案プロセス（4工程）の**工程定義は一切変わらない**（比較基準が動かない）
- `metrics.jsonl` には `phase="acceptance-verify"` として記録されるので、
  集計時に**プロセスのリードタイムから除外できる**（計測工程はプロセスの一部ではない）
- MCP（Playwright）も**この工程にだけ**渡す（`--mcp-config` + `--strict-mcp-config`）。
  開発フェーズのツール構成は従来どおりで、独立変数が増えない

### 測り方の設計（省略率と同じ「自己申告を数値にしない」原則）

| 何を | 誰が決めるか |
|------|--------------|
| **分母**（AC 件数） | **ハーネス**が `acceptance-criteria.md` をパースして数える |
| **分子**（充足数） | **ハーネス**が AI の判定JSONを AC ごとに突き合わせて数え直す |
| AC ごとの verdict | AI（Playwright MCP で実機確認した結果） |

- AI が書いた**充足数・充足率は使わない**（プロンプトでも「書くな」と指示している）。
- **判定行が無い AC は充足に数えない**（`unreported`）。列挙漏れで率が水増しされない。
- **AC 一覧に無い ID の判定は無視する**（`extra_reported`）。分子に混ざらない。
- **未知の `verdict` は充足に数えない**（`invalid_verdict`）。
- 判定JSONが無い／壊れている場合は **`rate=null`（欠測）**。0% には化けさせない。
- 検証は**開発チームが書いた E2E の実行結果を根拠にしない**。それを許すと
  「要件を満たしているか」ではなく「自分が書いたテストが通るか」を測ってしまう。

### 検証環境の起動

`project.json` の `verify` セクションに従い、ハーネスがアプリを起動して疎通確認してから
エージェントを呼ぶ（**起動待ちが `duration_ms` に混入しないよう、計測区間の外で行う**）。

```json
"verify": {
  "baseUrl": "http://localhost:3000",
  "setup": ["npm run db:up", "npx -y @playwright/mcp@0.0.79 install-browser chrome-for-testing"],
  "servers": [
    { "name": "api", "command": "npm run dev:api", "url": "http://localhost:4000/health", "timeoutSec": 90 },
    { "name": "web", "command": "npm run dev:web", "url": "http://localhost:3000", "timeoutSec": 180 }
  ]
}
```

- 既に起動しているサーバ（`url` が応答する）は**ハーネスから起動も停止もしない**（手元のdevサーバを殺さない）。
- ハーネスが起動したものは検証後に**プロセスツリーごと**停止する（`npm` の下にぶら下がる node を残さない）。
- `setup` の失敗は**警告して続行**する（Docker 未起動などで計測全体を止めない）。
  サーバが `timeoutSec` 以内に応答しない場合だけ中断する。

### Playwright MCP のブラウザ（つまずきやすい点）

`harness/mcp/playwright.json` は **`--browser chromium` が必須**。省略すると既定が
**実機の Google Chrome** になり、未インストールの環境では
`Chromium distribution 'chrome' is not found` で**全ACが `blocked`** になる（実測で確認済み）。

必要なブラウザ実体は **MCP 自身のバージョンに紐づく**ため、リポジトリの Playwright とは別物。
`npx playwright install chromium`（リポジトリ側 1.48）では**MCP が要求するリビジョンは入らない**ので、
`setup` では **MCP 自身の `install-browser`** を使う。

- **MCP のバージョンは固定する**（`@playwright/mcp@0.0.79`）。`@latest` にすると10サンプル取得中に
  MCP の実体が入れ替わり、モデルをエイリアス指定したときと同じ形で比較が静かに壊れる。
  **`mcp/playwright.json` と `project.json` の `install-browser` は必ず同じバージョンにすること。**
- `install-browser` は「依存を先に入れろ」という Playwright の警告バナーを出すが、**無視してよい**
  （ブラウザのダウンロード自体は成功する）。
- 既定は `--headless`。ブラウザを画面に出して挙動を目視したいときは `mcp/playwright.json` から外す。

### 記録される項目（`acceptance.jsonl`・1サンプル1行）

| 列 | 意味 |
|----|------|
| `total` / `satisfied` | **分母・分子（主指標）**。どちらもハーネスが数えた値 |
| `rate` | **受入条件充足率** = `satisfied / total`。欠測は `null` |
| `not_satisfied` / `blocked` | 未充足 / 判定に到達できなかった件数 |
| `unreported` / `invalid_verdict` / `extra_reported` | データ品質のシグナル（いずれも分子に入らない） |
| `placeholder_criteria` | 「（未記入）」のまま残っている AC 件数。**分母からは外さない**（外すと書き忘れが静かに消えて率が良く見える） |
| `impl_touched` / `impl_touched_files` | 計測工程が `docs/acceptance` 以外を変更した件数とパス。**0 であるべき**（実装を直してから測ると「完成物の充足率」ではなくなる） |
| `source` | `acceptance-result`（正常）/ `missing`（判定JSONが無い・壊れている＝欠測） |

AC 1件ごとの判定（条件文・期待・実際・証跡）は `.harness-data/acceptance/<sample>.json` と
`acceptance-details.csv` に残る。**CSV に入るのは数だけ**なので、報告書で個別の根拠を示すときはこちらを使う。

### 使い方

`done` にする `-Continue` が自動で実行するので、通常は**追加操作は不要**。
失敗した場合（サーバ起動失敗・判定JSONの破損など）だけ次を使う。

```powershell
powershell -File harness/Invoke-Process.ps1 -Verify     # 受入検証をやり直す（done 後のみ）
powershell -File harness/Invoke-Process.ps1 -ExportCsv  # 集計CSVだけ再生成する
```

`-Status` は `done` のサンプルについて充足率（または未測定・欠測）を表示するので、
**worktree を消す前にここで欠測していないか確認**すること。

---

## 最終集計CSV（`Export-Results.ps1`）

発表用の散布図（**横軸=レビュー時間 / 縦軸=受入条件満足割合**、モデル4種×プロセス2種の8点）を
そのまま描ける形にした主成果物。`done` のたびに `.harness-data/` の追記ログから
**まるごと再生成**する（追記ではないので何度実行しても二重計上しない）。

### `results.csv`（8カラム・1サンプル1行）

| 列 | 意味 |
|----|------|
| `model` | 実行時に解決されたモデル実体（`-Model` で上書きした行は混ぜない） |
| `process` | プロセス変種（`existing` / `proposed` / `baseline`） |
| `review_ms_1` 〜 `review_ms_5` | **工程別の人手レビュー時間（ミリ秒）**。`processes/<variant>.json` のフェーズ順 |
| `acceptance_rate` | **受入条件充足率**（0〜1） |

```csv
model,process,review_ms_1,review_ms_2,review_ms_3,review_ms_4,review_ms_5,acceptance_rate
claude-sonnet-5,existing,900000,900000,900000,900000,900000,0.75
claude-sonnet-5,proposed,900000,900000,900000,900000,,0.875
```

- **工程列は既存プロセスの5工程に合わせて5列固定**。提案プロセスは4工程なので
  `review_ms_5` が空欄になる（両プロセスを同じ表に並べられる）。
  列と工程の対応は変種ごとに異なるため、実際の工程IDは `results-detail.csv` の `phase_1..5` で確認する。

  | 列 | existing | proposed |
  |----|----------|----------|
  | `review_ms_1` | requirements | requirements |
  | `review_ms_2` | interface-design | test-design |
  | `review_ms_3` | implementation | implementation |
  | `review_ms_4` | e2e-design | e2e-run |
  | `review_ms_5` | e2e-run | （なし） |

- **工程別レビュー時間は、その工程の全ラウンドの合計**（`-Revise` による2周目以降を含む）。
  「差し戻しを含めて、その工程のレビューに人が何分使ったか」が知りたい値のため。
- `review_ms=null`（`review_time_source=missing`）の**欠測ラウンドは加算しない**（0分として混ぜない）。
  全ラウンドが欠測の工程は空欄になる。欠測ラウンド数は `results-detail.csv` の `missing_rounds_*` を見ること。
- `rolled_back=true` の行は除外。
- 横軸に使う合計レビュー時間は5列の合計（`results-detail.csv` の `review_ms_total` に算出済み）。
  分で見たい場合は 60000 で割る。

### 併せて出力されるもの

| ファイル | 用途 |
|----------|------|
| `results-detail.csv` | 突合・監査用。`sample` / `story` / 工程ID / 欠測ラウンド数 / 受入判定の内訳 / `impl_touched` |
| `acceptance-details.csv` | **受入条件1件ごとの判定**（sample × AC）。報告書で個別の根拠を示すときに使う |

> **同一 (model, process) で複数サンプルを取ると `results.csv` に同じ組み合わせの行が複数並ぶ**
> （8点の散布図なら各組み合わせ1サンプル）。どの行がどのサンプルかは `results-detail.csv` で辿れる。
> n=10 のばらつき検証をするときは `results-detail.csv` 側を集計に使うこと。

### フェーズの巻き戻し（やり直し）
成果物が気に入らないフェーズを**丸ごと破棄してやり直す**には `-Rollback` を使う。
```powershell
powershell -File harness/Invoke-Process.ps1 -Rollback                       # 直近フェーズを破棄してやり直す
powershell -File harness/Invoke-Process.ps1 -Rollback -ToPhase implementation # 指定フェーズまで戻す（id 指定）
powershell -File harness/Invoke-Process.ps1 -Rollback -ToPhase 3             # 番号指定（-Status の 1始まり番号）
```
挙動:
- **対象フェーズ以降のコミットを破棄**（`git reset --hard`）し、`--force-with-lease` でPRを更新する。
  各フェーズ実行直前のHEADを `state.json` の `phaseBases`（id→SHA）に記録しておき、そこへ戻す。
- 状態を「対象フェーズを次に実行する」直前（`awaiting-review`）に戻すので、そのまま
  `-Continue` で対象フェーズから**再実行**できる。
- **先頭フェーズまで戻した場合**はブランチがベースライン雛形と同一になるため、`gh pr close` で
  **PRをclose（実質キャンセル）**してから remote を合わせる。
- 破棄したフェーズの `metrics.jsonl` 行には `rolled_back=true` を付ける（**削除しない**）。
  成果③のばらつき計測を「やり直し込みの追記ログ」として監査可能に保つため。集計時は
  `rolled_back` が付いた行を除外して最終試行だけを数える。
- `-ToPhase` に未実行フェーズや存在しない id を渡すとエラーで停止する（誤操作防止）。

> 制約: この直線モデルでは「対象フェーズまで戻して以降を全破棄」だけをサポートする。途中フェーズ
> だけを残して後続を消す操作は rebase 衝突が多く再現性実験に不向きなため提供しない。
> `phaseBases` は本機能導入後に実行したフェーズにしか無いため、導入前のフェーズは手動で巻き戻すこと。

### 実験者が手で行うステップ（自動化しない）
- **受入条件の定義**（`acceptance-criteria.md`）: 充足率の分母。**フェーズ開始前に確定させること**
  （未記入のまま `done` まで進むと、その AC は分母に残ったまま充足しないので率が不当に下がる）。
- **欠陥注入**（`injected-defects.md`）: 実装フェーズ完了・ゲート停止後、レビュー前に手で仕込む。
- **レビュー判定**: 各ゲートのPRで実施。手順は `-Review` → GitHubで Submit review → `-Continue`/`-Revise`
  の3ステップに固定（レビュー時間・対象数・指摘件数の記録は自動）。
- **受入検証の結果確認**: 充足率の算出自体は自動だが、`impl_touched > 0`（計測工程が実装を触った）や
  `unreported`/`blocked` が多いサンプルは、`acceptance-details.csv` と
  `docs/acceptance/acceptance-result-<STORY>.md` を読んで妥当性を確認すること。

### 無人で一気通貫（ゲート停止を挟まず流したい検証時）
`-Unattended` で `--permission-mode bypassPermissions`（Bash/テスト実行も自動許可）。
隔離worktree内での利用を前提とする。ゲート停止は依然フェーズごとに入るので、
`-Continue` を自動で叩くループは別途用意する（今は手動継続が既定）。

## 拡張ポイント
- **新しいプロセス変種**: `processes/<variant>.json` と `prompts/<variant>/*.md` を追加すれば、同じ
  スクリプトで切り替えられる（`-Variant <variant>`）。フェーズ実行・ゲート・計測はスクリプト改修なしで動く
  （`proposed` もこの仕組みで追加した。追加が必要だったのは省略率の記録だけ）。
- **別プロジェクトへの適用**: `harness/` 一式と `.claude/skills/` をコピーし、`project.json` を
  対象プロジェクトの実体（名前・設計書パス・ソースコードパス）に書き換える。
  `processes/*.json`（フェーズ定義）とプロンプトは**変更しない**のが原則
  ＝同一プロセスであることを担保する。試行例は `修了制作/harness-trials/` を参照。
- **CI化（案D）**: 各フェーズを GitHub Actions のジョブに割り、PR承認をゲートに昇格。
  プロンプトとフェーズ定義はそのまま資産として流用可能。
- **計測強化（案E）**: レビュー時間・レビュー対象数は `reviews.jsonl` として実装済み。
  残りは網羅度・欠陥検出の統合と、`metrics.jsonl` + `reviews.jsonl` を読む集計スクリプト。
