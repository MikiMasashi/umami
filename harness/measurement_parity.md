# エージェント切替時の計測パリティ設計（Claude CLI ⇔ GitHub Copilot CLI）

ハーネスの実行エージェントを **Claude Code CLI / GitHub Copilot CLI で切り替え可能**にするにあたり、
**どちらを使っても同じ計測項目が同じ定義で取れる**ようにするための設計文書。

- 対象指標の一次資料: [measurement_indicators.md](measurement_indicators.md)（PPT P13〜P16 の指標体系）
- 実測日: 2026-08-06 / 実測環境: Copilot CLI `1.0.78` / Claude Code CLI `2.1.143`（Windows 11）
- 本文の「実測」表記は、両CLIに実際に同一プロンプトを流して出力を採取した結果に基づく（推測ではない）。

---

## 0. 結論（先に3行）

1. **PPT指標のうち、エージェント差の影響を受けるのは①効率の一部だけ**。②品質・③自動化率の指標は
   ほぼすべてエージェント外部（GitHub API / E2E結果 / git diff）で測るため、切替の影響を受けない。
2. **影響を受ける項目も、計測点をハーネス側に寄せれば同一定義にできる**（時間・ターン数・ツール呼び出し数・
   差分規模）。プロバイダ固有値は「参考値」として別フィールドに退避する。
3. **原理的に同一化できないのは「利用料の通貨」だけ**（Claude=USD / Copilot=AIクレジット）。
   → **トークン量を共通の一次指標**とし、単価表で換算した金額は二次指標として扱う。
   これは PPT P14 の定義「生成AI利用料＝**トークン量×単価**」とも一致する。

---

## 1. 両CLIの実測インターフェース比較

### 1-1. 呼び出し方

| | Claude Code CLI | GitHub Copilot CLI |
|---|---|---|
| 非対話実行 | `claude -p` | `copilot -p <text>` |
| プロンプト投入 | **stdin パイプ可**（現ハーネスはこれを使用） | **stdin 不可。argv 引数のみ**（実測: `-p` の次の引数を本文として食う） |
| ストリーム出力 | `--output-format stream-json --verbose` | `--output-format json`（JSONL・既定でストリーム） |
| モデル指定 | `--model <alias\|id>` | `--model <id>`（未指定時の実測既定値: `claude-sonnet-5`） |
| 権限（編集のみ許可） | `--permission-mode acceptEdits` | **`--allow-all-tools --deny-tool=shell`**（下記注意） |
| 権限（全許可） | `--permission-mode bypassPermissions` | `--allow-all`（= `--allow-all-tools --allow-all-paths --allow-all-urls`） |
| 対話質問の抑止 | （フラグなし。プロンプトで抑止） | `--no-ask-user`（**明示フラグあり**） |
| 暴走上限 | `--max-turns` | `--max-ai-credits` / `--max-autopilot-continues` |
| Skill 探索先 | `.claude/skills/` | `.github/skills/` `.agents/skills/` **`.claude/skills/`**（実測: 本リポジトリの4スキルを認識） |
| プロジェクト指示 | `CLAUDE.md` | `AGENTS.md` / `.github/copilot-instructions.md`（`--no-custom-instructions` で無効化可） |

