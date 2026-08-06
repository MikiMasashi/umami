<#
.SYNOPSIS
  実行エージェント（Claude Code CLI / GitHub Copilot CLI）のアダプタ層。

.DESCRIPTION
  Invoke-Process.ps1 から dot-source して使う。エージェントごとの CLI 差分
  （プロンプト投入方式・権限フラグ・出力イベント形式・課金単位）をこの1ファイルに閉じ込め、
  呼び出し側へは「正規化された1件の計測レコード」だけを返す。

  ★設計の要点（harness/measurement_parity.md）:
    主指標（実行時間 / ターン数 / ツール呼び出し回数）は **ハーネス側で計測** する。
    エージェントの申告値は agent_* / api_* フィールドへ退避し、突合用にとどめる。
    → どちらのエージェントを使っても指標の定義が完全に一致する。

  原理的に揃わないのは課金単位のみ（Claude=USD / Copilot=AIクレジット）。
  cost_native + cost_unit で生値のまま残し、比較の一次指標にはトークン量を使う。
#>

# ---- 共通ユーティリティ ---------------------------------------------------

# Windows PowerShell 5.1 の native 引数渡しはダブルクオートを壊す（`"` 以降が切り落とされる）。
# 渡す直前に `"` -> `\"` の置換のみを行うと、改行・日本語・バッククオート・記号・`\` を含む本文が
# 完全に往復する（バックスラッシュの二重化は不要。やるとむしろ壊れる）。
# 例外は「末尾が `\`」のケースで、PS が付ける閉じクオートを `\` がエスケープしてしまうため改行を足す。
function ConvertTo-NativeArg([string]$text) {
  if ($text -match '\\+$') { $text += "`n" }
  $escaped = $text.Replace('"', '\"')
  # Windows のコマンドライン長上限は 32767 文字。超えると引数が黙って切れるため事前に停止する。
  if ($escaped.Length -gt 30000) {
    throw "プロンプトが長すぎます（$($escaped.Length) 文字）。Windows のコマンドライン長上限に抵触します。"
  }
  $escaped
}

# 進捗表示（両エージェント共通の見た目にする）。
function Write-AgentEvent($elapsed, $icon, $text, $color) {
  $t = "{0:mm\:ss}" -f $elapsed
  $s = ($text -replace '\s+', ' ').Trim()
  if (-not $s) { return }
  if ($s.Length -gt 100) { $s = $s.Substring(0, 100) + '…' }
  Write-Host ("  [{0}] {1} {2}" -f $t, $icon, $s) -ForegroundColor $color
}

# 正規化レコードの雛形。フィールド名は metrics.jsonl の列名とそのまま対応する。
function New-AgentResult($agent) {
  [pscustomobject]@{
    agent             = $agent
    agent_version     = $null
    model             = $null
    duration_ms       = $null   # ★ハーネス計測（主指標）
    agent_duration_ms = $null   # ◆エージェント申告
    api_duration_ms   = $null   # ◆
    num_turns         = $null   # ★ハーネス計測（LLM往復回数）
    agent_num_turns   = $null   # ◆
    tool_calls        = $null   # ★ハーネス計測
    # トークンの定義（両エージェントで統一）:
    #   input_tokens       = キャッシュに載らなかった入力（Claude の usage.input_tokens と同じ意味）
    #   total_input_tokens = input + cache_read + cache_write（＝実際に投入した入力の総量）
    # Copilot の OTel `gen_ai.usage.input_tokens` は**キャッシュ込みの総量**なので、
    # そのまま入れると Claude と桁違いの値になる。必ずここで揃えること。
    input_tokens      = $null
    total_input_tokens= $null
    output_tokens     = $null
    cache_read_tokens = $null
    cache_write_tokens= $null
    cost_native       = $null
    cost_unit         = $null
    premium_requests  = $null   # Copilot のみ（参考値。粒度が粗いのでコスト指標には使わない）
    is_error          = $true
    error_detail      = $null
    session_id        = $null
  }
}

