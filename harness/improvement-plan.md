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
3. #11 レビュー時間（`-Review` 新設 + GitHub API）+ reviews.jsonl … 出力先は #13 のものを使う
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

**実装時の差分**: `cli_version` は**新設せず既存の `agent_version` を使う**（`system/init` の
`claude_code_version` / Copilot の OTel `gen_ai.agent.version` から既に取得済みで、
エージェント非依存の同一列になっているため）。あわせて `harness_dirty` を追加した
（`harness/**` や `.claude/skills/**` に未コミット改変があると `harness_commit` が
実際に走った内容を指さないため、判別できるようにする）。

### 3-4. パラメータの扱い

既存の `-Model` パラメータは残してよいが、**既定値は `experiment.json` から読む**。
コマンドラインで上書きされた場合は metrics に `model_overridden=true` を立てる。
`Start-Sample.ps1` の `-Model "sonnet"` 既定値も同様に `experiment.json` 参照へ変更する。

**実装時の差分**: `-Model` で上書きした場合は `expectModel` の一致検証を**行わない**
（明示的な上書き＝承知のうえの逸脱であり、そこで停止させても得るものが無い）。
代わりに実行前に警告を出し、`model_overridden=true` を残して集計時に除外できるようにする。

### 完了条件

- [x] `harness/experiment.json` が存在し、`model` に日付付き（または解決済み）IDが入っている
      （`claude-sonnet-4-6` … 2026-08-10 時点で CLI 2.1.143 のエイリアス `sonnet` の解決先）
- [ ] 1フェーズ実行後、`metrics.jsonl` の行に `model` / `agent_version` / `harness_commit` が入る
- [ ] `experiment.json` の `expectModel` をわざと別値にすると、フェーズ終了直後に停止する
      （このとき metrics 行は**記録されてから**停止する＝どのモデルで走ったかが残る）

> 残り2件は実フェーズを1回走らせないと確認できない（未実施）。

---

## 4. #11 レビュー時間 — PENDING レビューを先に作って両端をサーバ打刻する

### 4-0. ねらいと設計根拠

**壁時計時間はレビュー時間ではない。** 実サンプルの `state.json` では `interface-design` のゲートが
**6日間**開いている。ゲート開閉の差分や `-Continue` の実行時刻を終端に使うと、指標が
「実験者がいつPCの前に座ったか」になってしまう。

一方、**GitHub のレビューはサーバ側で打刻されており、両端が取得できる**。
実データ（PR #3 / review id `4660529312`）で検証済み:

| 時刻 (UTC) | 出来事 | API 上の表現 |
|---|---|---|
| 06:47:18 | 「Start a review」でレビュー生成 ← **開始** | GraphQL `PullRequestReview.createdAt` |
| 06:47:18 | 1件目の下書き | `pulls/{n}/comments[].created_at` の最小値 |
| 06:49:54〜06:51:32 | 2〜4件目の下書き | 〃 |
| 06:51:49 | Submit review ← **終了** | `PullRequestReview.submittedAt` / REST `submitted_at` |

→ **実レビュー時間 = 4分31秒**。`createdAt` と `submittedAt` が**別フィールドとして保持される**
（`06:47:18` ≠ `06:51:49`）ことが本方式の土台。

#### 「最初の下書きコメントを開始点にする」案を採らない理由

当初案は開始点を `min(comments[].created_at)` に置いていたが、**3つの穴があり不採用**とした。

1. **指摘ゼロのレビューが測れない。** 回避策として「指摘が無くても『レビュー開始』と1件書く」という
   運用規約を課す設計だったが、これは実装と衝突する。`Get-ReviewComments`
   （[Invoke-Process.ps1:358](Invoke-Process.ps1)）は `lastRevisedAt` 以降のコメントを**無条件に**拾い、
   `Invoke-Revise` が `99-revise.md` へ注入する。ダミーコメントが**指摘として AI に渡り、
   無意味な `-Revise` ラウンドを1回発生させる**。指摘件数・指摘密度・差し戻し回数・
   一発通過率が同時に汚染される。
2. **読み込み時間の取りこぼしが「一定オフセット」ではない。** 差分が大きいほど、丁寧に読むほど
   読み込み時間は長い。既存プロセスと提案プロセスでは diff 規模もレビューの厚みも異なるため、
   **取りこぼし量が群間で系統的に違う**。主指標は「−30%削減」という**群間比**なので、
   群ごとに向きの違うバイアスが乗ると比の主張そのものが成立しない。
