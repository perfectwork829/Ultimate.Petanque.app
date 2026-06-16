# Build release APK, install on connected emulator/device, and capture crash logs.
param(
  [string]$ApkPath = "android\app\build\outputs\apk\release\app-release.apk",
  [string]$Package = "com.ultimatepetanque.app",
  [string]$CrashLog = "crash.txt"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Resolve-AdbPath {
  $candidates = @(
    "$env:ANDROID_SDK_ROOT\platform-tools\adb.exe",
    "$env:ANDROID_HOME\platform-tools\adb.exe",
    "D:\Android\Sdk\platform-tools\adb.exe",
    "C:\Users\$env:USERNAME\AppData\Local\Android\Sdk\platform-tools\adb.exe"
  ) | Where-Object { $_ -and (Test-Path $_) }
  if ($candidates.Count -gt 0) { return $candidates[0] }
  $fromPath = Get-Command adb -ErrorAction SilentlyContinue
  if ($fromPath) { return $fromPath.Source }
  throw "adb.exe not found"
}

$adb = Resolve-AdbPath
Write-Host "Using adb: $adb" -ForegroundColor Cyan

Get-Process adb -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
& $adb kill-server | Out-Null
& $adb start-server | Out-Null

$deadline = (Get-Date).AddSeconds(90)
$device = $null
while ((Get-Date) -lt $deadline) {
  $line = & $adb devices | Select-String "device$"
  if ($line) {
    $device = ($line -split "\s+")[0]
    break
  }
  Start-Sleep -Seconds 2
}
if (-not $device) { throw "No device/emulator connected" }

$fullApk = Join-Path $root $ApkPath
if (-not (Test-Path $fullApk)) {
  Write-Host "APK not found at $fullApk - run assembleRelease first." -ForegroundColor Yellow
  Set-Location (Join-Path $root "android")
  .\gradlew.bat assembleRelease --no-daemon --max-workers=1
  Set-Location $root
}

Write-Host "Installing APK..." -ForegroundColor Yellow
& $adb -s $device install -r $fullApk

Write-Host "Clearing logcat..." -ForegroundColor Yellow
& $adb -s $device logcat -c | Out-Null

Write-Host "Launching $Package ..." -ForegroundColor Yellow
& $adb -s $device shell monkey -p $Package -c android.intent.category.LAUNCHER 1 | Out-Null
Start-Sleep -Seconds 5

Write-Host "Saving crash log to $CrashLog ..." -ForegroundColor Yellow
& $adb -s $device logcat -d AndroidRuntime:E *:S | Out-File -FilePath (Join-Path $root $CrashLog) -Encoding utf8

Write-Host ('Done. Open ' + $CrashLog + ' and search for FATAL EXCEPTION') -ForegroundColor Green
