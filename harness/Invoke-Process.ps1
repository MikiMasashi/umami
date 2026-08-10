<#
.SYNOPSIS
  ステートフルなユーザーストーリー実行オーケストレーター（案B＋C）。
  プロセス定義(harness/processes/<variant>.json)の各フェーズを claude -p で順に実行し、
  「全工程の区切りごと」に停止（レビューゲート）する。人間がPRをレビュー後、
  同じコマンドを再実行するだけで次フェーズへ進む。

.DESCRIPTION
  1フェーズ = 1回の claude -p 呼び出し（固定プロンプトを stdin 投入 / --model 固定 /
  --output-format json でメトリクス自動収集）。フェーズ間の文脈はセッションではなく
  「コミット済みの成果物ファイル」で受け渡す（＝プロンプト汚染を排除し再現性を確保）。

  状態は <cwd>/.harness/state.json に保存。worktree ごとに独立する。

.EXAMPLE
  # 初期化して最初のフェーズ（要件定義）を実行 → ゲートで停止
  powershell -File harness/Invoke-Process.ps1 -Story US-001 -Variant existing -Init

  # レビューを開始する（PENDINGレビューを作ってブラウザでPRを開く）＝レビュー時間の開始打刻
  powershell -File harness/Invoke-Process.ps1 -Review

  # PRにレビュー指摘を残した場合、それを直前フェーズに反映（何度でも可）
  powershell -File harness/Invoke-Process.ps1 -Revise

  # レビューOKなら次のフェーズへ
  powershell -File harness/Invoke-Process.ps1 -Continue

  # 気に入らないフェーズを丸ごと巻き戻してやり直す（直近フェーズ）
  powershell -File harness/Invoke-Process.ps1 -Rollback
  # 特定フェーズまで巻き戻す（id か 1始まりの番号）
  powershell -File harness/Invoke-Process.ps1 -Rollback -ToPhase implementation

  # 進捗確認
  powershell -File harness/Invoke-Process.ps1 -Status
#>
[CmdletBinding()]
param(
  [string]$Story,
  [string]$Variant = "existing",
  # サンプルID（例 existing-claude-1）。-Init 時に state.json へ保存され、metrics/reviews の
  # 全行に入る。省略時はブランチ名 sample/<story>/<sample> から導出する。
  [string]$Sample,
  # サンプル通し番号。-Init 時に state.json へ保存する（集計時の並び替え・突合用）。
  [int]$SampleIndex = 0,
  [switch]$Init,
  [switch]$Continue,
  # レビュー開始: 空のPENDINGレビューをGitHub側に作って（＝サーバ打刻の開始点）PRをブラウザで開く。
  # 冪等。ゲートが開いている間は何度叩いても同じPENDINGレビューを再利用する。
  [switch]$Review,
  # レビュー指摘の反映（awaiting-review 状態で、直前フェーズをやり直す）。何度でも実行可。
  [switch]$Revise,
  # 巻き戻し: 対象フェーズ以降のコミットを破棄してPRを更新し、そのフェーズからやり直す。
  [switch]$Rollback,
  # 巻き戻し先フェーズ。id(例 implementation) か 1始まりの番号(例 3)。省略時は直近フェーズ。
  [string]$ToPhase,
  [switch]$Status,
  # 実行エージェント。省略時は harness/experiment.json の agent（さらに省略時は claude）。
  # -Init 時に state.json へ保存され、以降のフェーズは同じエージェントで実行される。
  [ValidateSet("claude","copilot")][string]$Agent,
  # 使用モデル。省略時は experiment.json の agents.<agent>.model。
  [string]$Model,
  # 無人実行: すべてのツールを自動許可（Bashやテスト実行も許可）。検証用の隔離worktreeで使う想定。
  [switch]$Unattended = $True
)

$ErrorActionPreference = "Stop"

# --- 文字化け対策: すべての入出力をUTF-8(BOMなし)に固定 ---
# Windows PowerShell 5.1 は Get-Content の既定がANSI(CP932)、Out-File utf8 はBOM付き。
# データファイル(JSON/プロンプト)はBOMなしUTF-8のため、明示指定しないと日本語が化ける。
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$OutputEncoding = $Utf8NoBom                       # claude へパイプするstdinのエンコーディング
try { [Console]::OutputEncoding = $Utf8NoBom } catch {}  # claude の stdout 取り込み用
function Read-Utf8($path)  { [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8) }  # BOM有無どちらも可
function Write-Utf8($path, $text) {
  $dir = Split-Path $path -Parent
  if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
  [System.IO.File]::WriteAllText($path, $text, $Utf8NoBom)
}
# JSONL への1行追記。中央ディレクトリ（#13）は複数サンプルが同じファイルを触り得るため、
# 一時的な共有違反で1行落とさないよう短いリトライで包む（追記のみなので行順は問わない）。
function Append-Utf8($path, $line) {
  $dir = Split-Path $path -Parent
  if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
  for ($i = 1; $i -le 3; $i++) {
    try { [System.IO.File]::AppendAllText($path, $line + [Environment]::NewLine, $Utf8NoBom); return }
    catch { if ($i -eq 3) { throw }; Start-Sleep -Milliseconds 100 }
  }
}

$RepoRoot   = (git rev-parse --show-toplevel).Trim()
$StateDir   = Join-Path $RepoRoot ".harness"
$StateFile  = Join-Path $StateDir "state.json"
$MetricsName= "metrics.jsonl"
$ReviewsName= "reviews.jsonl"
$MetricsFile= Join-Path $StateDir $MetricsName
$ReviewsFile= Join-Path $StateDir $ReviewsName
$ProjectFile= Join-Path $RepoRoot "harness/project.json"
$ExperimentFile = Join-Path $RepoRoot "harness/experiment.json"

# --- 計測データの中央集約（改善計画 #13） ---
# `.harness/` は gitignore かつ worktree ローカルなので、`git worktree remove` した瞬間に
# そのサンプルの計測値（metrics / reviews / state）が消える。10サンプルを取り切る前に
# 1本でも消せば取り直しになるため、**メインリポジトリ側の固定パスへ二重書き**して
# データの寿命を worktree から切り離す。
#
# 保存先は worktree 内から実行しても main の .git を指す --git-common-dir から解決する
# （`git rev-parse --show-toplevel` は worktree 自身を返すので使えない）。
# 環境変数 HARNESS_DATA_DIR があればそちらを優先する（別ドライブへ逃がしたい場合用）。
$script:DataDirCache = $null
function Get-DataDir {
  if ($null -eq $script:DataDirCache) {
    if ($env:HARNESS_DATA_DIR) {
      $script:DataDirCache = $env:HARNESS_DATA_DIR
    } else {
      $ErrorActionPreference = 'Continue'
      $common = "$(git rev-parse --path-format=absolute --git-common-dir 2>$null)".Trim()
      # --path-format は git 2.31 以降。古い git では相対パスが返るので cwd 基準で解決する。
      if (-not $common) { $common = "$((Resolve-Path (git rev-parse --git-common-dir)).Path)".Trim() }
      $script:DataDirCache = Join-Path (Split-Path $common -Parent) ".harness-data"
    }
  }
  $script:DataDirCache
}

# metrics / reviews の1行を「worktree ローカル（サンプル単体のデバッグ用）」と
# 「中央（全サンプル追記＝本番データ）」の両方へ追記する。
# 中央側の失敗は致命扱いしない（フェーズは既に走り終わっており、ローカルには残っているため）が、
# 気づかず worktree を消すと本当に失われるので赤字で警告する。
function Add-DataRow($fileName, $row) {
  $line = ($row | ConvertTo-Json -Compress)
  Append-Utf8 (Join-Path $StateDir $fileName) $line
  try { Append-Utf8 (Join-Path (Get-DataDir) $fileName) $line }
  catch {
    Write-Host "中央データ($fileName)への追記に失敗しました: $_" -ForegroundColor Red
    Write-Host "  この行は worktree 内の .harness/$fileName にしかありません。worktree を削除する前に退避してください。" -ForegroundColor Red
  }
}

# エージェント（claude / copilot）ごとのCLI差分を吸収するアダプタ層。
# 呼び出し側はここを通して「正規化された1件の計測レコード」だけを受け取る。
. (Join-Path $RepoRoot "harness/Agents.ps1")

# --- プロジェクト固有情報の外出し（harness/project.json） ---
# 「プロジェクト名 / 設計書パス / ソースコードパス」をプロンプトから切り離し、
# 実行時に {{PROJECT_NAME}} {{DOCS_*}} {{SOURCE_*}} として差し込む。
# これによりプロンプト本体（＝プロセスの定義）がプロジェクト非依存になり、
# 別プロジェクトへ適用するときは project.json だけを差し替えればよい。
$script:ProjectCache = $null
function Get-Project {
  if ($null -eq $script:ProjectCache) {
    if (-not (Test-Path $ProjectFile)) { throw "プロジェクト定義がありません: $ProjectFile" }
    $script:ProjectCache = (Read-Utf8 $ProjectFile) | ConvertFrom-Json
  }
  $script:ProjectCache
}