3. **欠測が「短いレビュー」に偏る。** 指摘ゼロ＝速いレビューだけが欠測に落ちるため、
   欠測は無作為でなく**短時間側が選択的に消える**。残ったデータの平均は上へ歪む。
   しかも提案プロセスほど指摘ゼロが増える設計であり、**主張したい方向と逆向きに効く**。

#### 採用する方式

**`-Review` コマンドが、PRを開く直前に空の PENDING レビューを API で作成する。**
GitHub がその瞬間を `createdAt` としてサーバ打刻するため、

- コメントが1件も付かなくても**開始時刻が残る**（穴1を解消。ダミーコメント不要＝`Get-ReviewComments` を汚さない）
- 読み始める**前**に打刻されるため、**読み込み時間が計測に入る**（穴2を解消）
- 欠測が短時間側に偏らない（穴3を解消）
- **`review_ms` の両端が同一の GitHub サーバ時計**。ローカルPCの時刻にも、実験者がコマンドを
  叩いた時刻にも依存しない＝自己申告値ではなく**第三者記録**であり、修了制作の証拠として強い
- 副次効果として、Submit し忘れると PENDING が残るので **4-5-4 のガードが常に効く**。
  指摘ゼロの回でも Submit を強制でき、終端も必ずサーバ打刻になる

実験者に課す追加動作は「PRを `-Review` で開く」の1点のみ。ラベル運用は不要。

> **検証済み（2026-08-10 / PR #3）**: `POST /repos/{owner}/{repo}/pulls/{n}/reviews` を
> `event` 無し・`body` 空・フィールド無しで叩くと **`state:"PENDING"` / `body:""` のレビューが作れる**。
> GraphQL では `createdAt` が打刻されて見え（REST のレビューオブジェクトには `created_at` が無い）、
> 未提出なので `Get-ReviewComments` にも拾われない。確認後、`DELETE .../reviews/{id}` で削除済み。
> → **マーカー body は不要**（フォールバック経路として実装だけ残してある）。
>
> ~~**要検証（実装前に5分で確認すること）**~~: `POST /repos/{owner}/{repo}/pulls/{n}/reviews` を
> `event` 無し・`body` 空で叩いて PENDING レビューが作れるか。422 になる場合は
> `body` にマーカー（例 `<!-- harness:review-start -->`）を入れて作成し、
> **`review_id` 一致で機械的に除外**する（`Get-ReviewComments` のレビュー要約収集
> [Invoke-Process.ps1:364-368](Invoke-Process.ps1) から必ず外すこと）。
>
> **実装時の差分**: 事前検証を待たずに済むよう、`New-PendingReview` が
> **body 空で作成 →失敗したらマーカー付きで再試行**する二段構えにした（どちらでも動く）。
> 除外は `review_id` 一致ではなく**マーカー文字列の除去**で行う。`review_id` で丸ごと落とすと、
> 実験者が同じレビューの本文に書いた**本物の指摘まで捨ててしまう**ため。マーカーを除いた
> 本文が空なら収集しない（＝AIに渡らない）。

### 4-1. 実験者の運用規約（2つだけ）

1. **PRは必ず `-Review` で開く**
   ```powershell
   powershell -File harness/Invoke-Process.ps1 -Review
   ```
   PENDING レビューを作成し、ブラウザで PR を開く。**これが開始打刻**。
   GitHub の通知から直接開くと欠測（4-6 のフォールバックに落ちる）。
2. **終わったら必ず「Submit review」**
   - 自分の PR は Approve / Request changes ができない（下記）ため、実際には **Comment** で提出する。
   - 提出後に `-Continue`（次フェーズへ）または `-Revise`（指摘を反映）を叩く。

この運用は `harness/README.md` と `README.md` の手順にも追記すること（守られないと欠測になる）。

### 4-2. `outcome` は `review.state` からは決まらない（当初案の誤り）

パイロット PR #3 のレビューを実際に引くと、5件すべて `state: "COMMENTED"` / `user: masashimiki`
（＝PR作成者本人）だった。**GitHub は自分の PR を Approve / Request changes できない**ため、
`APPROVED`→`continue` / `CHANGES_REQUESTED`→`revise` というマッピングは**永久に到達しない**。

→ **`outcome` は実験者が叩いたコマンドから決める**:

| コマンド | `outcome` |
|---|---|
| `-Continue` | `continue` |
| `-Revise` | `revise` |
| 提案プロセスによる自動スキップ | `skip`（4-4 参照） |

