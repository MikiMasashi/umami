<#
.SYNOPSIS
  検証サンプルを git worktree で隔離して開始する（成果③: 10サンプルのばらつき検証の土台）。
  サンプルごとに独立した作業ツリー・ブランチを作り、相互汚染なく（必要なら並列に）実行できる。

.EXAMPLE
  # サンプル1 を要件定義フェーズまで実行（隔離worktree内で停止）
  powershell -File harness/Start-Sample.ps1 -N 1 -Story US-001 -Variant existing

  # 以降はそのworktreeに入って継続
  cd ..\KeihiSeisan-sample-existing-1
  powershell -File harness/Invoke-Process.ps1 -Continue
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)][int]$N,
  [Parameter(Mandatory)][string]$Story,
  [string]$Variant = "existing",
  [string]$Model = "sonnet",
  [switch]$Unattended
)

$ErrorActionPreference = "Stop"

# 文字化け対策: コンソール出力をUTF-8に固定（子プロセスの Invoke-Process.ps1 も内部でUTF-8固定）
try { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false) } catch {}

$RepoRoot = (git rev-parse --show-toplevel).Trim()
$sample   = "$Variant-$N"
$branch   = "sample/$Story/$sample"
$wtName   = "umami-sample-$sample"
$wtPath   = Join-Path (Split-Path $RepoRoot -Parent) $wtName

if (Test-Path $wtPath) { throw "worktree が既に存在します: $wtPath （削除するには: git worktree remove `"$wtPath`"）" }

Write-Host "worktree作成: $wtPath  (branch: $branch)" -ForegroundColor Cyan
git worktree add -b $branch $wtPath | Out-Null

Push-Location $wtPath
try {
  $psArgs = @("-NoProfile", "-File", "harness/Invoke-Process.ps1", "-Story", $Story, "-Variant", $Variant, "-Model", $Model, "-Init")
  if ($Unattended) { $psArgs += "-Unattended" }
  & powershell @psArgs
  Write-Host "`nサンプル $sample のworktree: $wtPath" -ForegroundColor Green
  Write-Host "継続する場合: cd `"$wtPath`"; powershell -File harness/Invoke-Process.ps1 -Continue" -ForegroundColor Green
} finally { Pop-Location }