# --- 実験条件の外出し（harness/experiment.json） ---
# 「どのエージェントを・どのモデルで回すか」はプロジェクト固有値ではなく**変種をまたいだ実験条件**なので
# project.json とは分ける。10サンプル取得中に変えてはいけない値だけをここに置く。
$script:ExperimentCache = $null
function Get-Experiment {
  if ($null -eq $script:ExperimentCache) {
    if (Test-Path $ExperimentFile) {
      $script:ExperimentCache = (Read-Utf8 $ExperimentFile) | ConvertFrom-Json
    } else {
      # 無くても動くが、この場合モデルはエイリアス指定（＝解決先が日をまたいで変わり得る）になり、
      # 「全サンプルが同一モデル」を主張できなくなる。本番サンプルには使わないこと。
      Write-Host "harness/experiment.json がありません。既定（agent=claude / model=sonnet）で実行します。モデルがエイリアスのため、この実行の計測値は本番データに使えません。" -ForegroundColor DarkYellow
      $script:ExperimentCache = [pscustomobject]@{
        agent  = 'claude'
        agents = [pscustomobject]@{ claude = [pscustomobject]@{ model = 'sonnet' } }
      }
    }
  }
  $script:ExperimentCache
}

# --- ハーネス自身の来歴（harness_commit / harness_dirty） ---
# 同じモデルでも、プロンプトやスクリプトを触れば結果は変わる。metrics 行にモデルだけを残しても
# 「モデルは同じなのに数値が動いた」の原因（CLI更新 / ハーネス更新）を後から切り分けられない。
# そのため実行時点の harness+skills の SHA を毎行に控える。1サンプル中は不変なのでキャッシュする。
$script:HarnessCommitCache = $null
function Get-HarnessCommit {
  if ($null -eq $script:HarnessCommitCache) {
    # git は情報を stderr に出すため、この関数内だけ非致命にする（Ensure-Commit と同じ理由）。
    $ErrorActionPreference = 'Continue'
    $sha = (git -C $RepoRoot log -1 --format=%H -- harness .claude/skills 2>$null)
    $script:HarnessCommitCache = if ($sha) { "$sha".Trim() } else { '' }
  }
  if ($script:HarnessCommitCache) { $script:HarnessCommitCache } else { $null }
}
# 未コミットの改変があると harness_commit は「実際に走ったプロンプト」を指さない（＝来歴が嘘になる）。
# 判別できるようフラグとして残す。こちらはフェーズ中に変わり得るのでキャッシュしない。
function Get-HarnessDirty {
  $ErrorActionPreference = 'Continue'
  $st = (git -C $RepoRoot status --porcelain -- harness .claude/skills 2>$null)
  [bool]("$st".Trim())
}

# 指定エージェントの設定（model / expectModel / maxTurns / maxAiCredits）を返す。未定義なら空。
function Get-AgentConfig($agent) {
  $bag = (Get-Experiment).agents
  if ($bag) {
    $p = $bag.PSObject.Properties[$agent]
    if ($p -and $p.Value) { return $p.Value }
  }
  [pscustomobject]@{}
}

# camelCase のキーを SNAKE_UPPER へ（specReviews -> SPEC_REVIEWS / e2eResults -> E2E_RESULTS）。
function ConvertTo-TokenName($name) { ($name -creplace '([A-Z])', '_$1').ToUpperInvariant() }

# project.json から「{{TOKEN}} => 値」の対応表を作る。
# トークン名は <セクション>_<キー>（例: docs.specReviews -> DOCS_SPEC_REVIEWS）。
# 値が配列の場合は `a` / `b` の形（バッククオート付き）で連結する。
function Get-ProjectTokens {
  $project = Get-Project
  if (-not $project.name) { throw "harness/project.json に 'name' がありません。" }
  $map = @{ 'PROJECT_NAME' = "$($project.name)" }
  foreach ($section in @('docs','source')) {
    $bag = $project.$section
    if (-not $bag) { throw "harness/project.json に '$section' セクションがありません。" }
    foreach ($p in $bag.PSObject.Properties) {
      $token = "$(ConvertTo-TokenName $section)_$(ConvertTo-TokenName $p.Name)"
      $map[$token] = if ($p.Value -is [System.Array]) {
        ($p.Value | ForEach-Object { "``$_``" }) -join ' / '
      } else { "$($p.Value)" }
    }
  }
  $map
}

# プロンプトのプレースホルダを解決する。
# $tokens   … 解決後に「未解決の {{...}} が残っていないか」を検査する対象（STORY など）
# $rawTokens… レビューコメント等の自由文。検査後に差し込む（本文中の {{...}} を誤検知しないため）
function Expand-Prompt($text, $tokens, $rawTokens) {
  $all = Get-ProjectTokens
  if ($tokens) { foreach ($k in $tokens.Keys) { $all[$k] = $tokens[$k] } }
  foreach ($k in $all.Keys) { $text = $text.Replace("{{$k}}", $all[$k]) }

  # 未解決のまま claude へ渡すと「literal な {{DOCS_X}}」を成果物に書かれて静かに劣化するため、ここで停止する。
  $rawNames = if ($rawTokens) { @($rawTokens.Keys) } else { @() }
  $unresolved = [regex]::Matches($text, '\{\{([A-Z0-9_]+)\}\}') |
    ForEach-Object { $_.Groups[1].Value } |
    Where-Object { $rawNames -notcontains $_ } |
    Select-Object -Unique
  if ($unresolved) {
    throw "プロンプトに未解決のプレースホルダがあります: {{$($unresolved -join '}}, {{')}}  harness/project.json を確認してください。"
  }

  if ($rawTokens) { foreach ($k in $rawTokens.Keys) { $text = $text.Replace("{{$k}}", $rawTokens[$k]) } }
  $text
}

function Load-State {
  if (-not (Test-Path $StateFile)) { return $null }
  (Read-Utf8 $StateFile) | ConvertFrom-Json
}
function Save-State($s) {
  if (-not (Test-Path $StateDir)) { New-Item -ItemType Directory -Path $StateDir -Force | Out-Null }
  $json = ($s | ConvertTo-Json -Depth 10)
  Write-Utf8 $StateFile $json
  # 中央側にもスナップショットを置く（#13）。metrics/reviews だけ残しても、どのフェーズまで
  # 進んだか・どのSHAから分岐したか（phaseBases）が分からないと後から解釈できないため。
  $sample = Get-SampleId
  if ($sample) {
    try { Write-Utf8 (Join-Path (Join-Path (Get-DataDir) "state") "$sample.json") $json }
    catch { Write-Host "中央データへの state スナップショット保存に失敗しました: $_" -ForegroundColor DarkYellow }
  }
}

function Show-Status($s) {
  if (-not $s) { Write-Host "状態なし。-Init で開始してください。"; return }
  $proc = (Read-Utf8 (Join-Path $RepoRoot "harness/processes/$($s.variant).json")) | ConvertFrom-Json
  $agent = Get-Prop $s 'agent'; if (-not $agent) { $agent = 'claude' }
  $sample = Get-SampleId; if (-not $sample) { $sample = '(不明)' }
  Write-Host "Story=$($s.story)  Variant=$($s.variant)  Sample=$sample  Agent=$agent  Status=$($s.status)"
  for ($i=0; $i -lt $proc.phases.Count; $i++) {
    $mark = if ($i -lt $s.phaseIndex) { "[x]" } elseif ($i -eq $s.phaseIndex -and $s.status -eq "awaiting-review") { "[>]" } else { "[ ]" }
    Write-Host ("  {0} {1}. {2}" -f $mark, ($i+1), $proc.phases[$i].name)
  }
  # レビューラウンド（#11）の状況。-Review の打刻漏れにその場で気づけるようにする。
  $gatePhase = Get-Prop $s 'gatePhaseId'
  if ($gatePhase -and -not (Get-Prop $s 'roundClosed')) {
    $mark = if (Get-Prop $s 'pendingReviewId') { "打刻済み" } else { "未打刻（-Review で開始してください）" }
    Write-Host ("  レビュー: phase={0} round={1} 開始={2}" -f $gatePhase, (Get-Prop $s 'reviewRound'), $mark) -ForegroundColor DarkGray
  }
  # 計測データの保存先（#13）。worktree を消す前にここへ揃っているかを確認できるようにする。
  Write-Host ("  計測データ: {0}  （worktree ローカル: {1}）" -f (Get-DataDir), $StateDir) -ForegroundColor DarkGray
}