`review.state` は生値として `review_state` に残しておく（別アカウントでレビューする運用に
将来変えた場合に備える）。

### 4-3. 取得方法（GraphQL 1コール）

REST の2コール（`/reviews` と `/comments` を `pull_request_review_id` で突き合わせ）は不要。
GraphQL なら `createdAt` / `submittedAt` / コメントを一度に取れる。

```bash
gh api graphql -F owner=':owner' -F repo=':repo' -F pr=3 -f query='
query($owner:String!,$repo:String!,$pr:Int!){
  repository(owner:$owner,name:$repo){ pullRequest(number:$pr){
    reviews(first:50){ nodes{
      databaseId state createdAt submittedAt
      comments(first:100){ nodes{ databaseId createdAt replyTo{ databaseId } } }
    }}
  }}
}'
```

| 項目 | 求め方 |
|---|---|
| `review_opened_at` | `review.createdAt`（＝`-Review` が PENDING を作った瞬間） |
| `first_comment_at` | そのレビューのコメントの `min(createdAt)`（参考値・下書きが無ければ null） |
| `submitted_at` | `review.submittedAt` |
| `comments` | そのレビューのコメントのうち **`replyTo` が null のものだけ** |

PENDING レビュー（`submittedAt: null`）は**本人のトークンでのみ**見える。ハーネスと実験者は
同一アカウントなので問題ない。

#### ⚠️ 自動返信の除外は必須

PR #3 の 06:53:32〜36 に並ぶ4件の `COMMENTED` レビューは、すべて `replyTo`（REST では
`in_reply_to_id`）が付いており、`metrics.jsonl` の `requirements-revise`
（`2026-07-09T15:53:27+09:00` = `06:53:27Z`）と時刻が一致する。
**ハーネスの `Publish-CommentReplies` が投稿した自動返信**である。

→ **`replyTo != null` のコメント、およびそれだけで構成されるレビューは人間のレビューから除外する。**
除外しないとレビュー件数も時刻も汚染される。

### 4-4. 記録先: `reviews.jsonl`（1レビューラウンド = 1行）

**#15（レビュー対象数）をここに相乗りさせる。** 追加コストがほぼゼロで、
成果①の指標がこのファイル1本で揃うため、#11 と同時に実装すること。

> **実装時の差分**: 出力先は `metrics.jsonl` と同じく **`<worktree>/.harness/reviews.jsonl` と
> `<main>/.harness-data/reviews.jsonl` の二重書き**（#13 実装済み）。worktree を削除しても
> レビュー時間は中央側に残る。

**主指標を1つに決め打ちせず、候補時刻を全部残して `review_ms` は導出値にする。**
発表時に「旧定義（`write_ms`）でも同じ結論になる」という感度分析を示せるようにするため。

```json
{"ts":"…","story":"US-001","variant":"existing","sample":"existing-3","phase":"implementation",
 "round":1,
 "pr":3,"review_id":4660529312,"review_state":"COMMENTED",
 "gate_opened_at":"…",
 "review_opened_at":"2026-07-09T06:47:18Z",
 "first_comment_at":"2026-07-09T06:47:18Z",
 "submitted_at":"2026-07-09T06:51:49Z",
 "continued_at":"…",
 "review_ms":271000,"read_ms":0,"write_ms":271000,
 "latency_ms":518400000,
 "outcome":"revise",
 "review_time_source":"pending-review",
 "comments":4,
 "diff_files":7,"diff_added":210,"diff_deleted":12}
```

| フィールド | 意味 |
|---|---|
| `review_ms` | **実レビュー時間（主指標）**。`review_opened_at` → `submitted_at`（両端とも GitHub サーバ時刻） |
| `read_ms` | 参考。`review_opened_at` → `first_comment_at`＝**読み込み時間**（当初案が取りこぼしていた区間） |
| `write_ms` | 参考。`first_comment_at` → `submitted_at`＝**旧#11定義**。パイロット PR #3 と接続でき、感度分析に使う |
| `latency_ms` | 承認ラグ（参考値）。`gate_opened_at`（ハーネス側）→ `submitted_at` |
| `outcome` | 叩いたコマンドから決定（4-2）。`continue` / `revise` / `skip` |
| `review_time_source` | 開始打刻の由来。下表 |
| `comments` | 人間の指摘件数（自動返信を除外済み） |
| `diff_*` | `git diff --numstat <phaseBase> HEAD` の集計（#15） |

`review_time_source` の値と**フォールバック優先順**:

| 値 | 条件 | `review_ms` |
|---|---|---|
| `pending-review` | `-Review` 経由。`review.createdAt` を開始とする（**正常系**） | 実値 |
| `first-comment` | `-Review` を忘れたが下書きがある。`min(comments.createdAt)` を開始とする（＝旧定義） | 実値（過小評価。集計時に区別する） |
| `skipped` | 提案プロセスがテスト合格でレビューを省略した回 | **`0`** |
| `missing` | `-Review` も下書きも無い | **`null`** |

- `skipped` は③コードレビュー省略率の分子そのもの。**欠測（`missing`）と明確に区別する**。
  実装自体は #1（提案プロセス）側だが、スキーマはここで確定させておく。
- **欠測を「0分」や「6日」に化けさせないこと**（`missing` は必ず `null`）。

### 4-5. スクリプトの変更点

1. **ゲート停止時**（`Invoke-Process.ps1` の `if ($phase.gate)` 直後、現 641行目付近）
   - `gateOpenedAt` を state へ記録
   - `git diff --numstat <phaseBases[phase.id]> HEAD` で diff 規模を控えて state へ保持
   - 次の操作として `-Review` を案内する（現在は `-Revise` / `-Continue` のみ表示）
2. **`-Review` を新設**
   - state から PR 番号とラウンドを取得
   - 自分の PENDING レビューが既にあれば**再利用**（`createdAt` を上書きしない）、無ければ作成
   - `pendingReviewId` を state へ保存し、`gh pr view <n> --web` でブラウザを開く
   - 冪等。ゲートが開いていない状態で叩かれたら停止する
3. **`Get-ReviewSessions` を新設**（既存 `Get-ReviewComments` と同じデータ源なので統合してよい）
   - 4-3 の GraphQL を叩き、レビュー単位のセッション配列を返す
   - `lastRevisedAt` 以降のレビューのみを対象にする（既存のフィルタ方針を踏襲）
4. **PENDING レビュー残存のガード（重要）**
   - Submit し忘れると `submittedAt` が `null` のままラウンドが閉じない
     （**PR #2 に実例あり**: 下書き2件が 03:17:55 / 03:18:47 で未提出のまま）
   - `-Continue` / `-Revise` の実行時に PENDING レビューが残っていたら **警告して停止**し、
     GitHub で Submit review するよう案内する
   - 本方式では PENDING を必ず作るため、**指摘ゼロの回もこのガードで Submit を強制できる**
5. **`-Continue` / `-Revise` の冒頭**
   - 対象ラウンドのセッションを確定して `reviews.jsonl` へ追記（`outcome` はコマンドから決定）
   - `-Revise` の場合は push 完了後に**次ラウンドを開始**（`gateOpenedAt` を再打刻・
     `round` をインクリメント・`pendingReviewId` をクリア）

**実装時の差分**:

- **最終フェーズのゲートも計測対象にした。** `existing` の `e2e-run` と `baseline` の `build` は
  次フェーズが無く状態が `done` になるため、当初案のままだと `-Continue` が呼ばれず
  **最終成果物のレビューだけが永久に欠測**する。`baseline` は唯一のゲートがこれに当たり、
  **比較対象群のレビュー時間が丸ごと落ちて主指標（−30%）が成立しない**。
  そこで `done` でも開いているラウンドがあれば `-Continue` を「最後のラウンドを閉じる操作」として
  受け付ける（次フェーズへは進まない）。
- **`round` はゲート（フェーズ）ごとに1から数える。** サンプル通し番号にすると
  「このゲートで何回差し戻したか」が読めなくなるため。
- **`-Revise` のラウンド記録は AI 実行・push・自動返信の後**に行う。自動返信より後に
  次ラウンドの `gateOpenedAt` を打つことで、ハーネスの返信が次ラウンドのレビューへ混ざらない
  （`replyTo` による除外と合わせて二重の防御）。`continued_at` だけはコマンド起動時刻を使う。
- **`-Rollback` は開いているラウンドを破棄する**（`gatePhaseId` / `gateOpenedAt` /
  `pendingReviewId` / `gateDiff` をクリア）。残すと、やり直し後の `-Continue` が
  「破棄済みフェーズのレビュー」を新しいラウンドとして記録してしまう。あわせて
  4-6 のガードとして **`-Rollback` 直後の `-Revise` は停止**する（対象フェーズがずれるため／#26）。
