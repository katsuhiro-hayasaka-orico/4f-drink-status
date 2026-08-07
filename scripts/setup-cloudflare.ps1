#Requires -Version 5.1
<#
  初回デプロイの一括セットアップ（Windows / PowerShell 版）。
  scripts/setup-cloudflare.sh と同じことをします。

    1. D1 データベースを作成（既にあれば再利用）
    2. その database_id を wrangler.toml に書き込む
    3. 本番データベースにスキーマを適用
    4. SESSION_SECRET を生成して登録（既にあれば触らない）
    5. ビルドしてデプロイ

  何度実行しても同じ状態に収束します（冪等）。

  実行方法（既定の実行ポリシーでは .ps1 が拒否されるため）:
      powershell -ExecutionPolicy Bypass -File scripts\setup-cloudflare.ps1
#>

$ErrorActionPreference = 'Continue'
$DbName = 'drink-status'
$Config = 'wrangler.toml'

function Write-Step([string]$Message) {
    Write-Host ''
    Write-Host "> $Message" -ForegroundColor Cyan
}

function Stop-WithError([string]$Message) {
    Write-Host ''
    Write-Host "x $Message" -ForegroundColor Red
    Pop-Location
    exit 1
}

Push-Location (Join-Path $PSScriptRoot '..')

# ---------------------------------------------------------------- 認証確認 --
Write-Step 'Cloudflare の認証を確認しています'
npx wrangler whoami | Out-Null
if ($LASTEXITCODE -ne 0) {
    Stop-WithError "未認証です。先に 'npx wrangler login' を実行するか、CLOUDFLARE_API_TOKEN を設定してください。"
}

# ------------------------------------------------------- D1 データベース --
Write-Step "D1 データベース '$DbName' を用意しています"

function Get-DatabaseId {
    $raw = npx wrangler d1 list --json 2>$null
    if ($LASTEXITCODE -ne 0) { return '' }
    if (-not $raw) { return '' }
    try {
        $list = ($raw | Out-String) | ConvertFrom-Json
    } catch {
        return ''
    }
    $hit = @($list) | Where-Object { $_.name -eq $DbName } | Select-Object -First 1
    if (-not $hit) { return '' }
    if ($hit.uuid) { return [string]$hit.uuid }
    if ($hit.database_id) { return [string]$hit.database_id }
    return ''
}

$DatabaseId = Get-DatabaseId
if (-not $DatabaseId) {
    Write-Host '  見つからないので作成します...'
    npx wrangler d1 create $DbName | Out-Null
    $DatabaseId = Get-DatabaseId
}
if (-not $DatabaseId) {
    Stop-WithError "database_id を取得できませんでした。'npx wrangler d1 list' の出力を確認してください。"
}
Write-Host "  database_id: $DatabaseId"

# ---------------------------------------------- wrangler.toml へ書き込み --
Write-Step "$Config を更新しています"
$ConfigPath = (Resolve-Path $Config).Path
$Original = [System.IO.File]::ReadAllText($ConfigPath)
if ($Original -match [regex]::Escape("database_id = `"$DatabaseId`"")) {
    Write-Host '  すでに正しい ID が設定されています。'
} else {
    $Updated = [regex]::Replace($Original, '(?m)^database_id\s*=\s*".*"\s*$', "database_id = `"$DatabaseId`"")
    if ($Updated -eq $Original) {
        Stop-WithError 'database_id の行が見つかりませんでした。手動で設定してください。'
    }
    # BOM なし UTF-8 で書き戻します（TOML パーサが BOM を嫌うため）。
    $Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($ConfigPath, $Updated, $Utf8NoBom)
    Write-Host '  database_id を書き込みました。'
}

# ------------------------------------------------------- マイグレーション --
Write-Step '本番データベースにスキーマを適用しています'
npx wrangler d1 migrations apply $DbName --remote
if ($LASTEXITCODE -ne 0) { Stop-WithError 'マイグレーションに失敗しました。' }

# ----------------------------------------------------- SESSION_SECRET --
Write-Step 'SESSION_SECRET を確認しています'
$SecretList = (npx wrangler secret list 2>$null | Out-String)
if ($SecretList -match 'SESSION_SECRET') {
    Write-Host '  設定済みのため、そのままにします。'
} else {
    Write-Host '  未設定なので、ランダムな値を生成して登録します...'
    $Secret = (node -e "process.stdout.write(require('crypto').randomBytes(32).toString('base64url'))" | Out-String).Trim()
    if (-not $Secret) { Stop-WithError 'シークレットの生成に失敗しました。' }
    $Secret | npx wrangler secret put SESSION_SECRET
    if ($LASTEXITCODE -ne 0) { Stop-WithError 'SESSION_SECRET の登録に失敗しました。' }
    Write-Host '  登録しました（値は表示しません）。'
}

# ------------------------------------------------------------- デプロイ --
Write-Step 'ビルドしてデプロイしています'
npm run build
if ($LASTEXITCODE -ne 0) { Stop-WithError 'ビルドに失敗しました。' }
npx wrangler deploy
if ($LASTEXITCODE -ne 0) { Stop-WithError 'デプロイに失敗しました。' }

Write-Host ''
Write-Host '完了しました。上に表示された URL で公開されています。' -ForegroundColor Green
Pop-Location