# オブジェクト(Init時はordered hashtable / ロード後はPSCustomObject)双方にプロパティを設定/追加する。
function Set-Prop($obj, $name, $value) {
  if ($obj -is [System.Collections.IDictionary]) { $obj[$name] = $value }
  else { $obj | Add-Member -NotePropertyName $name -NotePropertyValue $value -Force }
  $obj
}
# 同上の読み出し版。未設定なら $null（旧サンプルの state.json には無いキーがあるため必須）。
function Get-Prop($obj, $name) {
  if ($obj -is [System.Collections.IDictionary]) {
    if ($obj.Contains($name)) { return $obj[$name] } else { return $null }
  }
  $p = $obj.PSObject.Properties[$name]
  if ($p) { $p.Value } else { $null }
}

# --- フェーズごとのベースSHA（巻き戻し先）を state に記録/参照する ---
# フェーズ実行の直前に「その時点のHEAD」を控えておき、-Rollback でここへ reset --hard する。
# state は Init時=ordered hashtable / ロード後=PSCustomObject の両方があり得るため、
# 入れ物(phaseBases)は常に PSCustomObject に統一して id→sha を持つ（id にはハイフンを含む）。
function Get-PhaseBasesBag($s) {
  $has = if ($s -is [System.Collections.IDictionary]) { $s.Contains('phaseBases') } else { [bool]$s.PSObject.Properties['phaseBases'] }
  if (-not $has) { Set-Prop $s 'phaseBases' ([pscustomobject]@{}) | Out-Null }
  if ($s -is [System.Collections.IDictionary]) { $s['phaseBases'] } else { $s.phaseBases }
}
function Set-PhaseBase($s, $phaseId, $sha) {
  (Get-PhaseBasesBag $s) | Add-Member -NotePropertyName $phaseId -NotePropertyValue $sha -Force
}
function Get-PhaseBase($s, $phaseId) {
  $bag = Get-PhaseBasesBag $s
  $p = $bag.PSObject.Properties[$phaseId]
  if ($p) { $p.Value } else { $null }
}

# 巻き戻しで破棄したフェーズの行に rolled_back=true を付ける（削除はしない）。
# 成果③のばらつき計測を「やり直し込みの追記ログ」として監査可能に保つため。
# metrics.jsonl / reviews.jsonl は「1行1JSON・phase 列を持つ」点が共通なので同じ処理で扱える。
#
# $sample を渡すと、そのサンプルの行だけを対象にする（中央ファイル用）。
# 中央ファイルは全サンプルの行が混在するため、phase だけで突き合わせると
# **別サンプルの生きた行まで rolled_back にしてしまう**。
# なお中央ファイルは追記のみ並列安全で、この関数だけは全文の読み書きになる。
# サンプルを逐次実行する限り問題ないが、並列実行に踏み切る場合はここに排他が要る（改善計画 #21 参照）。
function Set-RolledBackRows($file, $phaseIds, $sample) {
  if (-not (Test-Path $file)) { return }
  $lines = [System.IO.File]::ReadAllLines($file, [System.Text.Encoding]::UTF8)
  $out = New-Object System.Collections.Generic.List[string]
  $tagged = 0
  foreach ($ln in $lines) {
    if (-not $ln.Trim()) { continue }
    $m = $null; try { $m = $ln | ConvertFrom-Json } catch { $out.Add($ln); continue }
    if ($sample -and $m.sample -ne $sample) { $out.Add($ln); continue }
    if (($phaseIds -contains $m.phase) -and -not $m.rolled_back) {
      $m | Add-Member -NotePropertyName rolled_back -NotePropertyValue $true -Force
      $out.Add(($m | ConvertTo-Json -Compress)); $tagged++
    } else { $out.Add($ln) }
  }
  [System.IO.File]::WriteAllLines($file, $out, $Utf8NoBom)
  if ($tagged -gt 0) {
    Write-Host "$(Split-Path $file -Leaf): $tagged 件を rolled_back=true でタグ付けしました。" -ForegroundColor DarkGray
  }
}

# エージェント実行 + メトリクス記録の共通ランナー（通常フェーズと修正フェーズで共用）。
#
# エージェント（claude / copilot）ごとのCLI差分は Agents.ps1 の Invoke-Agent に閉じ込めてあり、
# ここへは**正規化済みの1件の計測レコード**が返る。したがってどちらのエージェントで回しても
# metrics.jsonl の列と定義は完全に同一になる（harness/measurement_parity.md）。
#
# 主指標（duration_ms / num_turns / tool_calls）はハーネス側の計測値。
# エージェント申告値は agent_* / api_* に併記し、突合用にとどめる。
# コストは通貨が揃わない（Claude=USD / Copilot=AIクレジット）ため cost_native + cost_unit で
# 生値のまま残す。エージェントをまたいだ比較にはトークン量を使うこと。
function Run-Agent($prompt, $phaseId, $variant, $story, $agent, $permission) {
  $cfg        = Get-AgentConfig $agent
  $overridden = [bool]$Model                       # -Model による明示上書き = 実験条件からの意図的な逸脱
  # 変数名を $Model と変えているのは意図的。PowerShell の変数名は大文字小文字を区別しないため、
  # $model へ代入するとスクリプトパラメータ $Model をこの関数内で上書きしてしまう。
  $useModel   = if ($overridden) { $Model } else { $cfg.model }
  $limits     = @{ maxTurns = $cfg.maxTurns; maxAiCredits = $cfg.maxAiCredits }

  if ($overridden) {
    Write-Host "-Model '$Model' で experiment.json のモデル指定を上書きしています。このフェーズは実験条件外です（metrics に model_overridden=true が入ります）。本番サンプルの分布に混ぜないこと。" -ForegroundColor DarkYellow
  }

  $r = Invoke-Agent -Agent $agent -Prompt $prompt -Model $useModel -Permission $permission -Limits $limits

  # メトリクス追記（成果③のばらつき検証／成果①のリワークコスト計測の土台）
  $metric = [ordered]@{
    ts                 = (Get-Date).ToString("o")
    story              = $story
    variant            = $variant
    sample             = Get-SampleId              # 同一 variant の行を集計時に区別するキー（#13）
    phase              = $phaseId
    agent              = $r.agent
    agent_version      = $r.agent_version
    model              = $r.model                 # 実行時に解決された実体
    model_requested    = $useModel                # CLI へ渡した値（エイリアスの場合がある）
    model_overridden   = $overridden              # -Model で experiment.json を上書きしたか
    harness_commit     = Get-HarnessCommit        # 実行時の harness/ + .claude/skills の SHA
    harness_dirty      = Get-HarnessDirty         # true なら上記SHAは実際に走った内容と一致しない
    permission         = $permission
    is_error           = $r.is_error
    duration_ms        = $r.duration_ms           # ★ハーネス計測（主指標）
    agent_duration_ms  = $r.agent_duration_ms     # ◆エージェント申告
    api_duration_ms    = $r.api_duration_ms       # ◆
    num_turns          = $r.num_turns             # ★ハーネス計測
    agent_num_turns    = $r.agent_num_turns       # ◆
    tool_calls         = $r.tool_calls            # ★ハーネス計測
    input_tokens       = $r.input_tokens           # キャッシュに載らなかった入力
    total_input_tokens = $r.total_input_tokens     # input + cache_read + cache_write
    output_tokens      = $r.output_tokens
    cache_read_tokens  = $r.cache_read_tokens
    cache_write_tokens = $r.cache_write_tokens
    cost_native        = $r.cost_native
    cost_unit          = $r.cost_unit
    premium_requests   = $r.premium_requests
    session_id         = $r.session_id
  }
  Add-DataRow $MetricsName $metric

  # 実験条件の検証: 実際に使われたモデルが期待値と違うなら、気づかず走り切る前にここで止める。
  # 検証は**メトリクス追記の後**に行う。ここで先に throw すると「どのモデルで走ったのか」の
  # 記録ごと消えてしまい、原因（エイリアスの解決先変更 / CLI更新）を後から追えなくなる。
  # -Model による上書きは「承知のうえの逸脱」なので止めない（model_overridden で判別できる）。
  if (-not $overridden -and $cfg.expectModel -and $r.model -and $r.model -ne $cfg.expectModel) {
    throw "モデル不一致: 期待=$($cfg.expectModel) 実際=$($r.model)  実験条件が変わっています（このフェーズの metrics 行は記録済み。experiment.json を確認し、必要なら -Rollback してください）。"
  }

  if ($r.is_error) {
    # 失敗理由を即表示する。握り潰すと実エラー(例: "Stream idle timeout")が
    # トランスクリプトを掘るまで分からない。
    throw "フェーズ '$phaseId' が異常終了しました: $($r.error_detail)  手動確認してください。"
  }
  $cost = if ($null -ne $r.cost_native) { "{0} {1}" -f [math]::Round($r.cost_native, 4), $r.cost_unit } else { "n/a" }
  Write-Host ("完了: 経過 {0:mm\:ss} / turns={1} tools={2} tokens(in/out)={3}/{4} cost={5}" -f `
    ([timespan]::FromMilliseconds($r.duration_ms)), $r.num_turns, $r.tool_calls, `
    $r.input_tokens, $r.output_tokens, $cost) -ForegroundColor Green
}

