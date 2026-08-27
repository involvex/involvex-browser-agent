<#
.SYNOPSIS
  Pushes the Involvex AI Agent extension to a connected Android device and
  restarts the browser onto the extensions page for a manual Reload tap.

.DESCRIPTION
  1. Force-stops Helium / Involvex browser packages
  2. Optionally clears the app cache (not full data)
  3. Replaces /sdcard/repos/ai-agent with the local extension tree
  4. Starts the browser at chrome://extensions/?id=<ExtensionId>

  Chromium Android cannot programmatically click "Reload" on an unpacked
  extension. Opening the extensions detail page is the closest automation;
  tap Reload once after the script finishes.

.PARAMETER ExtDir
  Local extension root (folder with manifest.json). Default: this repo root.

.PARAMETER DeviceDir
  Target directory on the device. Default: /sdcard/repos/ai-agent

.PARAMETER ExtensionId
  Unpacked extension id shown on chrome://extensions.
  Default: kbpmkdepjjhgbhkbjcdpnmegmabfhifm

.PARAMETER Package
  Browser package name. Default: auto-detect Helium then Involvex.

.PARAMETER Serial
  Optional adb device serial.

.PARAMETER SkipRestart
  Only push files; do not stop/start the browser.

.PARAMETER ClearCache
  Also run `pm clear --cache-only` when supported (Android 13+).

.EXAMPLE
  pwsh scripts/adb-update.ps1
  pwsh scripts/adb-update.ps1 -ClearCache
  pwsh scripts/adb-update.ps1 -Package app.involvex.browser
#>
[CmdletBinding()]
param(
  [string]$ExtDir = "",
  [string]$DeviceDir = "/sdcard/repos/ai-agent",
  [string]$ExtensionId = "kbpmkdepjjhgbhkbjcdpnmegmabfhifm",
  [string]$Package = "",
  [string]$Serial = "",
  [switch]$SkipRestart,
  [switch]$ClearCache
)

$ErrorActionPreference = "Stop"

if (-not $ExtDir) {
  $ExtDir = Split-Path -Parent $PSScriptRoot
}
$manifestPath = Join-Path $ExtDir "manifest.json"

if (-not (Get-Command adb -ErrorAction SilentlyContinue)) {
  throw "adb not found on PATH. Install platform-tools or add it to PATH."
}
if (-not (Test-Path $manifestPath)) {
  throw "manifest.json not found at $manifestPath"
}

$adbBase = @()
if ($Serial) { $adbBase += @("-s", $Serial) }

function Invoke-Adb {
  param([string[]]$AdbArgs)
  & adb @adbBase @AdbArgs
  if ($LASTEXITCODE -ne 0) { throw "adb $($AdbArgs -join ' ') failed (exit $LASTEXITCODE)." }
}

function Invoke-AdbSoft {
  param([string[]]$AdbArgs)
  & adb @adbBase @AdbArgs 2>$null
}

$devices = (& adb devices) -split "`r?`n" |
  Where-Object { $_ -match "\tdevice$" } |
  ForEach-Object { ($_ -split "\t")[0] }
if ($devices.Count -eq 0) {
  throw "No authorized device found. Connect a device and enable USB / wireless debugging."
}
if (-not $Serial -and $devices.Count -gt 1) {
  throw "Multiple devices attached ($($devices -join ', ')). Re-run with -Serial <serial>."
}

$candidatePackages = @(
  "io.github.jqssun.helium",
  "app.involvex.browser",
  "org.chromium.chrome"
)

function Resolve-BrowserPackage {
  param([string]$Preferred)
  if ($Preferred) { return $Preferred }
  foreach ($pkg in $candidatePackages) {
    $path = & adb @adbBase shell "pm path $pkg" 2>$null
    if ($path -match "package:") { return $pkg }
  }
  return $candidatePackages[0]
}

$browserPkg = Resolve-BrowserPackage -Preferred $Package
$localVersion = (Get-Content $manifestPath -Raw | ConvertFrom-Json).version

Write-Host "Extension : $ExtDir" -ForegroundColor Cyan
Write-Host "Local ver : $localVersion" -ForegroundColor Cyan
Write-Host "Device dir: $DeviceDir" -ForegroundColor Cyan
Write-Host "Browser   : $browserPkg" -ForegroundColor Cyan
Write-Host "Ext id    : $ExtensionId" -ForegroundColor Cyan

if (-not $SkipRestart) {
  Write-Host "`nForce-stopping browser..." -ForegroundColor Yellow
  Invoke-AdbSoft @("shell", "am", "force-stop", $browserPkg)
  Invoke-AdbSoft @("shell", "am", "stop-app", $browserPkg)

  if ($ClearCache) {
    Write-Host "Clearing app cache (--cache-only)..." -ForegroundColor Yellow
    Invoke-AdbSoft @("shell", "pm", "clear", "--cache-only", $browserPkg)
    # Fallback: wipe WebView/Chromium code cache dirs if --cache-only unsupported
    Invoke-AdbSoft @("shell", "run-as", $browserPkg, "rm", "-rf", "cache", "code_cache")
  }
}

Write-Host "`nPackaging extension for store/Kiwi..." -ForegroundColor Yellow
& "$PSScriptRoot\package-extension.ps1"

Write-Host "`nRemoving old extension copy..." -ForegroundColor Yellow
Invoke-Adb @("shell", "rm", "-rf", $DeviceDir)
Invoke-Adb @("shell", "mkdir", "-p", $DeviceDir)

Write-Host "Pushing new build..." -ForegroundColor Yellow
Invoke-Adb @("push", "$ExtDir\.", $DeviceDir)

Write-Host "`nVerifying manifest on device..." -ForegroundColor Yellow
$deviceManifest = & adb @adbBase shell "cat $DeviceDir/manifest.json" 2>$null
$deviceVersion = $null
if ($deviceManifest) {
  try { $deviceVersion = ($deviceManifest | ConvertFrom-Json).version } catch {}
}
if ($deviceVersion -eq $localVersion) {
  Write-Host "OK: device manifest reports v$deviceVersion" -ForegroundColor Green
} else {
  Write-Warning "Device manifest version '$deviceVersion' != local '$localVersion'."
}

if (-not $SkipRestart) {
  $extUrl = "chrome://extensions/?id=$ExtensionId"
  Write-Host "`nStarting browser at $extUrl ..." -ForegroundColor Yellow

  # Prefer VIEW intent; fall back to MAIN launcher.
  Invoke-AdbSoft @(
    "shell", "am", "start",
    "-a", "android.intent.action.VIEW",
    "-d", $extUrl,
    $browserPkg
  )
  if ($LASTEXITCODE -ne 0) {
    Invoke-AdbSoft @("shell", "monkey", "-p", $browserPkg, "-c", "android.intent.category.LAUNCHER", "1")
    Start-Sleep -Seconds 2
    Invoke-AdbSoft @(
      "shell", "am", "start",
      "-a", "android.intent.action.VIEW",
      "-d", $extUrl,
      $browserPkg
    )
  }

  Write-Host ""
  Write-Host "Automated Reload is not available for unpacked extensions on Android." -ForegroundColor DarkYellow
  Write-Host "On the phone: tap Reload (circular arrows) for Involvex AI Agent, then" -ForegroundColor Cyan
  Write-Host "close the AI panel tab and open it again from the toolbar." -ForegroundColor Cyan
} else {
  Write-Host "`nSkipRestart set — open chrome://extensions and tap Reload yourself." -ForegroundColor DarkYellow
}

Write-Host "`nDone. Expected version: $localVersion" -ForegroundColor Green
