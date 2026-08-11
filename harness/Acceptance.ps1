<#
.SYNOPSIS
  受入条件充足率（測定指標② 品質・主指標）の計測モジュール。

.DESCRIPTION
  Invoke-Process.ps1 から dot-source して使う。全フェーズを終えて `done` になる瞬間に
  自動実行され、**事前に人が定義した受入条件**（stories/<STORY>/acceptance-criteria.md）に
  対して、完成物が実際に何件満たしているかを測る。

  ★設計の要点（review-scope の省略率と同じ思想）:
    - **分母はハーネスが acceptance-criteria.md を自分でパースして数える**。
      AIには渡すが、AIが申告した件数・充足率は一切使わない。
    - **分子も AI の JSON を「AC ID ごとの判定」としてのみ読み、ハーネスが数え直す**。
      AC 一覧に無い ID は数えず（`extra`）、判定行が無い AC は充足扱いにしない（`unreported`）。
    - 検証は**開発チームが書いた E2E の実行結果ではなく、Playwright MCP による実機操作**で行う。
      開発チームのテストを根拠にすると「要件充足」ではなく「自分のテストが通ること」を測ってしまう。
    - 検証エージェントは計測工程であり実装を変更してはならない。遵守を自己申告に委ねず、
      ハーネスが `git diff` で実測して警告する（`impl_touched`）。

  この工程だけが `stories/<STORY>/acceptance-criteria.md` を読む。開発フェーズのプロンプトは
  全変種で閲覧を禁止しており、その禁止を崩さないために**プロセスの外側**に置いてある
  （processes/<variant>.json のフェーズには含めない）。
#>

# ---------------------------------------------------------------------------
#  受入条件（分母）のパース
# ---------------------------------------------------------------------------
# 対応する記法（どちらでもよい）:
#   表形式 : | AC-1 | 経費を登録できる |
#   箇条書き: - AC-1: 経費を登録できる
# 見出し行・区切り行（|---|---|）は自動的に除外される。
function Get-AcceptanceCriteriaPath($story) { Join-Path $RepoRoot "stories/$story/acceptance-criteria.md" }

function Get-AcceptanceCriteria($story) {
  $path = Get-AcceptanceCriteriaPath $story
  if (-not (Test-Path $path)) { throw "受入条件ファイルがありません: $path" }
  $out  = New-Object System.Collections.ArrayList
  $seen = @{}
  foreach ($line in ((Read-Utf8 $path) -split "`r?`n")) {
    $id = $null; $text = $null
    if ($line -match '^\s*\|\s*(AC-[0-9A-Za-z_.\-]+)\s*\|\s*(.*?)\s*\|?\s*$') {
      # 表のセル内でパイプを書くには `\|` とエスケープする必要があるため、本文へ戻す
      # （この本文はプロンプトと報告書にそのまま載るので、エスケープ記号を残さない）。
      $id = $Matches[1]; $text = $Matches[2].Replace('\|', '|')
    } elseif ($line -match '^\s*[-*]\s*\*{0,2}(AC-[0-9A-Za-z_.\-]+)\*{0,2}\s*[:：]\s*(.+?)\s*$') {
      $id = $Matches[1]; $text = $Matches[2]
    }
    if (-not $id) { continue }
    $key = $id.ToUpperInvariant()
    if ($seen.ContainsKey($key)) {
      Write-Host "受入条件 $id が重複しています。最初の1件だけを採用します。" -ForegroundColor DarkYellow
      continue
    }
    $seen[$key] = $true
    [void]$out.Add([pscustomobject]@{ id = $id; text = ($text -replace '\s+$', '') })
  }
  ,$out.ToArray()
}

# 未記入のプレースホルダ（「（未記入）」「TBD」「-」だけ 等）を数える。
# 分母からは外さない（外すと「書き忘れたAC」が静かに消えて充足率が良く見える）。
function Measure-PlaceholderCriteria($criteria) {
  @($criteria | Where-Object {
    $t = "$($_.text)".Trim()
    (-not $t) -or ($t -match '^[（(]?\s*(未記入|未定|TBD|N/?A)\s*[)）]?$') -or ($t -match '^[-–—ー]+$')
  }).Count
}