function Invoke-Phase($phase, $variant, $story, $agent) {
  $promptPath = Join-Path $RepoRoot "harness/prompts/$variant/$($phase.prompt)"
  if (-not (Test-Path $promptPath)) { throw "プロンプト未定義: $promptPath" }
  $prompt = Expand-Prompt (Read-Utf8 $promptPath) @{ 'STORY' = $story }

  $permission = if ($Unattended) { "all" } else { "edit" }
  Write-Host "`n=== フェーズ実行: $($phase.name)  (agent: $agent, skill: $($phase.skill), perm: $permission) ===" -ForegroundColor Cyan
  Run-Agent $prompt $phase.id $variant $story $agent $permission
}

# PR番号を現在ブランチから引く（無ければ $null）。
function Get-PrNumber {
  $ErrorActionPreference = 'Continue'
  $branch = (git rev-parse --abbrev-ref HEAD).Trim()
  (gh pr list --head $branch --json number --jq ".[0].number" 2>$null)
}

# ===========================================================================
#  人手レビュー時間の計測（改善計画 #11 / レビュー対象数 #15）
# ---------------------------------------------------------------------------
#  壁時計時間（ゲート開閉の差分や -Continue を叩いた時刻）は「実験者がいつPCの前に
#  座ったか」であってレビュー時間ではない。そこで**両端をGitHubのサーバ打刻**にする:
#
#    開始 = -Review が作る空のPENDINGレビューの createdAt
#    終了 = 実験者が「Submit review」した submittedAt
#
#  指摘ゼロでも開始時刻が残り、読み込み時間も計測範囲に入る。値はローカルPCの時計にも
#  コマンドを叩いた時刻にも依存しない第三者記録になる。
# ===========================================================================

# ハーネスがPENDINGレビューを作るときに使うマーカー。
# body 空での作成は 2026-08-10 時点で通る（PR #3 で実測）ため通常は使わない。
# 将来 API 側で拒否された場合のフォールバック用。レビュー本文としてAIに渡らないよう
# Get-ReviewComments 側で除去する。
$ReviewMarker = '<!-- harness:review-start -->'

# ISO8601（GitHubは "…Z" / ハーネスは "+09:00"）を UTC の DateTime に正規化する。
# 減算前に必ずこれを通すこと（混ぜると9時間ずれる）。
function ConvertTo-Utc($s) {
  if (-not $s) { return $null }
  ([datetime]::Parse("$s", [System.Globalization.CultureInfo]::InvariantCulture,
    [System.Globalization.DateTimeStyles]::RoundtripKind)).ToUniversalTime()
}

# ===========================================================================
#  サンプルID（改善計画 #13-1）
# ---------------------------------------------------------------------------
#  metrics 行が持つのは story + variant だけだったため、**同一 variant の10サンプルを
#  中央ファイルへマージすると行を区別できない**（＝ばらつき検証が成立しない）。
#  そこで -Init 時に確定させて state.json に持たせ、全行へ載せる。
#  本機能の導入前に開始したサンプルには state に無いので、ブランチ名から導出する。
# ===========================================================================
function Get-SampleIdFromBranch {
  $ErrorActionPreference = 'Continue'
  $branch = "$(git rev-parse --abbrev-ref HEAD)".Trim()
  if ($branch -match '^sample/[^/]+/(.+)$') { $Matches[1] } else { $null }
}
# 記録時に毎回 git を叩かないよう、確定したIDはスクリプトスコープに保持する。
$script:SampleId = $null
function Get-SampleId { $script:SampleId }
function Resolve-SampleId($s) {
  $v = if ($s) { Get-Prop $s 'sample' } else { $null }
  if (-not $v) { $v = Get-SampleIdFromBranch }
  $script:SampleId = $v
  $v
}

# レビュー対象数（#15）: フェーズのベースSHA→HEAD の diff 規模。
# バイナリファイルは numstat が '-' を返すので行数には数えない（ファイル数には数える）。
function Get-DiffStats($base) {
  if (-not $base) { return $null }
  $ErrorActionPreference = 'Continue'
  $lines = @(git diff --numstat $base HEAD 2>$null)
  if ($LASTEXITCODE -ne 0) { return $null }
  $files = 0; $added = 0; $deleted = 0
  foreach ($ln in $lines) {
    if (-not "$ln".Trim()) { continue }
    $p = "$ln" -split "`t"
    $files++
    if ($p[0] -ne '-') { $added   += [int]$p[0] }
    if ($p[1] -ne '-') { $deleted += [int]$p[1] }
  }
  [pscustomobject]@{ files = $files; added = $added; deleted = $deleted }
}

# PRのレビューを「1レビュー = 1セッション」に正規化して返す（GraphQL 1コール）。
# REST だと /reviews と /comments を pull_request_review_id で突き合わせる必要があるうえ、
# **createdAt（＝レビュー開始）が REST のレビューオブジェクトには無い**ため GraphQL を使う。
# 戻り値: @{ Viewer = ログイン名; Sessions = セッション配列 }  取得失敗時は $null。
$ReviewQuery = 'query($owner:String!,$repo:String!,$pr:Int!){ viewer{login} repository(owner:$owner,name:$repo){ pullRequest(number:$pr){ reviews(first:50){ nodes{ databaseId state body createdAt submittedAt author{login} comments(first:100){ nodes{ databaseId createdAt replyTo{databaseId} } } } } } } }'
function Get-ReviewSessions($prNumber) {
  $ErrorActionPreference = 'Continue'
  $raw = (gh api graphql -F owner=':owner' -F repo=':repo' -F pr=$prNumber -f query=$ReviewQuery 2>$null)
  if ($LASTEXITCODE -ne 0 -or -not $raw) {
    Write-Host "GitHubからレビュー情報を取得できませんでした（gh未認証／ネットワーク）。" -ForegroundColor DarkYellow
    return $null
  }
  $data = ($raw | ConvertFrom-Json).data
  $sessions = New-Object System.Collections.ArrayList
  foreach ($r in @($data.repository.pullRequest.reviews.nodes)) {
    $comments = @($r.comments.nodes)
    $human    = @($comments | Where-Object { -not $_.replyTo })
    $body     = "$($r.body)".Replace($ReviewMarker, '').Trim()
    # ハーネスの自動返信（Publish-CommentReplies）だけで構成されたレビューを人間のレビューと
    # 数えると、件数も時刻も汚染される。replyTo 付きコメントしか持たないレビューは除外する。
    if ($comments.Count -gt 0 -and $human.Count -eq 0 -and -not $body) { continue }
    $first = if ($human.Count -gt 0) {
      (@($human) | Sort-Object { ConvertTo-Utc $_.createdAt } | Select-Object -First 1).createdAt
    } else { $null }
    [void]$sessions.Add([pscustomobject]@{
      ReviewId       = $r.databaseId
      State          = $r.state
      Author         = $r.author.login
      CreatedAt      = $r.createdAt      # PENDING を作った瞬間（＝レビュー開始）
      SubmittedAt    = $r.submittedAt    # Submit review（＝レビュー終了）。PENDING中は null
      FirstCommentAt = $first
      Comments       = $human.Count
      IsMine         = ($r.author.login -eq $data.viewer.login)
    })
  }
  [pscustomobject]@{ Viewer = $data.viewer.login; Sessions = $sessions.ToArray() }
}

# 自分の未提出（PENDING）レビュー。PENDINGは本人のトークンでのみ見える。
function Get-MyPendingReview($res) {
  if (-not $res) { return $null }
  @($res.Sessions | Where-Object { $_.IsMine -and -not $_.SubmittedAt }) | Select-Object -First 1
}

# 空のPENDINGレビューを作る。event を付けなければ提出されずPENDINGのまま残り、
# その瞬間が createdAt としてサーバ打刻される。
function New-PendingReview($prNumber) {
  $ErrorActionPreference = 'Continue'
  $out = (gh api --method POST "repos/{owner}/{repo}/pulls/$prNumber/reviews" 2>&1)
  if ($LASTEXITCODE -ne 0) {
    # body 空が拒否される場合のフォールバック（マーカーはAIへ渡す前に除去される）。
    $out = (gh api --method POST "repos/{owner}/{repo}/pulls/$prNumber/reviews" -f "body=$ReviewMarker" 2>&1)
    if ($LASTEXITCODE -ne 0) { throw "PENDINGレビューを作成できませんでした: $out" }
    Write-Host "（body空での作成が拒否されたため、マーカー付きで作成しました）" -ForegroundColor DarkGray
  }
  ($out | ConvertFrom-Json)
}