# ---- Claude Code CLI ------------------------------------------------------

# stdin へプロンプトを流し、stream-json（1行1JSON）を受けながら進捗表示と計数を行う。
function Invoke-ClaudeAgent {
  param([string]$Prompt, [string]$Model, [ValidateSet('edit','all')][string]$Permission, $Limits)

  $permMode = if ($Permission -eq 'all') { 'bypassPermissions' } else { 'acceptEdits' }
  $cliArgs  = @('-p', '--output-format', 'stream-json', '--verbose', '--permission-mode', $permMode)
  if ($Model)           { $cliArgs += @('--model', $Model) }
  if ($Limits.maxTurns) { $cliArgs += @('--max-turns', "$($Limits.maxTurns)") }

  $r      = New-AgentResult 'claude'
  $sw     = [System.Diagnostics.Stopwatch]::StartNew()
  $result = $null
  $turns  = 0
  $tools  = 0

  $Prompt | & claude @cliArgs | ForEach-Object {
    if (-not $_) { return }
    $evt = $null; try { $evt = $_ | ConvertFrom-Json } catch { return }
    switch ($evt.type) {
      'system' {
        if ($evt.subtype -eq 'init') {
          $r.model         = $evt.model
          $r.agent_version = $evt.claude_code_version
        }
      }
      'assistant' {
        # assistant イベント = API から返った1メッセージ ≒ LLM 往復1回。
        $turns++
        foreach ($b in $evt.message.content) {
          if ($b.type -eq 'tool_use') {
            $tools++
            Write-AgentEvent $sw.Elapsed '🔧' $b.name 'DarkCyan'
          } elseif ($b.type -eq 'text') {
            Write-AgentEvent $sw.Elapsed '💬' $b.text 'Gray'
          }
        }
      }
      'result' { $result = $evt }
    }
  }
  $sw.Stop()

  if (-not $result) { throw "claude が result イベントを返さずに終了しました。" }

  $r.duration_ms        = [int]$sw.Elapsed.TotalMilliseconds
  $r.agent_duration_ms  = $result.duration_ms
  $r.api_duration_ms    = $result.duration_api_ms
  $r.num_turns          = $turns
  $r.agent_num_turns    = $result.num_turns
  $r.tool_calls         = $tools
  $r.input_tokens       = $result.usage.input_tokens
  $r.output_tokens      = $result.usage.output_tokens
  $r.cache_read_tokens  = $result.usage.cache_read_input_tokens
  $r.cache_write_tokens = $result.usage.cache_creation_input_tokens
  $r.total_input_tokens = [int]$r.input_tokens + [int]$r.cache_read_tokens + [int]$r.cache_write_tokens
  $r.cost_native        = $result.total_cost_usd
  $r.cost_unit          = 'usd'
  $r.is_error           = [bool]$result.is_error
  $r.session_id         = $result.session_id
  if ($r.is_error) { $r.error_detail = "subtype=$($result.subtype): $("$($result.result)".Trim())" }
  $r
}

# ---- GitHub Copilot CLI ---------------------------------------------------

