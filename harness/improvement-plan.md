# ハーネス改善計画（実装ハンドオフ用）

このドキュメントは **別セッション／別担当がこれ単体で作業を開始できる**ことを目的とした引き継ぎ資料です。
2026-08-05 時点のリポジトリ（`main` = `af30b1f`）を調査した結果に基づきます。

- 対象リポジトリ: `KeihiSeisan`（修了制作 / 生成AI活用による開発プロセス検証）
- 関連ドキュメント: [README.md](../README.md) / [BASELINE.md](../BASELINE.md) / [harness/README.md](README.md) / [harness/measurement_indicators.md](measurement_indicators.md)

---

---

## 1. 改善点一覧（30件・優先度付き）

優先度の判断軸は **「本番10サンプルを回し始めた後では取り返しがつかないか」**。
データの取り直しが最も高コストなため、それを最優先とした。

### A. 検証設計の妥当性

| # | 改善点 | 根拠 | 優先 |
|---|--------|------|:---:|
| 1 | 提案プロセス（`processes/proposed.json` + `prompts/proposed/*.md`）が未実装。検証の核である「コードレビュー省略率」が測定不能 | `harness/processes/` に existing/baseline のみ | **P0** |
| 2 | US-001 の `brief.md` / `acceptance-criteria.md` が未記入。実験開始のブロッカー（AC は全品質指標の分母） | `stories/US-001/` | **P0** |
| 3 | モデルが `sonnet` エイリアス指定。10サンプルを日をまたいで取るとモデル実体が変わり得て比較が壊れる | `Invoke-Process.ps1:46` | **P0** |
| 4 | AC 閲覧禁止がプロンプトの善意頼み。フック等で機械的に遮断しないと「汚染していないこと」を証明できない | 各プロンプトの制約節 | P1 |
| 5 | Skill が headless で使えない `AskUserQuestion` の使用を指示（`claude -p` で停止・無駄ターンの原因） | `.claude/skills/requirements-analyst/SKILL.md` ほか | P1 |
| 6 | `injected-defects.md` が残存する一方、指標設計では「仕込み欠陥検出率は不採用」と決定済み＝設計と資産の不整合 | `measurement_indicators.md:118` | P1 |
| 7 | `-Revise`（人のレビュー）が再現不能なのに、レビュー観点・レビュアー・指摘粒度の標準化プロトコルが未定義 | `harness/README.md` 再現性の注意 | P1 |
| 8 | existing（5ゲート）と baseline（ゲートなし）はレビュー条件が非対称。「同条件」の定義が未文書化 | `processes/*.json` | P2 |
| 9 | n=10 の統計処理方法（検定手法・有意水準・外れ値の扱い）が未定義 | `measurement_indicators.md` ② | P2 |
| 10 | 集計時の除外ルール（`rolled_back` / `is_error` 行）が文章のみでコード化されていない | 実データに `is_error=true` が2件 | P2 |

### B. 計測（主指標の自動化）

| # | 改善点 | 根拠 | 優先 |
|---|--------|------|:---:|
| 11 | 人手レビュー時間が未計測（ゲート提示時刻／`-Continue` 時刻の打刻なし）。①③の主指標のブロッカー | `Invoke-Process.ps1` ゲート処理 | **P0** |
| 12 | 集計スクリプトが1本も無い。総リードタイム・SD/CV・一発通過率が算出できない | `measurement_indicators.md:109` | **P0** |
| 13 | メトリクスの中央集約が無い。`.harness/` は gitignore かつ worktree ローカルで、worktree 削除＝データ消失 | `.gitignore` / `Start-Sample.ps1` | **P0** |
| 14 | トークン量（input/output/cache）を記録していない。`result` イベントの `usage` を拾うだけ | `Invoke-Process.ps1:229` | P1 |
| 15 | レビュー対象数（PR diff の行数・ファイル数）をフェーズ毎に記録していない | 同上 | P1 |
| 16 | レビュー指摘件数を捨てている（`-Revise` が gh から収集済みなのに未記録） | `Get-ReviewComments` | P1 |
| 17 | E2E 結果が機械可読でない（reporter が html のみ）。受入条件充足率の自動算出に json/junit が必要 | `playwright.config.ts` | P1 |
| 18 | 回帰（pass-to-pass）テスト合格率の収集が無い | — | P2 |
| 19 | Lint/静的解析が存在しない（`next lint` は eslint 未導入で実質動かない） | `apps/web/package.json` | P2 |
| 20 | Mutation Score の基盤なし。**費用対効果が悪く今回のスコープでは切って良い** | `measurement_indicators.md` ② | P3 |