# ラウンドの開始打刻。ゲート停止時と -Revise の push 完了時に呼ぶ。
# diff規模（#15）もここで控える。以降 -Review / -Continue / -Revise はこの情報を使う。
function Start-ReviewRound($s, $phaseId) {
  # ラウンド番号はゲート（フェーズ）ごとに1から数える。同じフェーズの -Revise でのみ増える。
  $prev = if ((Get-Prop $s 'gatePhaseId') -eq $phaseId) { [int](Get-Prop $s 'reviewRound') } else { 0 }
  $s = Set-Prop $s 'gatePhaseId'     $phaseId
  $s = Set-Prop $s 'gateOpenedAt'    ((Get-Date).ToString("o"))
  $s = Set-Prop $s 'reviewRound'     ($prev + 1)
  $s = Set-Prop $s 'pendingReviewId' $null      # 前ラウンドのPENDINGは持ち越さない
  $s = Set-Prop $s 'roundClosed'     $false
  $s = Set-Prop $s 'gateCleared'     $false
  $stats = Get-DiffStats (Get-PhaseBase $s $phaseId)
  $s = Set-Prop $s 'gateDiff' $stats
  $s
}

# Submit し忘れたまま次へ進むと submittedAt が付かずラウンドが閉じない（＝欠測）。
# -Continue / -Revise の直前に必ず呼び、残っていたら進ませない。
# 計測対象のラウンドが開いているときだけ検査する（本機能の導入前に開始したサンプルや
# -Rollback 直後は、残っているPENDINGを理由に足止めしても得るものが無い）。
function Assert-RoundSubmitted($s) {
  if (-not (Get-Prop $s 'gatePhaseId')) { return }
  if (Get-Prop $s 'roundClosed') { return }
  Assert-NoPendingReview (Get-PrNumber)
}
function Assert-NoPendingReview($prNumber) {
  if (-not $prNumber) { return }
  $pending = Get-MyPendingReview (Get-ReviewSessions $prNumber)
  if ($pending) {
    throw @"
未提出（PENDING）のレビューが残っています。レビュー時間の終端が打刻されないため中断しました。
  PR #$prNumber をブラウザで開き、「Submit review」（自分のPRなので Comment）を実行してから
  同じコマンドを叩き直してください。指摘ゼロの場合もそのまま Submit すれば計測できます。
  PRを開く: gh pr view $prNumber --web
"@
  }
}

# 1レビューラウンドを reviews.jsonl へ1行追記する（-Continue / -Revise の直前に呼ぶ）。
# outcome は review.state からは決まらない（自分のPRは Approve / Request changes ができず
# 常に COMMENTED になる）ため、**実験者が叩いたコマンド**から決める。
function Write-ReviewRound($s, $outcome) {
  $phaseId  = Get-Prop $s 'gatePhaseId'
  $openedAt = Get-Prop $s 'gateOpenedAt'
  # ゲート情報が無い＝本機能の導入前に開いたゲート、または -Rollback 直後（ラウンド未開始）。
  if (-not $phaseId -or -not $openedAt) { return $s }
  if (Get-Prop $s 'roundClosed') { return $s }

  $prNumber = Get-PrNumber
  $res      = if ($prNumber) { Get-ReviewSessions $prNumber } else { $null }

  # このラウンドのセッション = ゲートを開いた後に提出されたレビュー。
  $rounds = @()
  if ($res) {
    $gateUtc = ConvertTo-Utc $openedAt
    $rounds  = @($res.Sessions | Where-Object { $_.SubmittedAt -and (ConvertTo-Utc $_.SubmittedAt) -ge $gateUtc })
  }

  # 開始打刻の由来を決める（pending-review > first-comment > missing）。
  $pendingId = Get-Prop $s 'pendingReviewId'
  $primary   = $null
  $source    = 'missing'
  $startAt   = $null
  if ($pendingId) { $primary = @($rounds | Where-Object { $_.ReviewId -eq $pendingId }) | Select-Object -First 1 }
  if ($primary) {
    $source = 'pending-review'; $startAt = $primary.CreatedAt
  } elseif ($rounds.Count -gt 0) {
    # -Review を忘れた回。下書きがあれば旧定義（初回コメント起点）へ落とす＝過小評価だが捏造はしない。
    $primary = @($rounds | Sort-Object { ConvertTo-Utc $_.SubmittedAt }) | Select-Object -First 1
    if ($primary.FirstCommentAt) { $source = 'first-comment'; $startAt = $primary.FirstCommentAt }
  }

  $reviewMs = $null; $readMs = $null; $writeMs = $null; $latencyMs = $null
  if ($primary) {
    $submitted = ConvertTo-Utc $primary.SubmittedAt
    $latencyMs = [long](($submitted - (ConvertTo-Utc $openedAt)).TotalMilliseconds)
    if ($startAt) {
      $reviewMs = [long](($submitted - (ConvertTo-Utc $startAt)).TotalMilliseconds)
      if ($source -eq 'pending-review' -and $primary.FirstCommentAt) {
        $fc      = ConvertTo-Utc $primary.FirstCommentAt
        $readMs  = [long](($fc - (ConvertTo-Utc $startAt)).TotalMilliseconds)
        $writeMs = [long](($submitted - $fc).TotalMilliseconds)
      } elseif ($source -eq 'first-comment') {
        # 起点が初回コメントなので読み込み時間は取れない（0ではなく欠測）。
        $writeMs = $reviewMs
      }
    }
  }

  $diff     = Get-Prop $s 'gateDiff'
  $comments = if ($rounds.Count -gt 0) { [int](($rounds | Measure-Object -Property Comments -Sum).Sum) } else { $null }
  $prCol    = if ($prNumber) { [int]$prNumber } else { $null }
  $row = [ordered]@{
    ts                 = (Get-Date).ToString("o")
    story              = $s.story
    variant            = $s.variant
    sample             = Get-SampleId
    phase              = $phaseId
    round              = [int](Get-Prop $s 'reviewRound')
    pr                 = $prCol
    review_id          = $primary.ReviewId
    review_state       = $primary.State
    gate_opened_at     = $openedAt
    review_opened_at   = $startAt
    first_comment_at   = $primary.FirstCommentAt
    submitted_at       = $primary.SubmittedAt
    continued_at       = $script:CommandStartedAt      # ラウンドを閉じるコマンドを叩いた時刻
    review_ms          = $reviewMs                     # ★主指標（両端ともGitHubサーバ時刻）
    read_ms            = $readMs                       # 参考: 読み込み時間
    write_ms           = $writeMs                      # 参考: 旧#11定義（感度分析用）
    latency_ms         = $latencyMs                    # 参考: 承認ラグ
    outcome            = $outcome                      # continue / revise / skip
    review_time_source = $source                       # pending-review / first-comment / missing
    comments           = $comments                     # 人間の指摘件数（自動返信を除外済み）
    diff_files         = $diff.files                   # 以下 レビュー対象数（#15）
    diff_added         = $diff.added
    diff_deleted       = $diff.deleted
  }
  Add-DataRow $ReviewsName $row

  $shown = if ($null -ne $reviewMs) { "{0:mm\:ss}" -f [timespan]::FromMilliseconds($reviewMs) } else { "欠測" }
  Write-Host ("レビュー記録: round={0} phase={1} review_ms={2} ({3}) comments={4} outcome={5}" -f `
    $row.round, $phaseId, $shown, $source, $row.comments, $outcome) -ForegroundColor DarkGray
  if ($source -eq 'missing') {
    Write-Host "  ※このラウンドはレビュー時間が欠測（review_ms=null）です。次回は -Review でPRを開いてください。" -ForegroundColor DarkYellow
  }

  Set-Prop $s 'roundClosed' $true
}

# $since(ISO時刻/未指定可)以降に付いたレビューコメントを収集して配列で返す。
# 各要素は参照タグ(C1..Cn)付き。収集対象: レビュー要約 / 会話コメント / 差分行のインラインコメント。
function Get-ReviewComments($prNumber, $since) {
  $ErrorActionPreference = 'Continue'
  $sinceDt = if ($since) { [datetime]::Parse($since) } else { [datetime]::MinValue }
  $items = New-Object System.Collections.ArrayList

  $reviews = (gh pr view $prNumber --json reviews --jq ".reviews" 2>$null) | ConvertFrom-Json
  if ($reviews) { foreach ($r in $reviews) {
    # ハーネスが -Review で作ったPENDINGレビューのマーカーは指摘ではない。除去し、
    # 残りが空なら収集しない（＝AIへ渡らず、無意味な -Revise ラウンドを発生させない）。
    $body = "$($r.body)".Replace($ReviewMarker, '').Trim()
    if ($body -and [datetime]::Parse($r.submittedAt) -gt $sinceDt) {
      [void]$items.Add([pscustomobject]@{ Kind='review'; Id=$r.id; Author=$r.author.login; Body=$body; Loc="レビュー/$($r.state)" })
    }
  }}

  $comments = (gh pr view $prNumber --json comments --jq ".comments" 2>$null) | ConvertFrom-Json
  if ($comments) { foreach ($c in $comments) {
    if ([datetime]::Parse($c.createdAt) -gt $sinceDt) {
      [void]$items.Add([pscustomobject]@{ Kind='issue'; Id=$c.id; Author=$c.author.login; Body=$c.body; Loc="コメント" })
    }
  }}

  $inline = (gh api "repos/{owner}/{repo}/pulls/$prNumber/comments" 2>$null) | ConvertFrom-Json
  if ($inline) { foreach ($c in $inline) {
    if ([datetime]::Parse($c.created_at) -gt $sinceDt) {
      [void]$items.Add([pscustomobject]@{ Kind='inline'; Id=$c.id; Author=$c.user.login; Body=$c.body; Loc="差分 $($c.path):$($c.line)" })
    }
  }}

  for ($i=0; $i -lt $items.Count; $i++) { $items[$i] | Add-Member -NotePropertyName Ref -NotePropertyValue ("C{0}" -f ($i+1)) -Force }
  ,$items.ToArray()
}

# 収集済みコメント配列を、プロンプト注入用のmarkdown箇条書き(参照タグ付き)に整形する。
function Build-CommentMarkdown($items) {
  $sb = New-Object System.Text.StringBuilder
  foreach ($it in $items) { [void]$sb.AppendLine("- [$($it.Ref)][$($it.Loc)] @$($it.Author): $($it.Body)") }
  $sb.ToString().Trim()
}

# Skillが出力した回答ファイル(JSON: [{ref, reply}, ...])を読み、対応するコメントへPR上で返信する。
# インラインコメントはスレッド返信、それ以外はPR会話コメントとして投稿。失敗しても致命扱いしない。
function Publish-CommentReplies($prNumber, $items, $respPath) {
  $ErrorActionPreference = 'Continue'
  if (-not (Test-Path $respPath)) {
    Write-Host "回答ファイルが見つかりません($respPath)。PRへの自動回答をスキップします。" -ForegroundColor DarkYellow
    return
  }
  $responses = $null
  try { $responses = (Read-Utf8 $respPath) | ConvertFrom-Json } catch {
    Write-Host "回答ファイルのJSON解析に失敗。自動回答をスキップ: $_" -ForegroundColor DarkYellow; return
  }
  if (-not $responses) { return }

  $tmp = Join-Path $env:TEMP ("ghreply-{0}.md" -f ([guid]::NewGuid().ToString('N')))
  foreach ($resp in $responses) {
    $item = $items | Where-Object { $_.Ref -eq $resp.ref } | Select-Object -First 1
    if (-not $item)      { Write-Host "  未知の参照 '$($resp.ref)' をスキップ" -ForegroundColor DarkYellow; continue }
    if (-not $resp.reply) { continue }

    $posted = $false
    if ($item.Kind -eq 'inline' -and $item.Id) {
      Write-Utf8 $tmp $resp.reply
      gh api --method POST "repos/{owner}/{repo}/pulls/$prNumber/comments/$($item.Id)/replies" -F "body=@$tmp" 2>$null | Out-Null
      if ($LASTEXITCODE -eq 0) { $posted = $true }
    }
    if (-not $posted) {
      $quote = ($item.Body -split "`n")[0]
      Write-Utf8 $tmp ("> [$($item.Loc)] @$($item.Author): $quote`n`n$($resp.reply)")
      gh pr comment $prNumber --body-file $tmp 2>$null | Out-Null
      if ($LASTEXITCODE -ne 0) { Write-Host "  返信投稿に失敗: $($resp.ref)" -ForegroundColor DarkYellow; continue }
    }
    Write-Host "  回答を投稿: $($resp.ref) → @$($item.Author)" -ForegroundColor Green
  }
  Remove-Item $tmp -ErrorAction SilentlyContinue
}

