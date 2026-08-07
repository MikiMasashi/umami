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
  [switch]$Init,
  [switch]$Continue,
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
  [switch]$Unattended = true
)

$ErrorActionPreference = "Stop"

# --- 文字化け対策: すべての入出力をUTF-8(BOMなし)に固定 ---
# Windows PowerShell 5.1 は Get-Content の既定がANSI(CP932)、Out-File utf8 はBOM付き。
# データファイル(JSON/プロンプト)はBOMなしUTF-8のため、明示指定しないと日本語が化ける。
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$OutputEncoding = $Utf8NoBom                       # claude へパイプするstdinのエンコーディング
try { [Console]::OutputEncoding = $Utf8NoBom } catch {}  # claude の stdout 取り込み用
function Read-Utf8($path)  { [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8) }  # BOM有無どちらも可
function Write-Utf8($path, $text) { [System.IO.File]::WriteAllText($path, $text, $Utf8NoBom) }
function Append-Utf8($path, $line) { [System.IO.File]::AppendAllText($path, $line + [Environment]::NewLine, $Utf8NoBom) }

$RepoRoot   = (git rev-parse --show-toplevel).Trim()
$StateDir   = Join-Path $RepoRoot ".harness"
$StateFile  = Join-Path $StateDir "state.json"
$MetricsFile= Join-Path $StateDir "metrics.jsonl"
$ProjectFile= Join-Path $RepoRoot "harness/project.json"
$ExperimentFile = Join-Path $RepoRoot "harness/experiment.json"

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
      # 無くても動くが、実験条件が記録されないまま走るのは望ましくないので警告する。
      Write-Host "harness/experiment.json がありません。既定（agent=claude / model=sonnet）で実行します。" -ForegroundColor DarkYellow
      $script:ExperimentCache = [pscustomobject]@{
        agent  = 'claude'
        agents = [pscustomobject]@{ claude = [pscustomobject]@{ model = 'sonnet' } }
      }
    }
  }
  $script:ExperimentCache
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
  Write-Utf8 $StateFile ($s | ConvertTo-Json -Depth 10)
}