- **`sample` 列は `state.json` を正とする**（#13 実装済み）。ブランチ名
  （`sample/<story>/<sample>`）からの導出は、本機能の導入前に開始したサンプル用の
  フォールバックとして残してある。

### 4-6. 注意点

- **タイムゾーン**: `review_ms` / `read_ms` / `write_ms` は両端 UTC で完結するため換算不要。
  一方 `latency_ms` は `gate_opened_at`（ローカル `+09:00`）を含むので、
  減算前に必ず `ToUniversalTime()` で正規化する。
- **離席は検知できない**。`-Review` の後に中断すると数値が膨らむ。PENDING レビューは
  作り直すと下書きコメントが消えるため**測り直しはできない**。運用規約（中断しない）＋
  集計側の外れ値閾値（例: 60分超はフラグ）で対処し、該当行には手動で `note` を残す。
- `-Rollback` で破棄したラウンドは `metrics.jsonl` と同様に **`rolled_back=true` を付けて残す**（削除しない）。
- `-Revise` は `phaseIndex - 1` を対象フェーズとしている（現 435行目付近）。`-Rollback` 直後は
  この前提が崩れる（#26）。今回のスコープ外だが、ラウンド記録の `phase` が誤らないよう
  最低限のガード（`-Rollback` 直後は `-Revise` を拒否する等）を入れておくと安全。
- パイロット PR #3 からは `write_ms` 相当の 4分31秒 のみ遡って復元できる（`-Review` を経ていないので
  `read_ms` は不明）。**条件が異なるため参考値**とし、本番データには混ぜないこと。
- `measurement_indicators.md` ① の「人手レビュー時間」行（現在 ⚙️ 手動運用）と
  「レビュー対象数」「指摘密度」行（🔴）は、本節の実装完了時に ✅/🟡 へ更新すること。

### 完了条件

実装済み（実行を伴わずに確認できたもの）:

- [x] ハーネスの自動返信（`replyTo` 付き）が `comments` に混入していない
      （パイロット PR #3 で確認: レビュー5件のうち自動返信4件を除外し、人間のレビュー1件・指摘4件だけを返す）
- [x] `-Review` を経ずにレビューした場合は `review_time_source="first-comment"` に落ち、値が捏造されない
      （PR #3 のデータで `pending-review` / `first-comment` / `missing` の3経路を実行し、
      `pending-review` が旧#11定義と同じ 271000ms＝4分31秒 を再現。`missing` は `review_ms=null`）
- [x] `diff_files` / `diff_added` / `diff_deleted` が実値で入る（`git diff --numstat` の集計を確認）
- [x] ハーネスが作った PENDING レビューのマーカーが `Get-ReviewComments` 経由で
      `99-revise.md` に混入しない（マーカーを除去し、残りが空なら収集しない）
- [x] `body` 空で PENDING レビューを作れる（PR #3 で実測 → 削除済み。上記「検証済み」参照）。
      したがってマーカーは通常使われない

実サンプルを1本回して確認すること（未実施）:

- [ ] `-Review` → GitHub で Submit review → `-Continue` の一連で `reviews.jsonl` に1行出る
- [ ] `review_opened_at` が `-Review` を叩いた時刻（`review.createdAt`）、`submitted_at` が
      `review.submittedAt` と一致する
- [ ] **指摘ゼロのまま Submit しても `review_ms` が実値で入り、`review_time_source="pending-review"` になる**
- [ ] `read_ms` > 0 が記録される（＝読み込み時間が計測範囲に入っている）
- [ ] `-Revise` を2回挟むと `round` が 1,2,3 と増え、`outcome` が `revise,revise,continue` になる
- [ ] Submit せずに `-Continue` すると警告して停止する
- [ ] `baseline`（唯一のゲート＝最終フェーズ）でも `-Review` → Submit → `-Continue` で1行出る

---

## 5. #13 メトリクス中央集約 — その前に「サンプルIDが無い」問題を先に潰す

### 5-1. `sample` フィールドの追加（必須・これが先）

現状の metrics 行は `story` + `variant` しか持たない。**同一 variant の10サンプルをマージすると行を区別できない。**

- `Start-Sample.ps1` は `-N` を知っているので、`-Init` へ `-Sample "$Variant-$N"` と `-SampleIndex $N` を渡す
- `Invoke-Process.ps1` は `-Init` 時に state.json へ `sample` / `sampleIndex` を保存
- フォールバック: ブランチ名 `sample/US-001/existing-3` から `existing-3` を導出
- `metrics.jsonl` / `reviews.jsonl` の全行に `sample` を含める