# Copilot の JSONL ストリームにはトークン数が含まれないため、OpenTelemetry のファイルエクスポータを
# 一時的に有効化し、セッション全体の集計値を持つ invoke_agent スパンから取得する。
function Get-CopilotOtelSummary([string]$path) {
  $sum = [pscustomobject]@{
    input_tokens = $null; output_tokens = $null
    cache_read_tokens = $null; cache_write_tokens = $null
    nano_aiu = $null; turn_count = $null; agent_version = $null; model = $null
  }
  if (-not (Test-Path $path)) { return $sum }
  $attr = $null
  foreach ($line in [System.IO.File]::ReadAllLines($path, [System.Text.Encoding]::UTF8)) {
    if (-not $line.Trim()) { continue }
    $o = $null; try { $o = $line | ConvertFrom-Json } catch { continue }
    if ($o.type -eq 'span' -and $o.name -eq 'invoke_agent') { $attr = $o.attributes }  # 最後の1件を採用
  }
  if (-not $attr) { return $sum }
  # 値が 0 の属性はスパンから省略される。スパン自体が取れている以上「欠測」ではなく「0」なので、
  # 集計時に null と 0 が混ざらないよう既定値へ落とす。
  function Get-Attr($bag, $name, $default = $null) {
    $p = $bag.PSObject.Properties[$name]
    if ($p) { $p.Value } else { $default }
  }
  $sum.input_tokens      = Get-Attr $attr 'gen_ai.usage.input_tokens' 0
  $sum.output_tokens     = Get-Attr $attr 'gen_ai.usage.output_tokens' 0
  $sum.cache_read_tokens = Get-Attr $attr 'gen_ai.usage.cache_read.input_tokens' 0
  $sum.cache_write_tokens= Get-Attr $attr 'gen_ai.usage.cache_creation.input_tokens' 0
  $sum.nano_aiu          = Get-Attr $attr 'github.copilot.nano_aiu'
  $sum.turn_count        = Get-Attr $attr 'github.copilot.turn_count'
  $sum.agent_version     = Get-Attr $attr 'gen_ai.agent.version'
  $sum.model             = Get-Attr $attr 'gen_ai.request.model'
  $sum
}