# 直前フェーズの成果物に対するレビュー指摘を、固定プロンプト(99-revise.md)に注入して再実行する。
# 反映すべき新規コメントが無ければ $null。ありなら { PrNumber, Items, RespPath } を返す
# （PRへの返信投稿は push 後に呼び出し側で行う）。
function Invoke-Revise($phase, $variant, $story, $since, $agent) {
  $prNumber = Get-PrNumber
  if (-not $prNumber) { throw "PRが見つかりません。ゲートでPRが作成されているか確認してください。" }

  $items = Get-ReviewComments $prNumber $since
  if (-not $items -or $items.Count -eq 0) {
    Write-Host "前回の出力以降に反映すべきレビューコメントがありません。修正をスキップします。" -ForegroundColor DarkYellow
    return $null
  }
  $commentsMd = Build-CommentMarkdown $items
  Write-Host "`n--- 反映するレビューコメント ---" -ForegroundColor DarkCyan
  Write-Host $commentsMd
  Write-Host "-------------------------------" -ForegroundColor DarkCyan

  # Skillはこのパスに [{ref, reply}] 形式で回答を書き出す（スクリプトが読んでPRへ返信）。
  $respRel  = "$((Get-Project).docs.reviewResponses)/response-$story.json"
  $respPath = Join-Path $RepoRoot $respRel
  if (Test-Path $respPath) { Remove-Item $respPath -Force }  # 前ラウンドの回答を残さない

  $promptPath = Join-Path $RepoRoot "harness/prompts/$variant/99-revise.md"
  if (-not (Test-Path $promptPath)) { throw "修正プロンプト未定義: $promptPath" }
  # レビューコメントは自由文なので、未解決プレースホルダ検査の対象外（第3引数）として最後に差し込む。
  $prompt = Expand-Prompt (Read-Utf8 $promptPath) `
    @{ 'STORY' = $story; 'PHASE_NAME' = $phase.name; 'SKILL' = $phase.skill; 'RESPONSE_FILE' = $respRel } `
    @{ 'REVIEW_COMMENTS' = $commentsMd }

  $permission = if ($Unattended) { "all" } else { "edit" }
  Write-Host "`n=== 修正フェーズ: $($phase.name)  (agent: $agent, skill: $($phase.skill), perm: $permission) ===" -ForegroundColor Cyan
  Run-Agent $prompt "$($phase.id)-revise" $variant $story $agent $permission

  [pscustomobject]@{ PrNumber = $prNumber; Items = $items; RespPath = $respPath }
}

function Ensure-Commit($phase, $story) {
  # フェーズの成果物をスクリプト側で確実にコミットする。
  # acceptEdits ではエージェントがBash(git commit)を実行できず未コミットになるため、
  # ここで担保する。エージェントが既にコミット済みなら差分ゼロでスキップ（冪等）。
  #
  # 注: Windows PowerShell 5.1 では ErrorActionPreference=Stop 下で native コマンド(git)の
  # stderr を 2>$null 等で扱うと、stderr 出力(例: core.autocrlf=true による
  # "LF will be replaced by CRLF" 警告)が NativeCommandError の終了エラーに化けて
  # スクリプトが停止する。この関数内だけ Continue にして警告を非致命扱いにする。
  $ErrorActionPreference = 'Continue'
  git add -A 2>&1 | Out-Null
  $staged = (git diff --cached --name-only)
  if (-not $staged) {
    Write-Host "コミット対象の変更なし（既にコミット済み）。" -ForegroundColor DarkGray
    return
  }
  git commit -m "[$story] $($phase.id)" 2>&1 | Out-Null
  Write-Host "成果物をコミットしました: [$story] $($phase.id)" -ForegroundColor Yellow
}

