param(
  [string]$Package = "com.ultimatepetanque.app",
  [string]$OutFile = "crash.txt",
  [int]$MaxWaitSeconds = 120
)

$ErrorActionPreference = "Stop"

function Resolve-AdbPath {
  $candidates = @(
    "$env:ANDROID_SDK_ROOT\platform-tools\adb.exe",
    "$env:ANDROID_HOME\platform-tools\adb.exe",
    "D:\Android\Sdk\platform-tools\adb.exe",
    "C:\Android\Sdk\platform-tools\adb.exe",
    "C:\Users\$env:USERNAME\AppData\Local\Android\Sdk\platform-tools\adb.exe"
  ) | Where-Object { $_ -and (Test-Path $_) }

  if ($candidates.Count -gt 0) {
    return $candidates[0]
  }

  $fromPath = Get-Command adb -ErrorAction SilentlyContinue
  if ($fromPath) {
    return $fromPath.Source
  }

  throw "adb.exe not found. Install Android platform-tools or set ANDROID_SDK_ROOT."
}

function Get-ConnectedDeviceId([string]$adbPath) {
  $lines = & $adbPath devices
  $devices = @()
  foreach ($line in $lines) {
    if ($line -match "^\s*([^\s]+)\s+device\s*$") {
      $devices += $matches[1]
    }
  }
  if ($devices.Count -gt 0) { return $devices[0] }
  return $null
}

$adb = Resolve-AdbPath
Write-Host "Using adb: $adb" -ForegroundColor Cyan

Write-Host "Restarting adb server..." -ForegroundColor Yellow
Get-Process adb -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
& $adb kill-server | Out-Null
& $adb start-server | Out-Null

Write-Host "Waiting for Android device/emulator (up to $MaxWaitSeconds s)..." -ForegroundColor Yellow
$deadline = (Get-Date).AddSeconds($MaxWaitSeconds)
$deviceId = $null
while ((Get-Date) -lt $deadline) {
  $deviceId = Get-ConnectedDeviceId -adbPath $adb
  if ($deviceId) { break }
  Start-Sleep -Seconds 2
}

if (-not $deviceId) {
  throw "No Android device found. Start emulator, then rerun this script."
}

Write-Host "Connected device: $deviceId" -ForegroundColor Green

Write-Host "Clearing old logs..." -ForegroundColor Yellow
& $adb -s $deviceId logcat -c | Out-Null

Write-Host ""
Write-Host "Now reproduce the crash (launch app until it closes)." -ForegroundColor Magenta
Write-Host "Press Ctrl+C here once the crash happened." -ForegroundColor Magenta
Write-Host ""

try {
  & $adb -s $deviceId logcat AndroidRuntime:E *:S | Tee-Object -FilePath $OutFile
} finally {
  Write-Host ""
  Write-Host "Saved logs to: $OutFile" -ForegroundColor Green
  Write-Host "Tip: open the file and copy the first 'FATAL EXCEPTION' block." -ForegroundColor Green
}