function Invoke-CopilotAgent {
  param([string]$Prompt, [string]$Model, [ValidateSet('edit','all')][string]$Permission, $Limits)

  # 権限の対応付け（実測ベース）:
  #   Claude acceptEdits        ⇔ --allow-all-tools --deny-tool=shell（編集は自動 / シェルは拒否）
  #   Claude bypassPermissions  ⇔ --allow-all
  # Copilot の非対話モードは許可リストに無いツールも承認プロンプトを出せずそのまま実行してしまうため、
  # 「許可しない」ではなく明示的に「拒否する」と書かないと acceptEdits 相当にならない。
  $permArgs = if ($Permission -eq 'all') { @('--allow-all') }
              else { @('--allow-all-tools', '--deny-tool=shell') }

  # --no-ask-user: headless では対話質問に答えられないため常に抑止する（無駄ターン・停止の防止）。
  $cliArgs = @('-p', (ConvertTo-NativeArg $Prompt)) + $permArgs +
             @('--no-ask-user', '--output-format', 'json', '--no-color')
  if ($Model)               { $cliArgs += @('--model', $Model) }
  if ($Limits.maxAiCredits) { $cliArgs += @('--max-ai-credits', "$($Limits.maxAiCredits)") }

  $otelPath = Join-Path $env:TEMP ("copilot-otel-{0}.jsonl" -f [guid]::NewGuid().ToString('N'))
  $prevOtel = $env:COPILOT_OTEL_FILE_EXPORTER_PATH
  $env:COPILOT_OTEL_FILE_EXPORTER_PATH = $otelPath   # 設定するだけで OTel が有効になる

  $r        = New-AgentResult 'copilot'
  $sw       = [System.Diagnostics.Stopwatch]::StartNew()
  $result   = $null
  $turns    = 0
  $tools    = 0
  $lastText = $null
  $lastRaw  = $null
  $nanoAiu  = $null
  $premium  = $null

  try {
    & copilot @cliArgs | ForEach-Object {
      if (-not $_) { return }
      $evt = $null
      try { $evt = $_ | ConvertFrom-Json } catch { $lastRaw = "$_".Trim(); return }
      switch ($evt.type) {
        # LLM 呼び出しの開始 = 往復1回。Claude の assistant イベント計数と定義を揃えるためこれを数える。
        'model.call_start'      { $turns++; if (-not $r.model) { $r.model = $evt.data.model } }
        'session.tools_updated' { if (-not $r.model) { $r.model = $evt.data.model } }
        'tool.execution_start'  { Write-AgentEvent $sw.Elapsed '🔧' $evt.data.toolName 'DarkCyan' }
        'assistant.message' {
          # ツール呼び出しは「要求された数」で数える（Claude の tool_use ブロック数と同じ意味）。
          if ($evt.data.toolRequests) { $tools += @($evt.data.toolRequests).Count }
          if ("$($evt.data.content)".Trim()) {
            $lastText = $evt.data.content
            Write-AgentEvent $sw.Elapsed '💬' $evt.data.content 'Gray'
          }
        }
        'session.usage_checkpoint' {
          $nanoAiu = $evt.data.totalNanoAiu
          $premium = $evt.data.totalPremiumRequests
        }
        'result' { $result = $evt }
      }
    }
    $sw.Stop()
    $otel = Get-CopilotOtelSummary $otelPath
  } finally {
    $env:COPILOT_OTEL_FILE_EXPORTER_PATH = $prevOtel
    Remove-Item $otelPath -Force -ErrorAction SilentlyContinue
  }

  if (-not $result) {
    $detail = if ($lastRaw) { $lastRaw } elseif ($lastText) { $lastText } else { "(出力なし)" }
    throw "copilot が result イベントを返さずに終了しました: $detail"
  }

  $r.duration_ms        = [int]$sw.Elapsed.TotalMilliseconds
  $r.agent_duration_ms  = $result.usage.sessionDurationMs
  $r.api_duration_ms    = $result.usage.totalApiDurationMs
  $r.num_turns          = $turns
  $r.agent_num_turns    = $otel.turn_count
  $r.tool_calls         = $tools
  # Copilot の gen_ai.usage.input_tokens はキャッシュ込みの総量なので、Claude 側の定義
  # （＝キャッシュに載らなかった分だけ）へ揃えるためキャッシュ分を差し引く。
  $r.total_input_tokens = $otel.input_tokens
  $r.output_tokens      = $otel.output_tokens
  $r.cache_read_tokens  = $otel.cache_read_tokens
  $r.cache_write_tokens = $otel.cache_write_tokens
  if ($null -ne $otel.input_tokens) {
    $uncached = [int]$otel.input_tokens - [int]$otel.cache_read_tokens - [int]$otel.cache_write_tokens
    $r.input_tokens = [math]::Max(0, $uncached)
  }
  # AIクレジット。premiumRequests は LLM 3回でも 1 と出る粗い値なのでコスト指標には使わない。
  if ($null -eq $nanoAiu) { $nanoAiu = $otel.nano_aiu }
  if ($null -ne $nanoAiu) { $r.cost_native = [double]$nanoAiu / 1e9 }
  $r.cost_unit          = 'aiu'
  $r.premium_requests   = $premium
  $r.is_error           = ([int]$result.exitCode -ne 0)
  $r.session_id         = $result.sessionId
  if (-not $r.model)         { $r.model = $otel.model }
  if (-not $r.agent_version) { $r.agent_version = $otel.agent_version }
  if ($r.is_error) { $r.error_detail = "exitCode=$($result.exitCode): $("$lastText".Trim())" }
  $r
}

# ---- ディスパッチャ -------------------------------------------------------

# 使うエージェントに関わらず同じ形の計測レコードを返す唯一の入口。
#   -Permission edit … 編集は自動承認・シェルは不可（Claude acceptEdits 相当）
#   -Permission all  … すべて自動承認（Claude bypassPermissions 相当）
function Invoke-Agent {
  param(
    [Parameter(Mandatory)][ValidateSet('claude','copilot')][string]$Agent,
    [Parameter(Mandatory)][string]$Prompt,
    [string]$Model,
    [ValidateSet('edit','all')][string]$Permission = 'edit',
    $Limits = @{}
  )
  switch ($Agent) {
    'claude'  { Invoke-ClaudeAgent  -Prompt $Prompt -Model $Model -Permission $Permission -Limits $Limits }
    'copilot' { Invoke-CopilotAgent -Prompt $Prompt -Model $Model -Permission $Permission -Limits $Limits }
  }
}