function Ensure-PR($s) {
  # 現在ブランチをpushし、PRが無ければ作成。以降のフェーズは同一PRへ積み上げ。
  # git/gh は進捗やヒントを stderr に出すため、Ensure-Commit と同様に局所的に Continue にする。
  $ErrorActionPreference = 'Continue'
  $branch = (git rev-parse --abbrev-ref HEAD).Trim()
  git push -u origin $branch 2>&1 | Out-Null
  $existing = (gh pr list --head $branch --json number --jq ".[0].number" 2>$null)
  if (-not $existing) {
    gh pr create --fill --title "[$($s.story)/$($s.variant)] user story" `
      --body "検証用ユーザーストーリー実装。各フェーズ末でレビューゲート停止します。" 2>&1 | Out-Null
    Write-Host "PRを作成しました。" -ForegroundColor Yellow
  } else {
    Write-Host "既存PR #$existing に反映しました。" -ForegroundColor Yellow
  }
}

# ---- メイン ----
# reviews.jsonl の continued_at に使う。実処理（-Revise のAI実行など）を挟んでから記録するため、
# 「実験者が次の操作を叩いた時刻」をここで先に控えておく。
$script:CommandStartedAt = (Get-Date).ToString("o")
$state = Load-State

if ($Status) { Resolve-SampleId $state | Out-Null; Show-Status $state; return }

if ($Init) {
  if (-not $Story) { throw "-Init には -Story が必要です。" }
  # エージェントはサンプル開始時に確定させ、以降のフェーズは同じもので回す。
  # 途中で切り替わると、そのサンプルの計測値が2つのエージェントの混合になってしまうため。
  $initAgent = if ($Agent) { $Agent } elseif ((Get-Experiment).agent) { (Get-Experiment).agent } else { 'claude' }
  # サンプルIDもここで確定させる（#13）。Start-Sample.ps1 が -Sample を渡す。
  # 直接 -Init した場合はブランチ名から導出し、それも取れなければ null（＝集計時に区別不能）。
  $initSample = if ($Sample) { $Sample } else { Get-SampleIdFromBranch }
  if (-not $initSample) {
    Write-Host "サンプルIDを決定できません（-Sample 未指定、ブランチ名も sample/<story>/<sample> 形式ではない）。metrics/reviews の行が集計時に区別できないため、本番サンプルでは Start-Sample.ps1 から開始してください。" -ForegroundColor DarkYellow
  }
  $state = [ordered]@{
    story=$Story; variant=$Variant; agent=$initAgent
    sample=$initSample
    sampleIndex=$(if ($SampleIndex -gt 0) { $SampleIndex } else { $null })
    phaseIndex=0; status="ready"
  }
}
if (-not $state) { throw "状態がありません。まず -Init で開始してください。" }

# 以降の記録（metrics / reviews / state スナップショット）が使うサンプルIDを確定させる。
Resolve-SampleId $state | Out-Null
if ($Sample -and -not $Init -and $Sample -ne (Get-SampleId)) {
  throw "このサンプルは sample=$(Get-SampleId) で開始されています。-Sample $Sample への途中変更はできません（記録が2つのIDに割れるため）。"
}

# 実行エージェントは state.json（サンプル開始時に確定）を正とする。
# 本機能の導入前に開始したサンプルには agent が無いため、その場合は claude とみなす。
$RunAgent = Get-Prop $state 'agent'
if (-not $RunAgent) { $RunAgent = 'claude' }
if ($Agent -and $Agent -ne $RunAgent) {
  throw "このサンプルは agent=$RunAgent で開始されています。-Agent $Agent への途中変更はできません（計測値が混合するため）。新しいサンプルを開始してください。"
}

$proc = (Read-Utf8 (Join-Path $RepoRoot "harness/processes/$($state.variant).json")) | ConvertFrom-Json

# --- レビュー開始: 空のPENDINGレビューを作り（＝開始のサーバ打刻）、PRをブラウザで開く ---
if ($Review) {
  $gatePhase = Get-Prop $state 'gatePhaseId'
  if (-not $gatePhase) {
    Write-Host "レビュー待ちのゲートがありません（status=$($state.status)）。フェーズを実行してゲートで停止してから使ってください。"
    return
  }
  $prNumber = Get-PrNumber
  if (-not $prNumber) { throw "PRが見つかりません。ゲートでPRが作成されているか確認してください。" }

  $res     = Get-ReviewSessions $prNumber
  $pending = Get-MyPendingReview $res
  if ($pending) {
    # 冪等: 既にPENDINGがあるなら作り直さない。作り直すと開始打刻が後ろへずれ、下書きも消える。
    Write-Host "既存のPENDINGレビューを再利用します（開始: $($pending.CreatedAt) / review_id=$($pending.ReviewId)）。" -ForegroundColor DarkGray
    $state = Set-Prop $state 'pendingReviewId' $pending.ReviewId
  } else {
    $created = New-PendingReview $prNumber
    $state   = Set-Prop $state 'pendingReviewId' $created.id
    # createdAt は REST のレビューオブジェクトに無いため、打刻の実体は GraphQL で読み直す。
    $now = (Get-MyPendingReview (Get-ReviewSessions $prNumber))
    $at  = if ($now) { $now.CreatedAt } else { "(取得できず。Submit時に確定します)" }
    Write-Host "レビューを開始しました（開始打刻: $at / review_id=$($created.id)）。" -ForegroundColor Green
  }
  Save-State $state

  Write-Host "PRをブラウザで開きます: #$prNumber" -ForegroundColor Cyan
  $ErrorActionPreference = 'Continue'
  gh pr view $prNumber --web 2>&1 | Out-Null
  $ErrorActionPreference = 'Stop'
  Write-Host @"

■ レビューを終えたら GitHub 上で必ず「Submit review」してください（自分のPRなので Comment を選ぶ）。
  指摘ゼロでもそのまま Submit すること。これがレビュー時間の終了打刻になります。
  提出後: -Revise（指摘を反映） / -Continue（次フェーズへ）
"@ -ForegroundColor Yellow
  return
}

# --- 修正フェーズ: レビュー指摘を直前フェーズに反映し、同一PRへ積む（awaiting-review を維持）---
if ($Revise) {
  if ($state.status -ne "awaiting-review") {
    Write-Host "現在の状態は '$($state.status)' です。-Revise はレビュー後(awaiting-review)に使ってください。"; return
  }
  # -Rollback 直後は phaseIndex-1 が指す対象フェーズがずれる（改善計画 #26）。
  # 誤ったフェーズへ指摘を反映し、誤ったラウンドを記録するのを防ぐためここで止める。
  # 判定に gateCleared を使うのは、本機能の導入前に開始したサンプル（ゲート情報を持たない）を
  # 巻き戻し直後と誤認して止めてしまわないため。
  if (Get-Prop $state 'gateCleared') {
    throw "-Rollback で巻き戻した直後です。-Continue で対象フェーズを実行し直してから -Revise を使ってください（このまま実行すると別フェーズへ指摘が反映されます）。"
  }
  $revIdx = [int]$state.phaseIndex - 1
  if ($revIdx -lt 0) { throw "修正対象のフェーズがありません。" }
  $revPhase = $proc.phases[$revIdx]

  # Submit し忘れたPENDINGが残っていると、このラウンドの終端が永久に打刻されない。
  Assert-RoundSubmitted $state

  $rev = Invoke-Revise $revPhase $state.variant $state.story $state.lastRevisedAt $RunAgent
  if ($rev) {
    Ensure-Commit @{ id = "$($revPhase.id)-revise" } $state.story
    try { Ensure-PR $state } catch { Write-Host "PR連携をスキップ: $_" -ForegroundColor DarkYellow }
    # 修正をpushし終えてからレビューコメントへ返信（差分と回答が揃った状態で見える）。
    Write-Host "PRコメントへ回答を投稿します..." -ForegroundColor Cyan
    Publish-CommentReplies $rev.PrNumber $rev.Items $rev.RespPath
    # 今のラウンドを outcome=revise で閉じてから、次ラウンドを開始する。
    # 自動返信の投稿より後に打刻することで、返信が次ラウンドのレビューへ混ざらない。
    $state = Write-ReviewRound $state 'revise'
    $state = Set-Prop $state 'lastRevisedAt' ((Get-Date).ToString("o"))
    $state = Start-ReviewRound $state $revPhase.id
    Save-State $state
    Write-Host "`n■ 修正を反映しPRを更新しました。再度レビューしてください（round $((Get-Prop $state 'reviewRound'))）。" -ForegroundColor Yellow
    Write-Host "  レビュー開始: powershell -File harness/Invoke-Process.ps1 -Review" -ForegroundColor Yellow
    Write-Host "  さらに修正: powershell -File harness/Invoke-Process.ps1 -Revise" -ForegroundColor Yellow
    Write-Host "  次フェーズへ: powershell -File harness/Invoke-Process.ps1 -Continue" -ForegroundColor Yellow
  }
  Show-Status $state
  return
}