### C. ハーネスの堅牢性・運用

| # | 改善点 | 根拠 | 優先 |
|---|--------|------|:---:|
| 21 | 並列サンプル実行で静かな汚染。ポート固定＋`reuseExistingServer: true` で**別サンプルのサーバに繋がったまま E2E がグリーンになる** | `playwright.config.ts` | **P1** |
| 22 | MongoDB が全サンプル共有・DB名 `keihi` 固定。E2E の独立性が無い | `apps/api/src/config.ts` / `docker-compose.yml` | **P1** |
| 23 | フェーズのタイムアウト／リトライ方針が無い（実データで29分・$0.89 を浪費） | `metrics.jsonl` 3行目 | P1 |
| 24 | `-Unattended` でもゲートで止まるため、10サンプル×複数変種を全て手動継続する必要がある | `harness/README.md` | P1 |
| 25 | プロンプトは「コミットせよ」と指示、スクリプトも `Ensure-Commit` でコミット。acceptEdits では AI が git を叩けず矛盾 | 各プロンプト末尾 | P2 |
| 26 | 状態機械の穴（`-Rollback` 後の `-Revise` で対象フェーズがずれる／`phaseBases` に `requirements` が無い実サンプルあり） | `state.json` 実データ | P2 |
| 27 | Skill が `.claude/` と `.agents/` に完全二重管理（内容一致）。ドリフトの温床 | 両ディレクトリ | P2 |
| 28 | `Run-Claude` の未使用変数、`--max-turns` 未設定（暴走時のコスト上限なし） | `Invoke-Process.ps1:199` | P3 |

### D. ベースライン雛形（全サンプル共通＝バグは全サンプルに効く）

| # | 改善点 | 根拠 | 優先 |
|---|--------|------|:---:|
| 29 | `/health` が DB 断でも `ok` を返し、API も DB 接続失敗のまま起動継続。「壊れているのに E2E がグリーン」を全サンプルに配る交絡要因 | `apps/api/src/index.ts` / `app.ts` | **P1** |
| 30 | `.env.example` があるのに `.env` を読む仕組みが無い／`.nvmrc=24` と `engines: >=20`・README「Node 20+」の不一致／docker-compose に healthcheck なし／CI なし | 複数 | P2 |

> **ドキュメント不整合（別途）**: README の成果①②③（レビュー時間30%削減・網羅度・欠陥検出率）と
> `measurement_indicators.md` の指標体系（効率／品質／自動化率、網羅度・仕込み欠陥は**不採用**）が食い違っている。
> 発表資料の整合上、README 側の更新が必要。

---

## 2. 今回の作業スコープ：#3 / #11 / #13

上記のうち **「本番サンプルを1本でも回す前に閉じないと取り返しがつかない」3件**を実装する。
いずれも `Invoke-Process.ps1` の記録まわりに閉じており、1パスで入れられる。

### 実装順（依存関係あり）

```
1. #3  experiment.json + モデル/CLI/harness-SHA の記録・検証      … 単独・30分
2. #13 sample フィールド追加 → 中央データディレクトリへ二重書き   … #3 と同じ metric 行を触るので直後に
3. #11 レビュー時間の取得（GitHub API）+ reviews.jsonl            … 出力先は #13 のものを使う
```

想定工数: まとめて半日程度。いずれも既存動作を壊さない追加寄りの変更。

> **スコープ外（今回は対応しない）**: #21（ポート固定・`reuseExistingServer`）と #22（MongoDB 共有）は
> 課題としては残すが、本ドキュメントでの対応対象から外している。サンプルを逐次実行する限りは
> 顕在化しないため。並列実行に踏み切る場合は先に着手すること。

---

## 3. #3 モデル固定 — 「固定する」だけでなく「実際に使われた値を記録する」

### ねらい

エイリアス指定をやめるだけでは不十分。日付付きIDでも将来の挙動は保証されないため、
**固定 → 実行時の解決値を記録 → 期待値と不一致なら停止** の3点セットにする。
発表時に「全サンプル同一モデル」を証拠付きで主張できるようになるのが本質。

