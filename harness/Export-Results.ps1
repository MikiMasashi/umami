<#
.SYNOPSIS
  最終集計: 全サンプルの「工程別レビュー時間」と「受入条件充足率」を1枚のCSVに出力する。

.DESCRIPTION
  発表用の散布図（横軸=レビュー時間 / 縦軸=受入条件満足割合、モデル4種×プロセス2種の8点）を
  そのまま描けるCSVを作る。`.harness-data/` の追記ログから**毎回まるごと再生成**するので、
  何度実行しても結果は同じ（追記ではないため二重計上が起きない）。

  入力（すべて `.harness-data/`）:
    reviews.jsonl     … 1レビューラウンド1行（review_ms / phase / sample）
    acceptance.jsonl  … 1受入検証1行（satisfied / total / rate）
    metrics.jsonl     … 1フェーズ1行（model / agent の来歴）

  出力（`.harness-data/`）:
    results.csv            ★主成果物。8カラム（model, process, 工程別レビュー時間×5, 充足率）
    results-detail.csv     突合・監査用（sample / story / 工程ID / 欠測フラグ / 受入判定の内訳）
    acceptance-details.csv 受入条件1件ごとの判定（CSVには数しか入らないため、内訳はこちら）

  集計ルール:
    - `rolled_back=true` の行は除外（巻き戻した試行）
    - 工程別レビュー時間 = そのフェーズの全ラウンド（`-Revise` 分を含む）の `review_ms` 合計
    - `review_ms=null`（`review_time_source=missing`）は加算しない。全ラウンド欠測の工程は空欄
    - 工程の並びは `processes/<variant>.json` のフェーズ順（既存=5工程 / 提案=4工程）。
      提案プロセスは 4 工程しかないため `review_ms_5` は空欄になる
    - 受入条件充足率 = `satisfied / total`（同一サンプルに複数回あれば最新の検証を採用）

.EXAMPLE
  powershell -File harness/Export-Results.ps1
  powershell -File harness/Export-Results.ps1 -DataDir D:\harness-data
#>
[CmdletBinding()]
param(
  # 計測データの集約先。省略時は `--git-common-dir` から解決（HARNESS_DATA_DIR があればそれを優先）。
  [string]$DataDir,
  # プロセス定義（processes/<variant>.json）を読むリポジトリルート。省略時は現在のリポジトリ。
  [string]$RepoRoot,
  # CSV の出力先。省略時は $DataDir。
  [string]$OutDir
)

$ErrorActionPreference = "Stop"
try { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false) } catch {}

function Read-Utf8($path) { [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8) }

# 1行1JSON のログを読み、rolled_back 行を落として返す。
function Read-Jsonl($path) {
  if (-not (Test-Path $path)) { return @() }
  $out = New-Object System.Collections.ArrayList
  foreach ($line in [System.IO.File]::ReadAllLines($path, [System.Text.Encoding]::UTF8)) {
    if (-not "$line".Trim()) { continue }
    $o = $null
    try { $o = $line | ConvertFrom-Json } catch { continue }
    if ($o.rolled_back) { continue }
    [void]$out.Add($o)
  }
  ,$out.ToArray()
}

if (-not $RepoRoot) { $RepoRoot = (git rev-parse --show-toplevel).Trim() }
if (-not $DataDir) {
  if ($env:HARNESS_DATA_DIR) { $DataDir = $env:HARNESS_DATA_DIR }
  else {
    $common = "$(git rev-parse --path-format=absolute --git-common-dir 2>$null)".Trim()
    if (-not $common) { $common = "$((Resolve-Path (git rev-parse --git-common-dir)).Path)".Trim() }
    $DataDir = Join-Path (Split-Path $common -Parent) ".harness-data"
  }
}
if (-not $OutDir) { $OutDir = $DataDir }
if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir -Force | Out-Null }

$reviews    = Read-Jsonl (Join-Path $DataDir "reviews.jsonl")
$acceptance = Read-Jsonl (Join-Path $DataDir "acceptance.jsonl")
$metrics    = Read-Jsonl (Join-Path $DataDir "metrics.jsonl")

if (@($reviews).Count -eq 0 -and @($acceptance).Count -eq 0) {
  Write-Host "集計対象のデータがありません（$DataDir）。" -ForegroundColor DarkYellow
  return
}

