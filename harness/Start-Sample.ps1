<#
.SYNOPSIS
  検証サンプルを git worktree で隔離して開始する（成果③: 10サンプルのばらつき検証の土台）。
  サンプルごとに独立した作業ツリー・ブランチを作り、相互汚染なく（必要なら並列に）実行できる。

.DESCRIPTION
  worktree を作った直後に harness/project.json の `setup` コマンド（依存インストール等）を実行してから
  最初のフェーズへ入る。インストールをフェーズの外で済ませることで、その待ち時間が
  .harness/metrics.jsonl の duration_ms（リードタイム指標）へ混入するのを防ぐ。

.EXAMPLE
  # サンプル1 を要件定義フェーズまで実行（隔離worktree内で停止）
  powershell -File harness/Start-Sample.ps1 -N 1 -Story US-001 -Variant existing

  # 以降はそのworktreeに入って継続（worktree名はリポジトリのフォルダ名から作られる）
  cd ..\KeihiSeisan-sample-existing-claude-1
  powershell -File harness/Invoke-Process.ps1 -Continue

.EXAMPLE
  # GitHub Copilot CLI で回す（サンプルIDとworktree名にエージェント名が入る）
  powershell -File harness/Start-Sample.ps1 -N 1 -Story US-001 -Variant existing -Agent copilot

.EXAMPLE
  # 依存を既に入れてある / 要件定義フェーズだけ回したい場合はセットアップを飛ばす
  powershell -File harness/Start-Sample.ps1 -N 1 -Story US-001 -SkipSetup
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)][int]$N,
  [Parameter(Mandatory)][string]$Story,
  [string]$Variant = "existing",
  # 実行エージェント。省略時は harness/experiment.json の agent（さらに省略時は claude）。
  [ValidateSet("claude","copilot")][string]$Agent,
  # 使用モデル。省略時は experiment.json の agents.<agent>.model。
  [string]$Model,
  [switch]$Unattended,
  # project.json の setup（依存インストール等）を実行しない。
  [switch]$SkipSetup
)

$ErrorActionPreference = "Stop"

# 文字化け対策: コンソール出力をUTF-8に固定（子プロセスの Invoke-Process.ps1 も内部でUTF-8固定）
try { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false) } catch {}

# harness/project.json の `setup` コマンドを worktree 内で順に実行する。
# コマンド自体はプロジェクト固有（npm ci / pnpm install --frozen-lockfile / 型生成 …）なので
# スクリプトには直書きせず project.json から読む。`npm install` ではなく `npm ci` 系を推奨:
# lockfile と package.json が食い違うと失敗するため、「既存依存のバージョンは変更しない」という
# 検証ルールをセットアップ時点で機械的に強制できる。
function Invoke-Setup($projectFile, $wtPath) {
  if (-not (Test-Path $projectFile)) {
    throw "プロジェクト定義がありません: $projectFile （harness/project.json はコミット済みですか？ worktree はコミット済みファイルしか持ちません）"
  }
  $project = ([System.IO.File]::ReadAllText($projectFile, [System.Text.Encoding]::UTF8)) | ConvertFrom-Json
  $cmds = @($project.setup) | Where-Object { "$_".Trim() }
  if ($cmds.Count -eq 0) {
    Write-Host "project.json に setup が未定義のため、セットアップをスキップします。" -ForegroundColor DarkYellow
    return
  }

  foreach ($cmd in $cmds) {
    Write-Host "セットアップ実行: $cmd" -ForegroundColor Cyan
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    # nativeコマンドが stderr に出す進捗・警告が終了エラーに化けないよう、この区間だけ Continue にする。
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    Invoke-Expression $cmd
    $code = $LASTEXITCODE
    $ErrorActionPreference = $prev
    $sw.Stop()

    if ($code -ne 0) {
      # worktree は残す（原因調査のため）。自動削除するとログもろとも消えてしまう。
      throw @"
セットアップコマンドが失敗しました (exit=$code): $cmd
  worktree はそのまま残しています: $wtPath
  原因を解消してから、次のいずれかで再開してください:
    - cd "$wtPath" で入って手動セットアップ後、powershell -File harness/Invoke-Process.ps1 -Story $Story -Variant $Variant -Init
    - worktree を破棄してやり直す: git worktree remove "$wtPath" --force
"@
    }
    Write-Host ("  完了 ({0:mm\:ss})" -f $sw.Elapsed) -ForegroundColor Green
  }
}

$RepoRoot = (git rev-parse --show-toplevel).Trim()

# 実行エージェントを確定する（experiment.json > 既定 claude）。
# サンプルIDにエージェントを含めるのは必須。含めないと同一 variant の行を集計時に区別できず、
# 「プロセスの差」を測っているつもりで「エージェントの差」を測ってしまう。
if (-not $Agent) {
  $expFile = Join-Path $RepoRoot "harness/experiment.json"
  if (Test-Path $expFile) {
    $exp = ([System.IO.File]::ReadAllText($expFile, [System.Text.Encoding]::UTF8)) | ConvertFrom-Json
    if ($exp.agent) { $Agent = $exp.agent }
  }
}
if (-not $Agent) { $Agent = "claude" }

$sample   = "$Variant-$Agent-$N"
$branch   = "sample/$Story/$sample"
# worktree名はリポジトリのフォルダ名から導出する（"KeihiSeisan-" 固定にしない）。
# 別プロジェクトへ harness を持ち出したときに、worktree名が実体と食い違わないようにするため。
$wtName   = "$((Split-Path $RepoRoot -Leaf))-sample-$sample"
$wtPath   = Join-Path (Split-Path $RepoRoot -Parent) $wtName

if (Test-Path $wtPath) { throw "worktree が既に存在します: $wtPath （削除するには: git worktree remove `"$wtPath`"）" }

Write-Host "worktree作成: $wtPath  (branch: $branch)" -ForegroundColor Cyan
git worktree add -b $branch $wtPath | Out-Null

Push-Location $wtPath
try {
  # 依存インストール等はフェーズ実行の「前」に済ませる（duration_ms を汚さないため）。
  if ($SkipSetup) {
    Write-Host "-SkipSetup が指定されたため、セットアップを実行しません。" -ForegroundColor DarkYellow
  } else {
    Invoke-Setup (Join-Path $wtPath "harness/project.json") $wtPath
  }

  # サンプルIDは worktree 側で導出させず、ここで確定した値を渡す（改善計画 #13）。
  # ブランチ名からの導出はフォールバックであり、ブランチを切り直すとIDが変わってしまうため。
  $psArgs = @("-NoProfile", "-File", "harness/Invoke-Process.ps1", "-Story", $Story, "-Variant", $Variant,
              "-Agent", $Agent, "-Sample", $sample, "-SampleIndex", $N, "-Init")
  if ($Model)      { $psArgs += @("-Model", $Model) }
  if ($Unattended) { $psArgs += "-Unattended" }
  & powershell @psArgs
  Write-Host "`nサンプル $sample のworktree: $wtPath" -ForegroundColor Green
  Write-Host "継続する場合: cd `"$wtPath`"; powershell -File harness/Invoke-Process.ps1 -Continue" -ForegroundColor Green
  # 計測データは worktree ではなくメインリポジトリ側に集約される（worktree を消しても残る）。
  $dataDir = if ($env:HARNESS_DATA_DIR) { $env:HARNESS_DATA_DIR } else { Join-Path $RepoRoot ".harness-data" }
  Write-Host "計測データの保存先: $dataDir （metrics.jsonl / reviews.jsonl / state/$sample.json）" -ForegroundColor Green
} finally { Pop-Location }