**実装時の差分**:

- サンプルIDは **`<variant>-<agent>-<N>`**（例 `existing-claude-3`）。エージェント名は
  `Start-Sample.ps1` が既に採用済みで、入れないと「プロセスの差」を測っているつもりで
  「エージェントの差」を測ってしまうため、そのまま踏襲した。
- サンプル開始後に `-Sample` で別のIDを渡すと**停止する**（記録が2つのIDへ割れるのを防ぐ）。
  `-Agent` の途中変更を止めているのと同じ理由。
- ブランチ名からも導出できない場合（`main` 上で直接 `-Init` した等）は `null` のまま進み、
  **`-Init` 時に警告を出す**。ここで停止させると使い捨ての動作確認ができなくなるため。

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

**実装時の差分**:

- **`-Rollback` の `rolled_back` タグ付けを中央側にも広げた。** 当初案は出力先の追加だけだったが、
  中央側にタグが付かないと**本番データ側にだけ破棄済みの試行が生き残り、集計が二重計上になる**。
  ただし中央ファイルは全サンプルの行が混在するため、`phase` だけで突き合わせると
  **別サンプルの生きた行まで巻き添えで潰す**。`sample` 一致を条件に加えてある
  （`sample` が不明なサンプルでは中央側のタグ付けをスキップし、警告を出す）。
  なおこの処理だけは全文の読み書きになるため、並列実行に踏み切る場合はここに排他が要る（#21）。
- **state スナップショットは「フェーズ完了ごと」ではなく `Save-State` のたびに上書き**する。
  ゲート開始・`-Review` の打刻・巻き戻しでも state は動くため、フェーズ境界だけだと
  中央側の内容が実体とずれる。書き込みは1ファイル上書きで安価。
- **中央側への書き込み失敗は致命扱いしない**（フェーズは既に走り終わっており、ローカルには
  残っているため）。ただし気づかず worktree を消すと本当に失われるので**赤字で警告**する。
- `-Status` に保存先パスを表示するようにした（worktree を消す前に確認できるように）。

### 5-3. 最終的に git へ入れる

`.harness-data/` は `.gitignore` に追加してそのままにし、分析確定時に集約結果を
`experiments/US-001/metrics.jsonl` としてメインリポジトリへ**コミット**する。
修了制作の生データはそれ自体が成果物であり、バックアップと監査証跡を兼ねる。

### 5-4. 注意点

- 既存 `US-SAMPLE01` のデータは改修前のもの（`sample` も `model` も無い）。
  **本番データに混ぜず、パイロットとして別ファイルに退避**する。
  → 退避済み: `<main>/.harness-data/pilot/US-SAMPLE01-existing-1.{metrics.jsonl,state.json}`
  （出所は worktree `KeihiSeisan-sample-existing-1`。**この worktree は `Agents.ps1` 導入前の
  ものでもう動かせない**ため、削除する前に中央側へコピーしてある）。
- `.gitignore` に `.harness-data/` を追加すること（現在は `.harness/` のみ）。

### 完了条件

実装済み（使い捨てリポジトリ＋worktree で実関数を動かして確認）:

- [x] 保存先が worktree 内から実行しても**メインリポジトリ側**に解決される（`--git-common-dir`）
- [x] `metrics.jsonl` / `reviews.jsonl` の行に `sample` が入り、ローカルと中央の両方へ追記される
- [x] `state.json` のスナップショットが `<main>/.harness-data/state/<sample>.json` に出る
- [x] サンプルIDが state.json 優先・ブランチ名フォールバックで解決される
- [x] `-Rollback` のタグ付けが**自サンプルの対象フェーズの行だけ**に効く（別サンプルの行は無傷）
- [x] `git worktree remove --force` の後も中央データが残っている
- [x] `.gitignore` に `.harness-data/` を追加

実サンプルを1本回して確認すること（未実施）:

- [ ] `Start-Sample.ps1` 経由の `-Init` で `state.json` に `sample` / `sampleIndex` が入る
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
   - `<main>/.harness-data/metrics.jsonl` に `sample` / `model` / `agent_version` を含む行が出る
   - ゲートで `-Review` → GitHub で「Submit review」（**指摘ゼロで試すこと**）→ `-Continue` し、
     `reviews.jsonl` に `review_ms` / `read_ms` を含む行が出る
   - `git worktree remove` してもデータが残る
4. 後片付け: `git worktree remove ../KeihiSeisan-sample-baseline-claude-9 --force`

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
