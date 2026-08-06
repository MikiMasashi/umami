# 検証ハーネス（土台）

4つのSkill（requirements-analyst / backend-architect / frontend-engineer / test-engineer）を
開発メンバーに見立て、**1つのユーザーストーリーを評価対象プロセス（変種）で実装**するための実行基盤。
現在の実装済み変種: `existing`（既存プロセス）/ `baseline`（ベースライン・プロセス指定なし）。

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

## ディレクトリ
```
harness/
  project.json                  # プロジェクト固有情報（名前・設計書パス・ソースコードパス）
  experiment.json               # 実験条件（既定エージェント・エージェント別モデル・上限）
  Agents.ps1                    # エージェント差分の吸収層（claude / copilot → 正規化レコード）
  processes/existing.json       # 既存プロセスのフェーズ定義（順序・使用skill・ゲート）
  processes/baseline.json       # ベースライン（プロセス指定なし・一括実装）のフェーズ定義
  prompts/existing/*.md         # フェーズごとの固定プロンプト
  prompts/baseline/*.md         # ベースライン用の固定プロンプト（一括実装1本）
  Invoke-Process.ps1            # ステートフル実行 + ゲート停止 + メトリクス収集
  Start-Sample.ps1              # worktree隔離ラッパ（サンプル開始）
  measurement_indicators.md     # 測定指標一覧（PPT P13〜P16 との対応）
  measurement_parity.md         # エージェント切替時の計測パリティ設計
stories/US-001/
  brief.md                      # 生の要望（人手）
  acceptance-criteria.md        # 受入条件＝網羅度の基準（人手・固定）
  injected-defects.md           # 注入欠陥＝欠陥検出率の基準（人手・実装後に仕込む）
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
    "reviewResponses": "docs/reviews"
  },
  "source": {
    "impl":      ["apps/api", "apps/web"],
    "unitTests": ["apps/api/test", "apps/web/test"],
    "e2eTests":  "tests/e2e"
  }
}
```

`setup` は `Start-Sample.ps1` が worktree 内で実行するコマンド列（下記「計測の注意」参照）。
プロンプトへは差し込まれない（トークン化されるのは `docs` と `source` のみ）。

**トークン名の規則**: `<セクション>_<キー>` を SNAKE_UPPER にしたもの。
`docs.specReviews` → `{{DOCS_SPEC_REVIEWS}}` / `source.e2eTests` → `{{SOURCE_E2E_TESTS}}` /
トップレベルの `name` のみ `{{PROJECT_NAME}}`。**キーを増やせばトークンも自動で増える**
（スクリプトの変更は不要）。

| トークン | 値（本リポジトリ） |
|----------|--------------------|
| `{{PROJECT_NAME}}` | KeihiSeisan |
| `{{DOCS_REQUIREMENTS}}` | docs/requirements |
| `{{DOCS_SPECIFICATIONS}}` | docs/specifications |
| `{{DOCS_SPEC_REVIEWS}}` | docs/specifications/reviews |
| `{{DOCS_IMPLEMENTATION}}` | docs/implementation |
| `{{DOCS_E2E}}` / `{{DOCS_E2E_RESULTS}}` | docs/e2e / docs/e2e/results |
| `{{DOCS_REVIEW_RESPONSES}}` | docs/reviews（`-Revise` の回答ファイル置き場。スクリプトも同じ値を参照する） |
| `{{SOURCE_IMPL}}` | \`apps/api\` / \`apps/web\` |
| `{{SOURCE_UNIT_TESTS}}` | \`apps/api/test\` / \`apps/web/test\` |
| `{{SOURCE_E2E_TESTS}}` | tests/e2e |

> `unitTests` は「テストランナーが拾える置き場所」を明示するためのもの。プロジェクトによっては
> `tests/` 配下ではなく実装と併置（例 umami の `src/**/*.test.ts(x)`）で、そこを外すと
> **テストが1件も実行されないまま合格扱いになる**ため、必ず実体に合わせること。

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
    "claude":  { "model": "sonnet",           "expectModel": null, "maxTurns": null },
    "copilot": { "model": null,               "expectModel": null, "maxAiCredits": null }
  }
}
```

| キー | 意味 |
|------|------|
| `agent` | 既定の実行エージェント（`claude` / `copilot`）。`-Agent` で上書きできる |
| `agents.<name>.model` | CLI の `--model` へ渡す値。`null` ならエージェント既定に従う |
| `agents.<name>.expectModel` | 実行時に解決されたモデルIDの**期待値**。不一致ならそのフェーズを失敗させる（比較が壊れたまま走り切るのを防ぐ） |
| `agents.claude.maxTurns` / `agents.copilot.maxAiCredits` | 暴走時の上限（任意） |

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

## 計測される項目（`.harness/metrics.jsonl`・1フェーズ1行）

**エージェントによらず同じ列・同じ定義**で記録される。主指標はハーネス自身が測り、
エージェントの申告値は `agent_*` / `api_*` に併記して突合用にとどめる。