### 3-1. 実験条件を1ファイルに外出し

`project.json` は**プロジェクト固有値**（設計書パス等）なので混ぜない。モデルは変種をまたいで共通の**実験条件**。

新規作成 `harness/experiment.json`:

```json
{
  "model": "<解決済みモデルID>",
  "maxTurns": 200,
  "note": "10サンプル取得中は変更禁止。変更したらサンプル取得をやり直すこと"
}
```

`<解決済みモデルID>` は次のコマンドを1回実行し、`system/init` イベントの `model` フィールドから取得する:

```bash
echo hi | claude -p --output-format stream-json --verbose --model sonnet | head -1
```

### 3-2. 実行時の実体を毎フェーズ記録・検証

`Invoke-Process.ps1` の `Run-Claude`（現 197行目付近）のイベント処理に追加:

```powershell
switch ($evt.type) {
  'system' { if ($evt.subtype -eq 'init') { $actualModel = $evt.model } }   # ← 追加
  'assistant' { ... 既存 ... }
  'result'    { $result = $evt }
}
```

ループ後、メトリクス記録の前に検証:

```powershell
# 気づかず走り切るのが最悪。不一致はそのフェーズを失敗させる。
if ($actualModel -and $ExpectedModel -and $actualModel -ne $ExpectedModel) {
  throw "モデル不一致: 期待=$ExpectedModel 実際=$actualModel  実験条件が変わっています。"
}
```

### 3-3. メトリクス行に来歴を残す

`$metric`（現 229行目付近）へ追加:

```powershell
model          = $actualModel
cli_version    = $script:CliVersion       # 起動時に `claude --version` を1回取得してキャッシュ
harness_commit = $script:HarnessCommit    # git log -1 --format=%H -- harness/ .claude/skills
```

> CLIバージョンとプロンプト（harness）のSHAも残す。「モデルは同じだがCLIが上がって挙動が変わった」を
> 後から切り分けられることは、この実験では価値が高い。

### 3-4. パラメータの扱い

既存の `-Model` パラメータは残してよいが、**既定値は `experiment.json` から読む**。
コマンドラインで上書きされた場合は metrics に `model_overridden=true` を立てる。
`Start-Sample.ps1` の `-Model "sonnet"` 既定値も同様に `experiment.json` 参照へ変更する。

### 完了条件

- [ ] `harness/experiment.json` が存在し、`model` に日付付き（または解決済み）IDが入っている
- [ ] 1フェーズ実行後、`metrics.jsonl` の行に `model` / `cli_version` / `harness_commit` が入る
- [ ] `experiment.json` の `model` をわざと別値にすると、フェーズが実行直後に停止する

---

## 4. #11 レビュー時間 — GitHub の「Start a review」から取得する

### ねらいと設計根拠

**壁時計時間はレビュー時間ではない。** 実サンプルの `state.json` では `interface-design` のゲートが
**6日間**開いている。ゲート開閉の差分や `-Continue` の実行時刻を終端に使うと、指標が
「実験者がいつPCの前に座ったか」になってしまう。

一方、**GitHub の「Start a review」〜「Submit review」はサーバ側で打刻されており、両端が取得できる**。
実データ（PR #3 / review id `4660529312`）で検証済み:

| 時刻 (UTC) | 出来事 | API 上の表現 |
|---|---|---|
| 06:47:18 | 「Start a review」で1件目の下書き作成 ← **開始** | `pulls/{n}/comments[].created_at` の最小値 |
| 06:49:54 | 2件目の下書き | 〃 |
| 06:51:17 | 3件目 | 〃 |
| 06:51:32 | 4件目 | 〃 |
| 06:51:49 | Submit review ← **終了** | `pulls/{n}/reviews[].submitted_at` |

→ **実レビュー時間 = 4分31秒**。

**決定的な確認事項**: 下書きコメントの `created_at`（06:47:18）が review の `submitted_at`（06:51:49）
より前になっている。つまり **Submit 後も下書きの作成時刻は書き換わらず保持される**ため、
「Start a review を押した瞬間」が事実上そのまま取得できる。

この方式の利点は、**`review_ms` の両端が同一の GitHub サーバ時計**になること。
ローカルPCの時刻にも、実験者がコマンドを叩いた時刻にも依存しない
＝自己申告値ではなく**第三者記録**になり、修了制作の証拠としての強度が上がる。