function Show-Status($s) {
  if (-not $s) { Write-Host "状態なし。-Init で開始してください。"; return }
  $proc = (Read-Utf8 (Join-Path $RepoRoot "harness/processes/$($s.variant).json")) | ConvertFrom-Json
  $agent = Get-Prop $s 'agent'; if (-not $agent) { $agent = 'claude' }
  Write-Host "Story=$($s.story)  Variant=$($s.variant)  Agent=$agent  Status=$($s.status)"
  for ($i=0; $i -lt $proc.phases.Count; $i++) {
    $mark = if ($i -lt $s.phaseIndex) { "[x]" } elseif ($i -eq $s.phaseIndex -and $s.status -eq "awaiting-review") { "[>]" } else { "[ ]" }
    Write-Host ("  {0} {1}. {2}" -f $mark, ($i+1), $proc.phases[$i].name)
  }
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

# 巻き戻しで破棄したフェーズの metrics 行に rolled_back=true を付ける（削除はしない）。
# 成果③のばらつき計測を「やり直し込みの追記ログ」として監査可能に保つため。
function Set-RolledBackMetrics($phaseIds) {
  if (-not (Test-Path $MetricsFile)) { return }
  $lines = [System.IO.File]::ReadAllLines($MetricsFile, [System.Text.Encoding]::UTF8)
  $out = New-Object System.Collections.Generic.List[string]
  $tagged = 0
  foreach ($ln in $lines) {
    if (-not $ln.Trim()) { continue }
    $m = $null; try { $m = $ln | ConvertFrom-Json } catch { $out.Add($ln); continue }
    if (($phaseIds -contains $m.phase) -and -not $m.rolled_back) {
      $m | Add-Member -NotePropertyName rolled_back -NotePropertyValue $true -Force
      $out.Add(($m | ConvertTo-Json -Compress)); $tagged++
    } else { $out.Add($ln) }
  }
  [System.IO.File]::WriteAllLines($MetricsFile, $out, $Utf8NoBom)
  if ($tagged -gt 0) { Write-Host "metrics: $tagged 件を rolled_back=true でタグ付けしました。" -ForegroundColor DarkGray }
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
  $cfg    = Get-AgentConfig $agent
  $model  = if ($Model) { $Model } else { $cfg.model }
  $limits = @{ maxTurns = $cfg.maxTurns; maxAiCredits = $cfg.maxAiCredits }

  $r = Invoke-Agent -Agent $agent -Prompt $prompt -Model $model -Permission $permission -Limits $limits

  # 実験条件の検証: 実際に使われたモデルが期待値と違うなら、気づかず走り切る前にここで止める。
  if ($cfg.expectModel -and $r.model -and $r.model -ne $cfg.expectModel) {
    throw "モデル不一致: 期待=$($cfg.expectModel) 実際=$($r.model)  実験条件が変わっています。"
  }

  # メトリクス追記（成果③のばらつき検証／成果①のリワークコスト計測の土台）
  $metric = [ordered]@{
    ts                 = (Get-Date).ToString("o")
    story              = $story
    variant            = $variant
    phase              = $phaseId
    agent              = $r.agent
    agent_version      = $r.agent_version
    model              = $r.model                 # 実行時に解決された実体
    model_requested    = $model                   # CLI へ渡した値（エイリアスの場合がある）
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
  if (-not (Test-Path $StateDir)) { New-Item -ItemType Directory -Path $StateDir -Force | Out-Null }
  Append-Utf8 $MetricsFile ($metric | ConvertTo-Json -Compress)

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

# $since(ISO時刻/未指定可)以降に付いたレビューコメントを収集して配列で返す。
# 各要素は参照タグ(C1..Cn)付き。収集対象: レビュー要約 / 会話コメント / 差分行のインラインコメント。
function Get-ReviewComments($prNumber, $since) {
  $ErrorActionPreference = 'Continue'
  $sinceDt = if ($since) { [datetime]::Parse($since) } else { [datetime]::MinValue }
  $items = New-Object System.Collections.ArrayList

  $reviews = (gh pr view $prNumber --json reviews --jq ".reviews" 2>$null) | ConvertFrom-Json
  if ($reviews) { foreach ($r in $reviews) {
    if ($r.body -and [datetime]::Parse($r.submittedAt) -gt $sinceDt) {
      [void]$items.Add([pscustomobject]@{ Kind='review'; Id=$r.id; Author=$r.author.login; Body=$r.body; Loc="レビュー/$($r.state)" })
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
$state = Load-State

if ($Status) { Show-Status $state; return }

if ($Init) {
  if (-not $Story) { throw "-Init には -Story が必要です。" }
  # エージェントはサンプル開始時に確定させ、以降のフェーズは同じもので回す。
  # 途中で切り替わると、そのサンプルの計測値が2つのエージェントの混合になってしまうため。
  $initAgent = if ($Agent) { $Agent } elseif ((Get-Experiment).agent) { (Get-Experiment).agent } else { 'claude' }
  $state = [ordered]@{ story=$Story; variant=$Variant; agent=$initAgent; phaseIndex=0; status="ready" }
}
if (-not $state) { throw "状態がありません。まず -Init で開始してください。" }

# 実行エージェントは state.json（サンプル開始時に確定）を正とする。
# 本機能の導入前に開始したサンプルには agent が無いため、その場合は claude とみなす。
$RunAgent = Get-Prop $state 'agent'
if (-not $RunAgent) { $RunAgent = 'claude' }
if ($Agent -and $Agent -ne $RunAgent) {
  throw "このサンプルは agent=$RunAgent で開始されています。-Agent $Agent への途中変更はできません（計測値が混合するため）。新しいサンプルを開始してください。"
}

$proc = (Read-Utf8 (Join-Path $RepoRoot "harness/processes/$($state.variant).json")) | ConvertFrom-Json

# --- 修正フェーズ: レビュー指摘を直前フェーズに反映し、同一PRへ積む（awaiting-review を維持）---
if ($Revise) {
  if ($state.status -ne "awaiting-review") {
    Write-Host "現在の状態は '$($state.status)' です。-Revise はレビュー後(awaiting-review)に使ってください。"; return
  }
  $revIdx = [int]$state.phaseIndex - 1
  if ($revIdx -lt 0) { throw "修正対象のフェーズがありません。" }
  $revPhase = $proc.phases[$revIdx]

  $rev = Invoke-Revise $revPhase $state.variant $state.story $state.lastRevisedAt $RunAgent
  if ($rev) {
    Ensure-Commit @{ id = "$($revPhase.id)-revise" } $state.story
    try { Ensure-PR $state } catch { Write-Host "PR連携をスキップ: $_" -ForegroundColor DarkYellow }
    # 修正をpushし終えてからレビューコメントへ返信（差分と回答が揃った状態で見える）。
    Write-Host "PRコメントへ回答を投稿します..." -ForegroundColor Cyan
    Publish-CommentReplies $rev.PrNumber $rev.Items $rev.RespPath
    $state = Set-Prop $state 'lastRevisedAt' ((Get-Date).ToString("o"))
    Save-State $state
    Write-Host "`n■ 修正を反映しPRを更新しました。再度レビューしてください。" -ForegroundColor Yellow
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

  # 破棄したフェーズ(target..lastExec)のメトリクスへ rolled_back=true を付与（本体/修正の両方）。
  $rolled = New-Object System.Collections.Generic.List[string]
  for ($i=$targetIdx; $i -le $lastExec; $i++) { $rolled.Add($proc.phases[$i].id); $rolled.Add("$($proc.phases[$i].id)-revise") }
  Set-RolledBackMetrics $rolled

  # 状態を「対象フェーズを次に実行する」直前へ戻す。
  # -Continue で再実行できるよう awaiting-review にする（レビューOK→次へ、と同じ操作系）。
  $state.phaseIndex = $targetIdx
  $state = Set-Prop $state 'status' 'awaiting-review'
  $state = Set-Prop $state 'lastRevisedAt' ((Get-Date).ToString("o"))
  Save-State $state
  Write-Host "`n■ 巻き戻し完了。フェーズ '$($targetPhase.name)' からやり直せます。" -ForegroundColor Yellow
  Write-Host "  やり直す: powershell -File harness/Invoke-Process.ps1 -Continue" -ForegroundColor Yellow
  Show-Status $state
  return
}

if ($Continue -and $state.status -ne "awaiting-review") {
  Write-Host "現在の状態は '$($state.status)' です。-Continue はレビュー後(awaiting-review)に使ってください。"; return
}
if ($state.status -eq "done") { Write-Host "全フェーズ完了済みです。"; Show-Status $state; return }

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
  Save-State $state
  Write-Host "`n★ 全工程完了。" -ForegroundColor Green
} else {
  $state.phaseIndex = $idx + 1; $state.status = "awaiting-review"
  # 修正フェーズが「この出力以降のコメントだけ」を拾えるよう基準時刻を刻む。
  $state = Set-Prop $state 'lastRevisedAt' ((Get-Date).ToString("o"))
  Save-State $state
  Write-Host "`n■ ゲート停止: フェーズ '$($phase.name)' 完了。PRをレビューしてください。" -ForegroundColor Yellow
  Write-Host "  指摘を反映: powershell -File harness/Invoke-Process.ps1 -Revise" -ForegroundColor Yellow
  Write-Host "  次へ: powershell -File harness/Invoke-Process.ps1 -Continue" -ForegroundColor Yellow
}
Show-Status $state