> **権限モードの対応付けは「許可」ではなく「拒否」で書く**（実測で判明）。
> Copilot の非対話モードは、**許可リストに無いツールも承認プロンプトを出せずそのまま実行される**
> （`--allow-tool write` だけを付けた状態で shell の `echo` が実行された）。一方 `--deny-tool` は
> allow より優先されるため確実に効き、**拒否されてもハングせず**エージェントは「拒否された」旨を
> 認識して続行する（いずれも実測で確認）。したがって Claude の `acceptEdits`（編集は自動・Bash は不可）に
> 対応させるには `--allow-all-tools --deny-tool=shell` と書く必要がある。
>
> **プロンプト投入方式の差が実装上いちばん厄介**。Windows PowerShell 5.1 の native 引数渡しは
> ダブルクオートを壊す（実測: `"requirements-analyst"` のクオートが消え、`"` 以降が**切り落とされた**）。
>
> 実測で確定した回避策: **渡す直前に `"` → `\"` の置換だけを行う**（バックスラッシュは二重化しない）。
> これで改行・日本語・`` ` ``・`% ! & | > < ^ $ ( ) { } [ ]`・`\` を含む本文が完全に往復することを確認した。
> ただし**文字列が `\` で終わる場合だけは壊れる**（PS が付ける閉じクオートを `\` がエスケープしてしまう）ため、
> その場合は末尾に改行を足してから渡す。あわせて Windows のコマンドライン長上限（32767文字）に対する
> ガードを入れる。
>
> プロンプトを一時ファイルに書いて「このファイルを読め」とするのは、**ツール呼び出しが1回増えて
> 条件が非対称になる**ため採らない。

### 1-2. Skill の扱い

本リポジトリの4スキル（`requirements-analyst` / `backend-architect` / `frontend-engineer` / `test-engineer`）は
`copilot skill list` で **Project skills として4件とも認識される**ことを実測で確認済み。
`.claude/skills/` と `.agents/skills/` の二重管理（改善計画 #27）は、**Copilot が両方を探索先に含むため
実害は無いが、内容ドリフトのリスクは残る**（片方をシンボリックリンク化するか、`.agents/` に一本化するのが望ましい）。

---

## 2. 実測で得られた生データ（何がどこから取れるか）

### 2-1. Claude Code CLI — `result` イベント（1回の `claude -p` につき1件）

```json
{"type":"result","subtype":"success","is_error":false,
 "duration_ms":4580,"duration_api_ms":5324,"ttft_ms":3377,"num_turns":1,
 "session_id":"…","total_cost_usd":0.0290611,
 "usage":{"input_tokens":2,"cache_creation_input_tokens":6384,
          "cache_read_input_tokens":15197,"output_tokens":4},
 "modelUsage":{"claude-sonnet-4-6":{"inputTokens":2,"costUSD":0.0285651,…}},
 "permission_denials":[],"stop_reason":"end_turn"}
```
`system/init` イベントから `model` / `claude_code_version` / `permissionMode` も取得できる。

### 2-2. GitHub Copilot CLI — `result` イベント（同上）

```json
{"type":"result","sessionId":"…","exitCode":0,
 "usage":{"premiumRequests":1,"totalApiDurationMs":6929,"sessionDurationMs":10329,
          "codeChanges":{"linesAdded":1,"linesRemoved":0,"filesModified":["…hello.txt"]}}}
```
加えてストリーム中に:
- `session.usage_checkpoint` → `totalNanoAiu`（AIクレジット×10⁻⁹）/ `totalPremiumRequests`
- `session.tools_updated` / `model.call_start` / `assistant.message` → `model`
- `assistant.turn_start` → ターン数 / `tool.execution_start` → ツール呼び出し名
- **`result` にトークン数は含まれない**（`assistant.message.outputTokens` で出力側のみ断片的に取れる）

### 2-3. Copilot のトークン数は OpenTelemetry で取る（実測確認済み）

環境変数 `COPILOT_OTEL_FILE_EXPORTER_PATH=<path>` を設定すると、そのプロセスの全シグナルが
JSONL で書き出される。**`invoke_agent` スパン1件がセッション全体の集計値**になっており、これ1件で足りる:

```json
{"type":"span","name":"invoke_agent","attributes":{
  "gen_ai.request.model":"claude-sonnet-5","gen_ai.agent.version":"1.0.78",
  "gen_ai.usage.input_tokens":75289,"gen_ai.usage.output_tokens":298,
  "gen_ai.usage.cache_read.input_tokens":66776,"gen_ai.usage.cache_creation.input_tokens":8507,
  "github.copilot.cost":3,"github.copilot.nano_aiu":3761470000,"github.copilot.turn_count":3}}