> `-ReviewStart` のような打刻コマンドは**不要**。ラベル運用も不要。実験者には GitHub の
> 自然なレビュー操作以外に何も課さない。

### 4-1. 実験者の運用規約（2つだけ）

1. **PRを開いたら、まず「Start a review」で1件書く**（指摘が無くても「レビュー開始」等でよい）
   - これが開始打刻になる。**最初のコメントを書くまでの読み時間は計測外**（過小評価方向のバイアス）なので、
     読み込む前に1件目を置くことでこれを最小化する。
2. **終わったら必ず「Submit review」**（Approve / Request changes）
   - Approve → `-Continue` / Request changes → `-Revise` に対応する。

この運用は `harness/README.md` と `README.md` の手順にも追記すること（守られないと欠測になる）。

### 4-2. 取得方法（gh 2コール）

```bash
gh api "repos/{owner}/{repo}/pulls/<PR>/reviews"    # id, state, submitted_at
gh api "repos/{owner}/{repo}/pulls/<PR>/comments"   # pull_request_review_id, created_at, in_reply_to_id
```

コメントを `pull_request_review_id` でグルーピングし、レビュー単位で次を組み立てる。

| 項目 | 求め方 |
|---|---|
| `review_started_at` | そのレビューに属するコメントの **`min(created_at)`** |
| `ended_at` | `review.submitted_at` |
| `outcome` | `review.state`（`APPROVED`→`continue` / `CHANGES_REQUESTED`→`revise`） |
| `comments` | そのレビューのコメントのうち **`in_reply_to_id` が null のものだけ** |

#### ⚠️ 自動返信の除外は必須

PR #3 の 06:53:32〜36 に並ぶ4件の `COMMENTED` レビューは、すべて `in_reply_to_id` が付いており、
`metrics.jsonl` の `requirements-revise`（`2026-07-09T15:53:27+09:00` = `06:53:27Z`）と時刻が一致する。
**ハーネスの `Publish-CommentReplies` が投稿した自動返信**である。

→ **`in_reply_to_id != null` のコメント、およびそれだけで構成されるレビューは人間のレビューから除外する。**
除外しないとレビュー件数も時刻も汚染される。

### 4-3. 記録先: `reviews.jsonl`（1レビューラウンド = 1行）

**#15（レビュー対象数）をここに相乗りさせる。** 追加コストがほぼゼロで、
成果①の指標がこのファイル1本で揃うため、#11 と同時に実装すること。

```json
{"ts":"…","story":"US-001","variant":"existing","sample":"existing-3","phase":"implementation",
 "round":1,
 "pr":3,"review_id":4660529312,
 "gate_opened_at":"…","review_started_at":"2026-07-09T06:47:18Z","ended_at":"2026-07-09T06:51:49Z",
 "review_ms":271000,
 "latency_ms":518400000,
 "outcome":"revise",
 "review_time_source":"measured",
 "comments":4,
 "diff_files":7,"diff_added":210,"diff_deleted":12}
```

| フィールド | 意味 |
|---|---|
| `review_ms` | **実レビュー時間（主指標）**。`review_started_at` → `ended_at`（両端とも GitHub サーバ時刻） |
| `latency_ms` | 承認ラグ（参考値）。`gate_opened_at`（ハーネス側）→ `ended_at` |
| `outcome` | `review.state` から自動判定 |
| `review_time_source` | `measured`（下書きあり＝開始時刻取得済み） / `missing`（下書き無しの Approve のみ） |
| `comments` | 人間の指摘件数（自動返信を除外済み） |
| `diff_*` | `git diff --numstat <phaseBase> HEAD` の集計（#15） |

### 4-4. スクリプトの変更点

1. **ゲート停止時**（`Invoke-Process.ps1` の `if ($phase.gate)` 直後、現 544行目付近）
   - `gateOpenedAt` を state へ記録
   - `git diff --numstat <phaseBases[phase.id]> HEAD` で diff 規模を控えて state へ保持
2. **`Get-ReviewSessions` を新設**（既存 `Get-ReviewComments` と同じデータ源なので統合してよい）
   - 上記 4-2 の2コールを叩き、レビュー単位のセッション配列を返す
   - `lastRevisedAt` 以降のレビューのみを対象にする（既存のフィルタ方針を踏襲）