# variant → フェーズID配列（並び順が工程番号 1..N になる）
$phaseOrderCache = @{}
function Get-PhaseOrder($variant) {
  if (-not $phaseOrderCache.ContainsKey("$variant")) {
    $path = Join-Path $RepoRoot "harness/processes/$variant.json"
    $ids = @()
    if (Test-Path $path) { $ids = @(((Read-Utf8 $path) | ConvertFrom-Json).phases | ForEach-Object { $_.id }) }
    else { Write-Host "プロセス定義が見つかりません: $path （variant=$variant の工程順を解決できません）" -ForegroundColor DarkYellow }
    $phaseOrderCache["$variant"] = $ids
  }
  $phaseOrderCache["$variant"]
}

# 工程レビュー時間の列数。既存プロセスの5工程に合わせて固定する
# （提案プロセスは4工程なので5列目が空欄になる＝どちらのプロセスも同じ表に並べられる）。
$PhaseColumns = 5

# --- サンプル単位に畳む -----------------------------------------------------
$samples = @{}
function Get-Bucket($sample) {
  $key = if ($sample) { "$sample" } else { '(unknown)' }
  if (-not $samples.ContainsKey($key)) {
    $samples[$key] = [pscustomobject]@{
      sample = $key; story = $null; variant = $null; agent = $null; models = @()
      phaseMs = @{}; phaseRounds = @{}; phaseMissing = @{}
      acc = $null
    }
  }
  $samples[$key]
}

foreach ($m in $metrics) {
  $b = Get-Bucket $m.sample
  if (-not $b.story)   { $b.story   = $m.story }
  if (-not $b.variant) { $b.variant = $m.variant }
  if (-not $b.agent)   { $b.agent   = $m.agent }
  # モデルは「実際に解決された実体」を使う。-Model で意図的に上書きした行は実験条件外なので混ぜない。
  if ($m.model -and -not $m.model_overridden -and ($b.models -notcontains $m.model)) { $b.models += $m.model }
}

foreach ($r in $reviews) {
  $b = Get-Bucket $r.sample
  if (-not $b.story)   { $b.story   = $r.story }
  if (-not $b.variant) { $b.variant = $r.variant }
  $p = "$($r.phase)"
  if (-not $p) { continue }
  if (-not $b.phaseRounds.ContainsKey($p)) { $b.phaseRounds[$p] = 0; $b.phaseMissing[$p] = 0 }
  $b.phaseRounds[$p]++
  if ($null -ne $r.review_ms) {
    if (-not $b.phaseMs.ContainsKey($p)) { $b.phaseMs[$p] = [long]0 }
    $b.phaseMs[$p] += [long]$r.review_ms
  } else {
    $b.phaseMissing[$p]++          # 欠測ラウンド（0分として加算しない）
  }
}

foreach ($a in $acceptance) {
  $b = Get-Bucket $a.sample
  if (-not $b.story)   { $b.story   = $a.story }
  if (-not $b.variant) { $b.variant = $a.variant }
  # 同一サンプルで再検証した場合は最新の1件を採用する（-Verify の再実行）。
  if (-not $b.acc -or ([datetime]$a.ts) -gt ([datetime]$b.acc.ts)) { $b.acc = $a }
}

# --- CSV 行の組み立て -------------------------------------------------------
$main   = New-Object System.Collections.ArrayList
$detail = New-Object System.Collections.ArrayList
$acRows = New-Object System.Collections.ArrayList