# プロンプトへ差し込む AC 一覧（ハーネスが数える集合とAIが見る集合を一致させるため、
# AIには acceptance-criteria.md を読ませるだけでなく、この確定リストも渡す）。
function Format-AcceptanceList($criteria) {
  $sb = New-Object System.Text.StringBuilder
  foreach ($c in $criteria) { [void]$sb.AppendLine("- **$($c.id)**: $($c.text)") }
  $sb.ToString().TrimEnd()
}

# ---------------------------------------------------------------------------
#  検証環境（アプリ）の起動と停止
# ---------------------------------------------------------------------------
# 受入検証は実機操作なので、web/api が動いていなければ全ACが blocked になる。
# サーバ起動をAIに任せるとその待ち時間が duration_ms に入り、失敗時も原因が追えないため
# ハーネス側で起動・疎通確認・停止まで面倒を見る（project.json の `verify` セクション）。

function Get-VerifyConfig {
  $p = Get-Project
  $v = $p.PSObject.Properties['verify']
  if (-not $v -or -not $v.Value) { throw "harness/project.json に 'verify' セクションがありません（受入検証の起動設定）。" }
  $v.Value
}

# HTTPエラー応答（404/500）でも「サーバは起きている」と見なす（Next.js のルート未定義など）。
function Test-UrlUp($url) {
  try {
    Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 5 -Method Get -ErrorAction Stop | Out-Null
    return $true
  } catch {
    if ($_.Exception.Response) { return $true }
    return $false
  }
}

function Wait-UrlUp($url, $timeoutSec) {
  $deadline = (Get-Date).AddSeconds([int]$timeoutSec)
  while ((Get-Date) -lt $deadline) {
    if (Test-UrlUp $url) { return $true }
    Start-Sleep -Seconds 2
  }
  $false
}