3. **`-Continue` / `-Revise` の冒頭**
   - 対象ラウンドのセッションを確定して `reviews.jsonl` へ追記
   - `-Revise` の場合は push 完了後に**次ラウンドを開始**（`gateOpenedAt` を再打刻・`round` をインクリメント）
4. **PENDING レビュー残存のガード（重要）**
   - Submit し忘れると `state:"PENDING"` のまま残り、`submitted_at` が `null` になってラウンドが閉じない
     （**PR #2 に実例あり**: 下書き2件が 03:17:55 / 03:18:47 で未提出のまま）
   - `-Continue` / `-Revise` の実行時に PENDING レビューが残っていたら **警告して停止**する
   - PENDING レビューは本人のトークンでのみ API から見える（`pulls/{n}/reviews` に現れる）
5. **欠測の扱い**
   - 下書きを1件も作らず Approve のみだった場合は `review_ms=null` / `review_time_source="missing"`
   - **欠測を「0分」や「6日」に化けさせないこと**（集計時に判別できる形で残す）

### 4-5. 注意点

- **タイムゾーン**: GitHub は UTC（`…Z`）、ハーネスのローカル打刻は `+09:00` 付き。
  減算前に必ず `ToUniversalTime()` で正規化する。
- **離席は検知できない**。「Start a review」後に中断すると数値が膨らむ。
  運用規約（中断しない）＋集計側の外れ値閾値（例: 60分超はフラグ）で対処する。
- `-Rollback` で破棄したラウンドは `metrics.jsonl` と同様に **`rolled_back=true` を付けて残す**（削除しない）。
- `-Revise` は `phaseIndex - 1` を対象フェーズとしている（現 436行目付近）。`-Rollback` 直後は
  この前提が崩れる（#26）。今回のスコープ外だが、ラウンド記録の `phase` が誤らないよう
  最低限のガード（`-Rollback` 直後は `-Revise` を拒否する等）を入れておくと安全。
- パイロット PR #3 からは実レビュー時間 4分31秒 が遡って復元できるが、**条件が異なるため参考値**とし、
  本番データには混ぜないこと。

### 完了条件

- [ ] 「Start a review」→ コメント追記 → 「Submit review」の一連で `reviews.jsonl` に1行出る
- [ ] `review_started_at` が最初の下書きの `created_at`、`ended_at` が `submitted_at` と一致する
- [ ] `-Revise` を2回挟むと `round` が 1,2,3 と増え、`outcome` が `revise,revise,continue` になる
- [ ] ハーネスの自動返信（`in_reply_to_id` 付き）が `comments` に混入していない
- [ ] PENDING レビューを残したまま `-Continue` すると警告して停止する
- [ ] 下書き無しの Approve のみの場合に `review_time_source="missing"` となり、値が捏造されない
- [ ] `diff_files` / `diff_added` / `diff_deleted` が実値で入る

---

## 5. #13 メトリクス中央集約 — その前に「サンプルIDが無い」問題を先に潰す

### 5-1. `sample` フィールドの追加（必須・これが先）

現状の metrics 行は `story` + `variant` しか持たない。**同一 variant の10サンプルをマージすると行を区別できない。**

- `Start-Sample.ps1` は `-N` を知っているので、`-Init` へ `-Sample "$Variant-$N"` と `-SampleIndex $N` を渡す
- `Invoke-Process.ps1` は `-Init` 時に state.json へ `sample` / `sampleIndex` を保存
- フォールバック: ブランチ名 `sample/US-001/existing-3` から `existing-3` を導出
- `metrics.jsonl` / `reviews.jsonl` の全行に `sample` を含める

### 5-2. 保存先を worktree の外へ

worktree 内から実行しても**メインリポジトリの .git を指す** `--git-common-dir` を使うのが確実:

```powershell
# worktree 内で実行しても、メインリポジトリ側の固定パスに解決される
$common  = (git rev-parse --path-format=absolute --git-common-dir).Trim()
$DataDir = if ($env:HARNESS_DATA_DIR) { $env:HARNESS_DATA_DIR }
           else { Join-Path (Split-Path $common -Parent) ".harness-data" }
```

**書き込みは二重化**する:

| 出力先 | 用途 |
|---|---|
| `<worktree>/.harness/metrics.jsonl`（従来どおり） | サンプル単体のデバッグ用 |
| `<main>/.harness-data/metrics.jsonl` | **全サンプル追記。worktree を消しても残る** |
| `<main>/.harness-data/reviews.jsonl` | 同上（#11 の出力） |
| `<main>/.harness-data/state/<sample>.json` | state.json のスナップショット（フェーズ完了ごとに上書きコピー） |

追記のみなので並列実行でも壊れにくいが、念のため `[System.IO.File]::AppendAllText` を
短いリトライ（3回・100ms）で包んでおくと安全。

### 5-3. 最終的に git へ入れる

`.harness-data/` は `.gitignore` に追加してそのままにし、分析確定時に集約結果を
`experiments/US-001/metrics.jsonl` としてメインリポジトリへ**コミット**する。
修了制作の生データはそれ自体が成果物であり、バックアップと監査証跡を兼ねる。

### 5-4. 注意点

- 既存 `US-SAMPLE01` のデータは改修前のもの（`sample` も `model` も無い）。
  **本番データに混ぜず、パイロットとして別ファイルに退避**する。
- `.gitignore` に `.harness-data/` を追加すること（現在は `.harness/` のみ）。

### 完了条件

- [ ] `metrics.jsonl` / `reviews.jsonl` の全行に `sample` が入る
- [ ] worktree を `git worktree remove` してもメインリポジトリ側にデータが残っている
- [ ] 2サンプルを回すと中央ファイルに両方の行が追記され、`sample` で区別できる

---

## 6. 作業の進め方（推奨）

### ブランチ

`main` は**全サンプルの分岐元となるベースライン雛形**なので、改修は必ず作業ブランチを切り、
PR で確認してから `main` へ入れること。`main` を直接触ると、既存 worktree との差分が読みにくくなる。

### 動作確認（最小スモーク）

1. `harness/experiment.json` を作成し、`git commit`（**worktree はコミット済みファイルしか持たない**ため必須）
2. 使い捨てサンプルで一周:
   ```powershell
   powershell -File harness/Start-Sample.ps1 -N 9 -Story US-SAMPLE01 -Variant baseline
   ```
3. 確認:
   - `<main>/.harness-data/metrics.jsonl` に `sample` / `model` / `cli_version` を含む行が出る
   - ゲートのPRで「Start a review」→ コメント1件 → 「Submit review」してから `-Continue` し、
     `reviews.jsonl` に `review_ms` を含む行が出る
   - `git worktree remove` してもデータが残る
4. 後片付け: `git worktree remove ../KeihiSeisan-sample-baseline-9 --force`

### この作業の後にやること（次スコープ）

優先順に #12（集計スクリプト）→ #29（/health の DB 判定）→ #2（US-001 の brief/AC 記入）→ #1（提案プロセス実装）。
特に **#2 と #1 は本実験の本体**であり、本ドキュメントの3件を閉じた直後に着手するのが望ましい。
なお #21 / #22（ポート・DB隔離）は今回スコープ外だが、**サンプルを並列実行する運用に変える場合は
それより前に着手すること**（並列時は他サンプルのサーバに繋がったまま E2E がグリーンになり得る）。

---

## 付録: 主要ファイルの現状（調査時点）

| ファイル | 役割 | 今回触るか |
|---|---|:---:|
| `harness/Invoke-Process.ps1` | フェーズ実行・ゲート・メトリクス記録・巻き戻し（563行） | ○（#3 #11 #13） |
| `harness/Start-Sample.ps1` | worktree 隔離とセットアップ（107行） | ○（#3 #13） |
| `harness/experiment.json` | **新規**。実験条件（モデル等） | ○（#3） |
| `harness/project.json` | プロジェクト固有値（名前・設計書パス・ソースパス） | ×（実験条件は experiment.json へ分離） |
| `harness/processes/{existing,baseline}.json` | フェーズ定義 | × |
| `harness/prompts/**` | フェーズごとの固定プロンプト | × |
| `README.md` / `harness/README.md` | 手順書 | ○（#11 のレビュー運用規約を追記） |
| `playwright.config.ts` | E2E 起動設定 | ×（#21/#22 はスコープ外） |
| `.gitignore` | `.harness/` を除外中 | ○（`.harness-data/` 追加） |