# --- 巻き戻し: 対象フェーズ以降を破棄してPRを更新し、そのフェーズからやり直せる状態に戻す ---
if ($Rollback) {
  # 直近に実行済みのフェーズ index（awaiting-review なら phaseIndex-1、done なら末尾）。
  $lastExec = [int]$state.phaseIndex - 1
  if ($lastExec -lt 0) { throw "巻き戻せる実行済みフェーズがありません。" }

  # 巻き戻し先を決定（-ToPhase: id か 1始まり番号 / 省略時は直近フェーズ）。
  if ($ToPhase) {
    if ($ToPhase -match '^\d+$') {
      $targetIdx = [int]$ToPhase - 1
    } else {
      $targetIdx = $null
      for ($i=0; $i -lt $proc.phases.Count; $i++) { if ($proc.phases[$i].id -eq $ToPhase) { $targetIdx = $i; break } }
      if ($null -eq $targetIdx) { throw "フェーズ id '$ToPhase' は variant '$($state.variant)' に存在しません。" }
    }
  } else {
    $targetIdx = $lastExec
  }
  if ($targetIdx -lt 0 -or $targetIdx -ge $proc.phases.Count) { throw "巻き戻し先フェーズが範囲外です: $ToPhase" }
  if ($targetIdx -gt $lastExec) { throw "フェーズ '$($proc.phases[$targetIdx].id)' はまだ実行されていないため巻き戻せません。" }

  $targetPhase = $proc.phases[$targetIdx]
  $baseSha = Get-PhaseBase $state $targetPhase.id
  if (-not $baseSha) {
    throw "フェーズ '$($targetPhase.id)' のベースSHAが未記録です（本機能の導入前に実行されたフェーズ）。手動で巻き戻してください。"
  }

  Write-Host "`n=== 巻き戻し: '$($targetPhase.name)' 以降を破棄します（reset先 $($baseSha.Substring(0,7)) ）===" -ForegroundColor Cyan

  # git/gh は進捗を stderr に出すため、この区間だけ非致命(Continue)にする（Ensure-Commit 等と同様）。
  $ErrorActionPreference = 'Continue'
  $branch = (git rev-parse --abbrev-ref HEAD).Trim()
  git reset --hard $baseSha 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "git reset --hard $baseSha に失敗しました。" }

  if ($targetIdx -eq 0) {
    # 先頭フェーズまで戻すとブランチはベースライン雛形に戻る = ストーリー実装ゼロ。
    # 差分が無くPRとして意味を成さないため、PRをclose（実質キャンセル）してから remote を合わせる。
    $pr = Get-PrNumber
    if ($pr) {
      gh pr close $pr 2>&1 | Out-Null
      Write-Host "PR #$pr をclose（実質キャンセル）しました。" -ForegroundColor Yellow
    }
    git push --force-with-lease origin $branch 2>&1 | Out-Null
  } else {
    # 途中フェーズまで戻す = 先行フェーズは残る。既存PRを force-push で更新。
    git push --force-with-lease origin $branch 2>&1 | Out-Null
    $pr = Get-PrNumber
    if ($pr) { Write-Host "PR #$pr を更新しました（'$($targetPhase.name)' 以降を削除）。" -ForegroundColor Yellow }
  }

  # 破棄したフェーズ(target..lastExec)のメトリクス／レビュー記録へ rolled_back=true を付与
  # （本体/修正の両方。reviews.jsonl の phase は本体idのみだが、同じ関数でまとめて処理できる）。
  $rolled = New-Object System.Collections.Generic.List[string]
  for ($i=$targetIdx; $i -le $lastExec; $i++) { $rolled.Add($proc.phases[$i].id); $rolled.Add("$($proc.phases[$i].id)-revise") }
  Set-RolledBackRows $MetricsFile $rolled
  Set-RolledBackRows $ReviewsFile $rolled
  # 中央側（#13）にも同じタグを付ける。ここを忘れると本番データ側だけ破棄済みの試行が
  # 生きた行として残り、集計が二重計上になる。対象はこのサンプルの行のみ。
  $mySample = Get-SampleId
  if ($mySample) {
    Set-RolledBackRows (Join-Path (Get-DataDir) $MetricsName) $rolled $mySample
    Set-RolledBackRows (Join-Path (Get-DataDir) $ReviewsName) $rolled $mySample
  } else {
    Write-Host "サンプルIDが不明なため、中央データ側の rolled_back タグ付けをスキップしました（手動で付けてください）。" -ForegroundColor DarkYellow
  }

  # 状態を「対象フェーズを次に実行する」直前へ戻す。
  # -Continue で再実行できるよう awaiting-review にする（レビューOK→次へ、と同じ操作系）。
  $state.phaseIndex = $targetIdx
  $state = Set-Prop $state 'status' 'awaiting-review'
  $state = Set-Prop $state 'lastRevisedAt' ((Get-Date).ToString("o"))
  # 開いていたレビューラウンドは破棄する。ここを残すと、やり直し後の -Continue が
  # 「破棄済みフェーズのレビュー」を新しいラウンドとして記録してしまう。
  $state = Set-Prop $state 'gatePhaseId'     $null
  $state = Set-Prop $state 'gateOpenedAt'    $null
  $state = Set-Prop $state 'pendingReviewId' $null
  $state = Set-Prop $state 'gateDiff'        $null
  $state = Set-Prop $state 'roundClosed'     $true
  $state = Set-Prop $state 'gateCleared'     $true   # -Revise を止めるための印（Start-ReviewRound で解除）
  Save-State $state
  Write-Host "`n■ 巻き戻し完了。フェーズ '$($targetPhase.name)' からやり直せます。" -ForegroundColor Yellow
  Write-Host "  やり直す: powershell -File harness/Invoke-Process.ps1 -Continue" -ForegroundColor Yellow
  Show-Status $state
  return
}

if ($Continue -and $state.status -ne "awaiting-review" -and $state.status -ne "done") {
  Write-Host "現在の状態は '$($state.status)' です。-Continue はレビュー後(awaiting-review)に使ってください。"; return
}

# 最終フェーズのゲート（existing の e2e-run / baseline の build）は次フェーズが無いため
# 状態が done になる。ここで -Continue を「最後のラウンドを閉じる操作」として受け付けないと、
# **最終成果物のレビュー時間だけが永久に欠測**する（baseline は唯一のゲートがこれに当たる）。
if ($state.status -eq "done") {
  if ($Continue -and (Get-Prop $state 'gatePhaseId') -and -not (Get-Prop $state 'roundClosed')) {
    Assert-RoundSubmitted $state
    $state = Write-ReviewRound $state 'continue'
    Save-State $state
    Write-Host "`n★ 最終レビューを記録しました。全工程完了。" -ForegroundColor Green
  } else {
    Write-Host "全フェーズ完了済みです。"
  }
  Show-Status $state; return
}

# ゲートを閉じる（＝レビュー合格として次フェーズへ）。ラウンドをここで確定させる。
if ($Continue) {
  Assert-RoundSubmitted $state
  $state = Write-ReviewRound $state 'continue'
  Save-State $state
}

# 次に実行するフェーズ
$idx   = [int]$state.phaseIndex
$phase = $proc.phases[$idx]

# 巻き戻し先となる「このフェーズ実行直前のHEAD」を控える（-Rollback がここへ reset する）。
Set-PhaseBase $state $phase.id ((git rev-parse HEAD).Trim())
Save-State $state

Invoke-Phase $phase $state.variant $state.story $RunAgent

# 成果物のコミットを担保（エージェントの承認状況に依存しない）
Ensure-Commit $phase $state.story

# ゲート処理
if ($phase.gate) {
  try { Ensure-PR $state } catch { Write-Host "PR連携をスキップ: $_" -ForegroundColor DarkYellow }
}

# 状態更新
if ($idx + 1 -ge $proc.phases.Count) {
  $state.phaseIndex = $idx + 1; $state.status = "done"
  # 最終フェーズにもゲートがある（＝人が最終成果物を見る）ならラウンドを開く。
  # 閉じるのは -Continue（上の done 分岐）。
  if ($phase.gate) { $state = Start-ReviewRound $state $phase.id }
  Save-State $state
  Write-Host "`n★ 全工程完了。" -ForegroundColor Green
  if ($phase.gate) {
    Write-Host "  最終成果物のPRをレビューしてください（レビュー時間を計測します）。" -ForegroundColor Yellow
    Write-Host "  レビュー開始: powershell -File harness/Invoke-Process.ps1 -Review" -ForegroundColor Yellow
    Write-Host "  GitHubで Submit review 後: powershell -File harness/Invoke-Process.ps1 -Continue" -ForegroundColor Yellow
  }
} else {
  $state.phaseIndex = $idx + 1; $state.status = "awaiting-review"
  # 修正フェーズが「この出力以降のコメントだけ」を拾えるよう基準時刻を刻む。
  $state = Set-Prop $state 'lastRevisedAt' ((Get-Date).ToString("o"))
  # レビューラウンドを開始（ゲート開放時刻・レビュー対象数の記録）。
  if ($phase.gate) { $state = Start-ReviewRound $state $phase.id }
  Save-State $state
  Write-Host "`n■ ゲート停止: フェーズ '$($phase.name)' 完了。PRをレビューしてください。" -ForegroundColor Yellow
  if ($phase.gate) {
    $d = Get-Prop $state 'gateDiff'
    if ($d) { Write-Host ("  レビュー対象: {0} files (+{1} / -{2})" -f $d.files, $d.added, $d.deleted) -ForegroundColor DarkGray }
    Write-Host "  レビュー開始: powershell -File harness/Invoke-Process.ps1 -Review   ← 必ずこれでPRを開く（開始打刻）" -ForegroundColor Yellow
  }
  Write-Host "  指摘を反映: powershell -File harness/Invoke-Process.ps1 -Revise" -ForegroundColor Yellow
  Write-Host "  次へ: powershell -File harness/Invoke-Process.ps1 -Continue" -ForegroundColor Yellow
}
Show-Status $state