```

> **`premiumRequests` はコスト指標として使えない**。実測では LLM 呼び出し3回・3.76 AIU 消費のセッションでも
> `premiumRequests:1` だった（＝プレミアムリクエストは粒度が粗すぎる）。**`nano_aiu` を使うこと**。

---

## 3. 正規化スキーマ（`metrics.jsonl` の新フォーマット）

**設計原則: 一次指標はハーネス自身が測る。プロバイダ申告値は `*_native` として併記し、突き合わせ用にとどめる。**
これにより「Claude と Copilot で測り方が違うから比べられない」という交絡を構造的に排除する。

凡例: **★** = ハーネス側計測（両エージェントで**定義が完全に同一**） / ◆ = プロバイダ申告値（参考・突合用）

| フィールド | 意味 | Claude の取得元 | Copilot の取得元 | 種別 |
|---|---|---|---|:---:|
| `agent` | `claude` / `copilot` | 実行時に既知 | 同左 | ★ |
| `agent_version` | CLI バージョン | `system/init.claude_code_version` | `copilot --version` | ◆ |
| `model` | 実際に使われたモデルID | `system/init.model` | `session.tools_updated.data.model` | ◆ |
| `duration_ms` | **フェーズ実行時間（主指標）** | **ハーネスのストップウォッチ** | **同左** | ★ |
| `agent_duration_ms` | エージェント申告の実行時間 | `result.duration_ms` | `result.usage.sessionDurationMs` | ◆ |
| `api_duration_ms` | API 通信時間 | `result.duration_api_ms` | `result.usage.totalApiDurationMs` | ◆ |
| `num_turns` | **ターン数（主指標）** | ストリーム中の assistant メッセージ数を計数 | `assistant.turn_start` を計数 | ★ |
| `agent_num_turns` | エージェント申告のターン数 | `result.num_turns` | OTel `github.copilot.turn_count` | ◆ |
| `tool_calls` | **ツール呼び出し回数** | `tool_use` ブロック数を計数 | `assistant.message.toolRequests` を計数 | ★ |
| `input_tokens` | 入力トークン（**キャッシュ分を除く**） | `result.usage.input_tokens` | OTel の総量から cache 分を減算（下記注意） | ◆ |
| `total_input_tokens` | 入力トークン総量（cache 込み） | input + cache_read + cache_write | OTel `gen_ai.usage.input_tokens` | ◆ |
| `output_tokens` | 出力トークン | `result.usage.output_tokens` | OTel `gen_ai.usage.output_tokens` | ◆ |
| `cache_read_tokens` | キャッシュ読取 | `usage.cache_read_input_tokens` | OTel `gen_ai.usage.cache_read.input_tokens` | ◆ |
| `cache_write_tokens` | キャッシュ書込 | `usage.cache_creation_input_tokens` | OTel `gen_ai.usage.cache_creation.input_tokens` | ◆ |
| `cost_native` | **課金の生値** | `result.total_cost_usd` | `nano_aiu / 1e9` | ◆ |
| `cost_unit` | 生値の単位 | `"usd"` | `"aiu"` | ◆ |
| `premium_requests` | プレミアムリクエスト数（参考） | （なし・`null`） | `session.usage_checkpoint` | ◆ |
| `is_error` | 異常終了か | `result.is_error` | `result.exitCode != 0` | ★ |
| `error_detail` | 失敗理由 | `subtype` + `result` 本文 | `exitCode` + 最終発話 | ★ |
| `session_id` | セッション追跡子 | `result.session_id` | `result.sessionId` | ◆ |
| `agent_version` | CLI バージョン | `system/init.claude_code_version` | OTel `gen_ai.agent.version` | ◆ |
| `model_requested` | CLI へ渡したモデル値 | `--model` の値 | 同左 | ★ |
| `permission` | 権限モード（`edit`/`all`） | ハーネス | 同左 | ★ |
| `ts` / `story` / `variant` / `phase` | 分類キー | ハーネス | 同左 | ★ |

> **⚠ トークン定義のズレ（実測で発見。実装で吸収済み）**
> Copilot の OTel `gen_ai.usage.input_tokens` は**キャッシュ分を含む総量**（実測: 24988 =
> cache_read 16919 + cache_write 8067 + 素の入力 2）。一方 Claude の `usage.input_tokens` は
> **キャッシュ分を除いた値**。そのまま並べると同じ列名で桁違いの数値が並ぶ。
> → `Agents.ps1` が Copilot 側で `input_tokens = 総量 − cache_read − cache_write` を計算し、
> **Claude の定義に揃える**。総量が必要なときは `total_input_tokens` を使う。

> **成果物の規模（`diff_files` / `diff_added` / `diff_deleted`）について**
> Copilot は `result.usage.codeChanges` で自己申告するが、Claude には同等値が無いため**使わない**。
> `git diff --numstat` でハーネスが測れば両者で完全に同一定義になる。実装は
> [improvement-plan.md](improvement-plan.md) の #11/#15（`reviews.jsonl`）に含まれるため、
> 本対応のスコープ外とし、そちらで入れる。

### 3-1. 「同一項目を測れるようにする」ための具体的な担保

| 差異 | 素朴にやると起きること | 本設計での解消方法 |
|---|---|---|
| 実行時間の測り方が違う | Claude の `duration_ms` と Copilot の `sessionDurationMs` は計測区間が違い、比較すると系統誤差が乗る | **両方ともハーネスのストップウォッチで測る**。申告値は `agent_duration_ms` に退避 |
| ターンの定義が違う | Claude の `num_turns` と Copilot の `turn_count` は数え方が違う | **両方ともストリームイベントを自前で計数**。申告値は `agent_num_turns` に退避 |
| Copilot はトークン数を出さない | 「トークン量×単価」が Copilot 側だけ欠測 | **OTel ファイルエクスポータを常時有効化**して `invoke_agent` スパンから取得 |
| 課金単位が違う（USD ⇔ AIU） | 金額を直接比較すると意味が壊れる | **トークン量を一次指標**にする。金額は `cost_native`+`cost_unit` で生のまま残し、**換算はしない** |
| トークンの数え方が違う | Copilot の入力トークンはキャッシュ込みの総量で、Claude より桁違いに大きく出る | Copilot 側でキャッシュ分を減算し **Claude の定義へ揃える**（総量は `total_input_tokens`） |
| 差分規模の出所が違う | Copilot は `codeChanges` を出すが Claude は出さない | **両方とも `git diff --numstat` で測る**（`codeChanges` は使わない） |
| 権限モードの粒度が違う | 片方だけ Bash が使えて手数が変わる | `acceptEdits ⇔ --allow-tool write` / `bypassPermissions ⇔ --allow-all` に対応付けて固定 |

---

## 4. PPT指標（P13〜P16）へのエージェント切替の影響

**◎=切替の影響なし（エージェント外部で計測） / △=定義を揃える必要あり（本設計で解消） / ×=原理的に同一化不能**

### ① 効率（P14）

| 指標 | 影響 | 備考 |
|---|:---:|---|
| ★ 人手レビュー時間 | ◎ | GitHub の Start a review〜Submit review から取得（改善計画 #11）。エージェントと無関係 |
| リードタイム / フェーズ別実行時間 | △ | ハーネスのストップウォッチに一本化して解消 |
| ★ 人的工数 | ◎ | 人手側の計測。エージェントと無関係 |
| 生成AI利用料 | **×→△** | **通貨が違う**（USD / AIU）。トークン量を一次指標に据えて実質解消 |
| 指摘密度 | ◎ | PRコメント数 ÷ レビュー時間。エージェントと無関係 |
| レビュー対象数 | △ | `git diff --numstat` に一本化して解消（Copilot の `codeChanges` は使わない） |
| 差し戻し回数・手戻り時間 | △ | `phase="<id>-revise"` の行数と `duration_ms`。上記2つが揃えば自動的に揃う |

### ② 品質（P15）

| 指標 | 影響 | 備考 |
|---|:---:|---|
| ★ 受入条件充足率 | ◎ | E2E の実行結果から判定。エージェントと無関係 |
| Mutation Score | ◎ | （スコープ外） |
| 工程内封じ込め率(PCE) | ◎ | 人手判定 |
| 回帰テスト合格率 | ◎ | テストランナーの結果 |
| 保守性に関する指摘件数 | ◎ | Lint / 静的解析の結果 |
| ★ 標準偏差・変動係数 | △ | 元データ（`duration_ms` / トークン）の定義が揃えば自動的に揃う |

### ③ 自動化率（P16）

| 指標 | 影響 | 備考 |
|---|:---:|---|
| ★ 人時比率 / 自動化率 | △ | 分母＝総リードタイム。`duration_ms` の定義統一で解消 |
| ★ コードレビュー省略率 | ◎ | 提案プロセスの構造で決まる。エージェントと無関係 |
| ゲート一発通過率 | ◎ | `-revise` 行の有無。エージェントと無関係 |

> **まとめ**: 21指標中、エージェント切替の影響を受けるのは **①効率の4項目＋②のばらつき＋③の人時比率**のみ。
> そのすべてが「ハーネス側計測への一本化」で解消し、残る本質的な非対称は**利用料の通貨**だけ。

---

## 5. 実験条件としてのエージェント（重要な設計判断）

エージェントを切り替えられるようにすると、**エージェントが実験の交絡要因になる**。
`experiment.json` に以下を固定し、`metrics.jsonl` の全行に来歴として記録する:

```json
{
  "agent": "claude",
  "claude":  { "model": "<解決済みモデルID>", "maxTurns": 200 },
  "copilot": { "model": "claude-sonnet-5", "maxAiCredits": null },
  "aiuUsdRate": null,
  "note": "10サンプル取得中は変更禁止。変更したらサンプル取得をやり直すこと"
}
```

- 実行時に解決されたモデルIDが期待値と違えば**そのフェーズを失敗させる**（改善計画 #3 と同じ方針）。
- `agent` はサンプルIDにも含める（例: `existing-claude-1` / `existing-copilot-1`）。
  含めないと、集計時に同一 variant の行を区別できない。
- **エージェントをまたいだサンプルを1つの分布に混ぜてはいけない**。混ぜると①③のばらつきが
  「プロセスの差」ではなく「エージェントの差」を測ってしまう。

### 5-1. 既存パイロットデータの扱い

`US-SAMPLE01`（Claude・10行）には `agent` も `sample` も `model` も無い。
**本番データに混ぜず、パイロットとして別ファイルへ退避**する（改善計画 #13 の方針と同じ）。

---

## 6. 決定事項と実装

| # | 論点 | 決定 |
|---|---|---|
| A | Copilot は置き換えか比較軸か | **切替可能にするだけ**（本番の使い分けは未定）。ただし `agent` はサンプルIDにも計測行にも入れるので、後からどちらに倒しても集計は破綻しない |
| B | 利用料の扱い | **トークン量を一次指標／金額は生値併記**。AIU→USD の換算は行わない（`cost_native` + `cost_unit`） |
| C | Copilot の使用モデル | `experiment.json` の `agents.copilot.model`。`null` ならエージェント既定（実測時点で `claude-sonnet-5`）。選択肢は対話モードの `/model` で確認する |
| D | `--no-ask-user` | **常時付与**。headless では対話質問に答えられず無駄ターン・停止の原因になるため（改善計画 #5 の Copilot 側の解） |

### 6-1. 実装ファイル

| ファイル | 役割 |
|---|---|
| `harness/Agents.ps1`（新規） | エージェント差分の吸収層。`Invoke-Agent` が**正規化済みの計測レコード1件**を返す唯一の入口 |
| `harness/experiment.json`（新規） | 実験条件（既定エージェント / エージェント別モデル / 上限）。10サンプル取得中は変更禁止 |
| `harness/Invoke-Process.ps1` | `-Agent` を追加。`Run-Agent` が正規化レコードを `metrics.jsonl` へ書く。`expectModel` 不一致でフェーズを失敗させる |
| `harness/Start-Sample.ps1` | `-Agent` を追加。**サンプルID／ブランチ名／worktree名に agent を含める**（`existing-copilot-1`） |

### 6-2. 運用上の約束

- **エージェントはサンプル開始時に確定**し、途中で変えられない（`state.json` の `agent` と突き合わせて拒否する）。
  1サンプルの計測値が2つのエージェントの混合になるのを防ぐため。
- **エージェントをまたいだサンプルを1つの分布に混ぜない**。混ぜると①③のばらつきが
  「プロセスの差」ではなく「エージェントの差」を測ってしまう。
- **`experiment.json` は事前にコミットしておく**（worktree はコミット済みファイルしか持たない）。
- 既存パイロット `US-SAMPLE01`（Claude・`agent` 列なし・旧スキーマ10行）は**本番データに混ぜない**。

### 6-3. まだ残っている非対称（本対応のスコープ外）

- **課金通貨**（USD / AIU）。トークン量で代替できるが、金額そのものの横断比較は行わない。
- **プロジェクト指示ファイル**。Claude は `CLAUDE.md`、Copilot は `AGENTS.md` /
  `.github/copilot-instructions.md` を読む。本リポジトリには**どちらも存在しない**ので現状は対称だが、
  片方だけ追加すると条件が崩れる。追加するなら両方に同内容を置くか、両方置かないこと。
- **ユーザーレベルの設定の混入**（`~/.claude/` / `~/.copilot/`）。実行環境側の設定は
  リポジトリからは制御できないため、10サンプルは同一マシン・同一設定で取ること。