foreach ($key in ($samples.Keys | Sort-Object)) {
  $b     = $samples[$key]
  $order = Get-PhaseOrder $b.variant
  $model = if (@($b.models).Count -gt 0) { ($b.models | Sort-Object) -join '|' } else { '' }
  if (@($b.models).Count -gt 1) {
    Write-Host "サンプル $($b.sample) に複数のモデル（$model）が混在しています。実験条件が途中で変わった可能性があります。" -ForegroundColor DarkYellow
  }

  $mainRow   = [ordered]@{ model = $model; process = "$($b.variant)" }
  $detailRow = [ordered]@{
    sample = $b.sample; story = "$($b.story)"; process = "$($b.variant)"
    agent = "$($b.agent)"; model = $model
  }

  $totalMs = [long]0; $missingRounds = 0
  for ($i = 0; $i -lt $PhaseColumns; $i++) {
    $n  = $i + 1
    $id = if ($i -lt @($order).Count) { $order[$i] } else { $null }
    $ms = $null
    if ($id -and $b.phaseMs.ContainsKey($id)) { $ms = $b.phaseMs[$id]; $totalMs += [long]$ms }
    $mainRow["review_ms_$n"]   = $ms
    $detailRow["phase_$n"]     = $id
    $detailRow["review_ms_$n"] = $ms
    $detailRow["rounds_$n"]    = if ($id -and $b.phaseRounds.ContainsKey($id)) { $b.phaseRounds[$id] } else { $null }
    $missing = if ($id -and $b.phaseMissing.ContainsKey($id)) { [int]$b.phaseMissing[$id] } else { 0 }
    $detailRow["missing_rounds_$n"] = $missing
    $missingRounds += $missing
  }

  # プロセス定義に無いフェーズのラウンド（変種の書き換え後の古いデータ等）は列に載らないので明示する。
  $unmapped = @($b.phaseRounds.Keys | Where-Object { $order -notcontains $_ })
  if ($unmapped.Count -gt 0) {
    Write-Host "サンプル $($b.sample): 工程列に対応しないレビュー行があります（$($unmapped -join ', ')）。" -ForegroundColor DarkYellow
  }

  $acc  = $b.acc
  $rate = if ($acc -and $null -ne $acc.rate) { $acc.rate } else { $null }
  $mainRow['acceptance_rate'] = $rate

  $detailRow['review_ms_total']      = $totalMs
  $detailRow['review_missing_rounds']= $missingRounds
  $detailRow['unmapped_phases']      = ($unmapped -join '|')
  $detailRow['acceptance_source']    = if ($acc) { "$($acc.source)" } else { 'missing' }
  $detailRow['acceptance_total']     = if ($acc) { $acc.total } else { $null }
  $detailRow['acceptance_satisfied'] = if ($acc) { $acc.satisfied } else { $null }
  $detailRow['acceptance_not_satisfied'] = if ($acc) { $acc.not_satisfied } else { $null }
  $detailRow['acceptance_blocked']   = if ($acc) { $acc.blocked } else { $null }
  $detailRow['acceptance_unreported']= if ($acc) { $acc.unreported } else { $null }
  $detailRow['acceptance_rate']      = $rate
  $detailRow['placeholder_criteria'] = if ($acc) { $acc.placeholder_criteria } else { $null }
  $detailRow['impl_touched']         = if ($acc) { $acc.impl_touched } else { $null }

  [void]$main.Add([pscustomobject]$mainRow)
  [void]$detail.Add([pscustomobject]$detailRow)

  # 受入条件1件ごとの判定（CSVには数しか入らないため、内訳はこの表で残す）。
  $snap = Join-Path (Join-Path $DataDir "acceptance") "$($b.sample).json"
  if (Test-Path $snap) {
    $sn = $null
    try { $sn = (Read-Utf8 $snap) | ConvertFrom-Json } catch {}
    foreach ($d in @($sn.details)) {
      [void]$acRows.Add([pscustomobject]@{
        sample = $b.sample; process = "$($b.variant)"; model = $model
        ac_id = "$($d.id)"; verdict = "$($d.verdict)"
        criterion = "$($d.criterion)"; expected = "$($d.expected)"; actual = "$($d.actual)"
      })
    }
  }
}

# 発表の並び（プロセス→モデル）に揃える。
$main = @($main | Sort-Object process, model)

$mainPath   = Join-Path $OutDir "results.csv"
$detailPath = Join-Path $OutDir "results-detail.csv"
$acPath     = Join-Path $OutDir "acceptance-details.csv"

# Excel で開く前提のため UTF-8 BOM 付き（PowerShell 5.1 の -Encoding UTF8 は BOM 付き）。
$main   | Export-Csv -Path $mainPath   -NoTypeInformation -Encoding UTF8
$detail | Export-Csv -Path $detailPath -NoTypeInformation -Encoding UTF8
if ($acRows.Count -gt 0) { $acRows | Export-Csv -Path $acPath -NoTypeInformation -Encoding UTF8 }

Write-Host "`n集計CSVを出力しました（$(@($main).Count) サンプル）:" -ForegroundColor Green
Write-Host "  $mainPath        ★8カラム（model, process, review_ms_1..5, acceptance_rate）" -ForegroundColor Green
Write-Host "  $detailPath      突合用（工程ID・欠測ラウンド・受入判定の内訳）" -ForegroundColor DarkGray
if ($acRows.Count -gt 0) { Write-Host "  $acPath  受入条件1件ごとの判定" -ForegroundColor DarkGray }
$main | Format-Table -AutoSize | Out-String | Write-Host