| 列 | 意味 |
|----|------|
| `agent` / `agent_version` / `model` / `model_requested` / `permission` | 実験条件の来歴 |
| `duration_ms` | **フェーズ実行時間（主指標）**。ハーネスのストップウォッチ |
| `agent_duration_ms` / `api_duration_ms` | エージェント申告の実行時間・API時間（参考） |
| `num_turns` / `tool_calls` | **LLM往復回数・ツール呼び出し回数**。ストリームイベントから自前計数 |
| `agent_num_turns` | エージェント申告のターン数（参考） |
| `input_tokens` / `total_input_tokens` / `output_tokens` / `cache_read_tokens` / `cache_write_tokens` | トークン量。`input_tokens` は**キャッシュ分を除いた値**に統一（`total_input_tokens` が cache 込みの総量） |
| `cost_native` / `cost_unit` | 課金の生値と単位（Claude=`usd` / Copilot=`aiu`）。**通貨が違うので換算しない** |
| `premium_requests` | Copilot のみ。粒度が粗いのでコスト指標には使わない |
| `is_error` / `session_id` / `ts` / `story` / `variant` / `phase` | 実行の成否・追跡・分類キー |
| `rolled_back` | `-Rollback` で破棄した試行に付くフラグ（集計時に除外する） |

> **エージェントをまたいでコストを比較するときはトークン量を使う**こと。
> 金額は通貨が違うため直接比較できない（PPT P14 の定義「生成AI利用料＝トークン量×単価」とも一致）。

## 既存プロセスのフェーズ（`-Variant existing`）
要件定義 → IF設計&レビュー → 実装&ユニット&コンポーネントテスト&レビュー → E2E設計&レビュー → E2E実施
（各フェーズ末でゲート停止）

## ベースラインのフェーズ（`-Variant baseline`）
一括実装（要件のみ入力）の1フェーズのみ。進め方・スキルの使い分けはAIの自律判断に委ね、
**途中ゲートなし**。フェーズ完了時にPRを作成し、**最終成果物のみ人が確認**する
（1フェーズ構成のため実行直後に `done` となり、`-Revise` / `-Continue` は不要）。
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
powershell -File harness/Invoke-Process.ps1 -Revise     # ← PRに指摘を残したら反映（何度でも可）
powershell -File harness/Invoke-Process.ps1 -Continue   # ← レビューOKなら次フェーズへ（ゲートごとに繰り返す）
powershell -File harness/Invoke-Process.ps1 -Status     # 進捗確認
```

### ベースライン条件で1サンプルを回す
```powershell
# 一括実装フェーズを実行 → 完了時にPR作成・done（途中ゲートなし）
powershell -File harness/Start-Sample.ps1 -N 1 -Story US-001 -Variant baseline

# 最終成果物のPRを人が確認する（レビュー時間の計測はここだけ）
```
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

### レビュー指摘の反映（修正フェーズ）
各ゲート（`awaiting-review`）では、次の2つの経路がある。
- `-Revise` … PR上のレビューコメント（会話・差分インライン・レビュー要約）を収集し、**固定プロンプト
  `prompts/<variant>/99-revise.md`** に注入して直前フェーズと同じ skill で再実行 → 同一PRへ push →
  **各コメントへ自動返信**。状態は `awaiting-review` のまま。**指摘が残る限り何度でも**繰り返せる。
- `-Continue` … レビュー合格として次フェーズへ進む。

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
- **受入条件の定義**（`acceptance-criteria.md`）: 網羅度の基準。フェーズ開始前に確定。
- **欠陥注入**（`injected-defects.md`）: 実装フェーズ完了・ゲート停止後、レビュー前に手で仕込む。
- **レビュー判定と時間計測**: 各ゲートのPRで実施。レビュー時間・対象数を記録（成果①）。

### 無人で一気通貫（ゲート停止を挟まず流したい検証時）
`-Unattended` で `--permission-mode bypassPermissions`（Bash/テスト実行も自動許可）。
隔離worktree内での利用を前提とする。ゲート停止は依然フェーズごとに入るので、
`-Continue` を自動で叩くループは別途用意する（今は手動継続が既定）。

## 拡張ポイント
- **提案プロセス**: `processes/proposed.json` と `prompts/proposed/*.md` を追加すれば、同じ
  スクリプトで変種を切り替えられる（`-Variant proposed`）。
- **別プロジェクトへの適用**: `harness/` 一式と `.claude/skills/` をコピーし、`project.json` を
  対象プロジェクトの実体（名前・設計書パス・ソースコードパス）に書き換える。
  `processes/*.json`（フェーズ定義）とプロンプトは**変更しない**のが原則
  ＝同一プロセスであることを担保する。試行例は `修了制作/harness-trials/` を参照。
- **CI化（案D）**: 各フェーズを GitHub Actions のジョブに割り、PR承認をゲートに昇格。
  プロンプトとフェーズ定義はそのまま資産として流用可能。
- **計測強化（案E）**: `metrics.jsonl` にレビュー時間・網羅度・欠陥検出を統合し集計。