# 起動したプロセスの記録（停止時に使う）。既に起きていたサーバは touch しない。
function Start-VerifyServers {
  $cfg     = Get-VerifyConfig
  $started = New-Object System.Collections.ArrayList

  foreach ($cmd in @($cfg.setup) | Where-Object { "$_".Trim() }) {
    Write-Host "検証環境セットアップ: $cmd" -ForegroundColor DarkCyan
    $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    Invoke-Expression $cmd | Out-Null
    $code = $LASTEXITCODE
    $ErrorActionPreference = $prev
    if ($code -ne 0) { Write-Host "  セットアップコマンドが exit=$code で終了しました（続行します）。" -ForegroundColor DarkYellow }
  }

  foreach ($srv in @($cfg.servers)) {
    $timeout = if ($srv.timeoutSec) { [int]$srv.timeoutSec } else { 120 }
    if (Test-UrlUp $srv.url) {
      Write-Host "サーバ '$($srv.name)' は既に起動しています（$($srv.url)）。ハーネスからは起動・停止しません。" -ForegroundColor DarkGray
      continue
    }
    $stamp   = [guid]::NewGuid().ToString('N').Substring(0, 8)
    $outLog  = Join-Path $env:TEMP "harness-verify-$($srv.name)-$stamp.out.log"
    $errLog  = Join-Path $env:TEMP "harness-verify-$($srv.name)-$stamp.err.log"
    Write-Host "サーバ起動: $($srv.name)  ($($srv.command))" -ForegroundColor DarkCyan
    $proc = Start-Process -FilePath "powershell" `
      -ArgumentList @("-NoProfile", "-Command", $srv.command) `
      -WorkingDirectory $RepoRoot -PassThru -NoNewWindow `
      -RedirectStandardOutput $outLog -RedirectStandardError $errLog
    [void]$started.Add([pscustomobject]@{ Name = $srv.name; Proc = $proc; OutLog = $outLog; ErrLog = $errLog })

    if (-not (Wait-UrlUp $srv.url $timeout)) {
      Stop-VerifyServers $started.ToArray()
      throw "サーバ '$($srv.name)' が $timeout 秒以内に $($srv.url) で応答しませんでした。ログ: $errLog"
    }
    Write-Host "  疎通OK: $($srv.url)" -ForegroundColor Green
  }
  ,$started.ToArray()
}

function Stop-VerifyServers($started) {
  foreach ($s in @($started)) {
    if (-not $s -or -not $s.Proc) { continue }
    Write-Host "サーバ停止: $($s.Name) (PID $($s.Proc.Id))" -ForegroundColor DarkGray
    # npm → node と子プロセスがぶら下がるため、プロセスツリーごと落とす（/T）。
    $ErrorActionPreference = 'Continue'
    taskkill /PID $($s.Proc.Id) /T /F 2>&1 | Out-Null
  }
}

# ---------------------------------------------------------------------------
#  判定結果（AIの出力JSON）の読み取りと集計
# ---------------------------------------------------------------------------
function Get-AcceptanceResultPath($story) {
  Join-Path $RepoRoot "$((Get-Project).docs.acceptance)/acceptance-result-$story.json"
}

# AIが書いた判定JSONを AC 一覧に突き合わせて数え直す。
# 戻り値は acceptance.jsonl の列にそのまま対応する。
function Measure-AcceptanceResult($criteria, $resultPath) {
  $r = [ordered]@{
    source = 'missing'
    total = @($criteria).Count
    satisfied = $null; not_satisfied = $null; blocked = $null
    unreported = $null; invalid_verdict = $null; extra_reported = $null
    rate = $null
    details = @()
  }
  if (-not (Test-Path $resultPath)) { return [pscustomobject]$r }

  $raw = (Read-Utf8 $resultPath).Trim()
  # まれにコードフェンス付きで書かれるので剥がす（形式厳守はプロンプトで指示済みだが、
  # 計測を1文字の揺れで欠測にしない）。
  if ($raw -match '(?s)^```[a-zA-Z]*\s*(.*?)\s*```$') { $raw = $Matches[1].Trim() }

  $json = $null
  try { $json = $raw | ConvertFrom-Json } catch {
    Write-Host "受入検証の判定JSONを解析できませんでした（$resultPath）: $_" -ForegroundColor DarkYellow
    return [pscustomobject]$r
  }

  # ID → 判定 の索引を作る（大文字小文字は無視）。
  $byId = @{}
  foreach ($e in @($json.results)) {
    if (-not $e.id) { continue }
    $k = "$($e.id)".Trim().ToUpperInvariant()
    if (-not $byId.ContainsKey($k)) { $byId[$k] = $e }
  }

  $sat = 0; $not = 0; $blk = 0; $unrep = 0; $bad = 0
  $details = New-Object System.Collections.ArrayList
  foreach ($c in $criteria) {
    $k = "$($c.id)".ToUpperInvariant()
    $e = if ($byId.ContainsKey($k)) { $byId[$k] } else { $null }
    $verdict = if ($e) { "$($e.verdict)".Trim().ToLowerInvariant() } else { 'unreported' }
    switch ($verdict) {
      'satisfied'     { $sat++ }
      'not-satisfied' { $not++ }
      'blocked'       { $blk++ }
      'unreported'    { $unrep++ }
      default         { $bad++; $verdict = "invalid:$verdict" }   # 未知の verdict は充足に数えない
    }
    [void]$details.Add([pscustomobject]@{
      id        = $c.id
      criterion = $c.text
      verdict   = $verdict
      expected  = if ($e) { "$($e.expected)" } else { '' }
      actual    = if ($e) { "$($e.actual)" }   else { '' }
      evidence  = if ($e) { "$($e.evidence)" } else { '' }
    })
  }

  # AC 一覧に無い ID の申告（データ品質のシグナル。充足数には一切効かない）。
  $known = @{}; foreach ($c in $criteria) { $known["$($c.id)".ToUpperInvariant()] = $true }
  $extra = @($byId.Keys | Where-Object { -not $known.ContainsKey($_) }).Count

  $r.source          = 'acceptance-result'
  $r.satisfied       = $sat
  $r.not_satisfied   = $not
  $r.blocked         = $blk
  $r.unreported      = $unrep
  $r.invalid_verdict = $bad
  $r.extra_reported  = $extra
  $r.rate            = if ($r.total -gt 0) { [math]::Round($sat / $r.total, 4) } else { $null }
  $r.details         = $details.ToArray()
  [pscustomobject]$r
}

# 中央データから、このサンプルの最新の受入検証行を返す（-Status の表示用）。
# 「done にしたのに品質側の主指標だけ欠測している」を目視で気づけるようにするため。
function Get-LastAcceptanceRow($sample) {
  if (-not $sample) { return $null }
  $path = Join-Path (Get-DataDir) 'acceptance.jsonl'
  if (-not (Test-Path $path)) { return $null }
  $last = $null
  foreach ($line in [System.IO.File]::ReadAllLines($path, [System.Text.Encoding]::UTF8)) {
    if (-not "$line".Trim()) { continue }
    $o = $null; try { $o = $line | ConvertFrom-Json } catch { continue }
    if ($o.rolled_back -or "$($o.sample)" -ne "$sample") { continue }
    if (-not $last -or ([datetime]$o.ts) -gt ([datetime]$last.ts)) { $last = $o }
  }
  $last
}

# ---------------------------------------------------------------------------
#  受入検証の実行（done の瞬間に自動実行 / -Verify で再実行）
# ---------------------------------------------------------------------------
function Invoke-AcceptanceVerification($s, $agent) {
  $story    = $s.story
  $criteria = Get-AcceptanceCriteria $story
  if (@($criteria).Count -eq 0) {
    throw "受入条件を1件も抽出できませんでした（$(Get-AcceptanceCriteriaPath $story)）。`| AC-1 | 条件 |` 形式で定義してください。"
  }
  $placeholders = Measure-PlaceholderCriteria $criteria
  if ($placeholders -gt 0) {
    Write-Host "受入条件に未記入のものが $placeholders 件あります。分母には含めるため充足率は低く出ます（基準ファイルを先に確定させてください）。" -ForegroundColor DarkYellow
  }
  Write-Host "`n=== 受入条件充足率の測定: $story （$(@($criteria).Count) 件） ===" -ForegroundColor Cyan

  $mcpConfig = Join-Path $RepoRoot "harness/mcp/playwright.json"
  if (-not (Test-Path $mcpConfig)) { throw "MCP定義がありません: $mcpConfig" }

  $resultPath = Get-AcceptanceResultPath $story
  if (Test-Path $resultPath) { Remove-Item $resultPath -Force }   # 前回の判定を残さない（再実行時）

  $cfg      = Get-VerifyConfig
  $docsAcc  = (Get-Project).docs.acceptance
  $baseSha  = (git rev-parse HEAD).Trim()
  $started  = @()
  try {
    $started = Start-VerifyServers

    $promptPath = Join-Path $RepoRoot "harness/prompts/verify/acceptance-verify.md"
    if (-not (Test-Path $promptPath)) { throw "受入検証プロンプトがありません: $promptPath" }
    # AC 本文は自由文（{{ }} を含み得る）なので未解決プレースホルダ検査の対象外として最後に差し込む。
    $prompt = Expand-Prompt (Read-Utf8 $promptPath) `
      @{ 'STORY'       = $story
         'BASE_URL'    = "$($cfg.baseUrl)"
         'RESULT_JSON' = "$docsAcc/acceptance-result-$story.json"
         'RESULT_MD'   = "$docsAcc/acceptance-result-$story.md" } `
      @{ 'AC_LIST'     = (Format-AcceptanceList $criteria) }

    # 受入検証は「実装を触らない」前提なので acceptEdits でも足りるが、Playwright MCP と
    # 画面確認のためのコマンド実行を止めないよう all（bypassPermissions）で回す。
    # 実装を触っていないことは下の impl_touched で実測して担保する。
    Run-Agent $prompt 'acceptance-verify' $s.variant $story $agent 'all' $mcpConfig
  } finally {
    Stop-VerifyServers $started
  }

  Ensure-Commit @{ id = 'acceptance-verify' } $story

  # --- 集計（AIの申告ではなくハーネスが数える） ---
  $m = Measure-AcceptanceResult $criteria $resultPath

  # --- 計測工程が実装を触っていないかの実測（自己申告に委ねない） ---
  $ErrorActionPreference = 'Continue'
  $changed = @(git diff --name-only $baseSha HEAD 2>$null) | Where-Object { "$_".Trim() }
  $accPrefix = (ConvertTo-ComparablePath $docsAcc).TrimEnd('/')
  $outside = @($changed | Where-Object { -not (ConvertTo-ComparablePath $_).StartsWith("$accPrefix/") })
  $ErrorActionPreference = 'Stop'

  $row = [ordered]@{
    ts              = (Get-Date).ToString("o")
    story           = $story
    variant         = $s.variant
    sample          = Get-SampleId
    agent           = $agent
    phase           = 'acceptance-verify'
    source          = $m.source                 # acceptance-result（正常）/ missing（判定JSONが無い・壊れている）
    total           = $m.total                  # ★分母: acceptance-criteria.md の AC 件数（ハーネスが数えた値）
    satisfied       = $m.satisfied              # ★分子: verdict=satisfied の AC 件数（同上）
    not_satisfied   = $m.not_satisfied
    blocked         = $m.blocked
    unreported      = $m.unreported             # 判定行が無かった AC（充足に数えない・データ品質のシグナル）
    invalid_verdict = $m.invalid_verdict        # 未知の verdict（同上）
    extra_reported  = $m.extra_reported         # AC 一覧に無い ID の申告（同上）
    placeholder_criteria = $placeholders        # 未記入のまま残っている AC 件数
    rate            = $m.rate                   # ★受入条件充足率 = satisfied / total
    base_url        = "$($cfg.baseUrl)"
    result_file     = "$docsAcc/acceptance-result-$story.json"
    impl_touched    = $outside.Count            # 計測工程が docs/acceptance 以外を変更した件数（0 であるべき）
    impl_touched_files = $outside
  }
  Add-DataRow 'acceptance.jsonl' $row

  # AC ごとの判定は CSV には入らない（CSVは数だけ）。worktree を消しても残るよう中央へ退避する。
  $sample = Get-SampleId
  if ($sample) {
    $snapshot = [pscustomobject]@{
      ts = $row.ts; story = $story; variant = $s.variant; sample = $sample
      agent = $agent; base_url = $row.base_url
      total = $m.total; satisfied = $m.satisfied; rate = $m.rate
      details = $m.details
    }
    try {
      Write-Utf8 (Join-Path (Join-Path (Get-DataDir) "acceptance") "$sample.json") ($snapshot | ConvertTo-Json -Depth 6)
    } catch { Write-Host "中央データへの受入判定スナップショット保存に失敗しました: $_" -ForegroundColor DarkYellow }
  }

  # --- 画面表示 ---
  if ($m.source -eq 'missing') {
    Write-Host "受入検証の判定JSONを読めませんでした。このサンプルの充足率は欠測（rate=null）です。" -ForegroundColor DarkYellow
    Write-Host "  再実行: powershell -File harness/Invoke-Process.ps1 -Verify" -ForegroundColor DarkYellow
  } else {
    Write-Host ("受入条件充足率: {0:P1}  ({1}/{2} 件  未充足 {3} / 判定不能 {4})" -f `
      $m.rate, $m.satisfied, $m.total, $m.not_satisfied, $m.blocked) -ForegroundColor Green
    if ($m.unreported -gt 0)      { Write-Host "  ※判定行が無い AC が $($m.unreported) 件あります（充足に数えていません）。" -ForegroundColor DarkYellow }
    if ($m.invalid_verdict -gt 0) { Write-Host "  ※未知の verdict が $($m.invalid_verdict) 件あります（充足に数えていません）。" -ForegroundColor DarkYellow }
    if ($m.extra_reported -gt 0)  { Write-Host "  ※AC一覧に無い ID の判定が $($m.extra_reported) 件あります（集計対象外）。" -ForegroundColor DarkYellow }
  }
  if ($outside.Count -gt 0) {
    Write-Host "`n■ 警告: 受入検証（計測工程）が $docsAcc 以外を変更しました（$($outside.Count) 件）" -ForegroundColor Yellow
    foreach ($p in $outside) { Write-Host "    $p" -ForegroundColor Yellow }
    Write-Host "  実装を直してから測ると『完成物の充足率』ではなくなります。集計時にこのサンプルを要確認としてください。" -ForegroundColor Yellow
  }
  $m
}
