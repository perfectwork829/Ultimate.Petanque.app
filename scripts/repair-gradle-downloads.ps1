# Clears partial Gradle downloads and pre-fetches AAPT2 (Windows file-lock workaround).
# Fixes: mergeReleaseResources / Failed to delete original file after copy (aapt2-*.jar)
$ErrorActionPreference = "Stop"

$gradleHome = if ($env:GRADLE_USER_HOME) { $env:GRADLE_USER_HOME } else { "E:\Gradle" }
if (-not (Test-Path $gradleHome)) {
  New-Item -ItemType Directory -Path $gradleHome -Force | Out-Null
}
$env:GRADLE_USER_HOME = $gradleHome

Write-Host "GRADLE_USER_HOME = $gradleHome" -ForegroundColor Cyan

$root = Split-Path -Parent $PSScriptRoot
Set-Location "$root\android"
& .\gradlew.bat --stop 2>$null
Get-Process java,ninja,cmake,clangd -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 3

# Ninja / Kotlin incremental caches (Permission denied, dirty-sources.txt locked)
$lockPaths = @(
  "$root\node_modules\react-native-screens\android\.cxx",
  "$root\node_modules\react-native-screens\android\build",
  "$root\node_modules\react-native-webview\android\build\kotlin",
  "$root\node_modules\react-native-reanimated\android\.cxx",
  "$root\node_modules\expo-modules-core\android\.cxx",
  "$root\node_modules\@shopify\react-native-skia\android\.cxx",
  "$root\android\app\.cxx"
)
foreach ($p in $lockPaths) {
  if (Test-Path $p) {
    Write-Host "Unlocking $p ..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force $p -ErrorAction SilentlyContinue
  }
}

# Stale temp files block Gradle from moving new downloads into the cache
$tmp = Join-Path $gradleHome ".tmp"
if (Test-Path $tmp) {
  Write-Host "Clearing $tmp ..." -ForegroundColor Yellow
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Path $tmp -Force | Out-Null
}

# Locked problems report from a previous failed build
$problemsReport = "$root\android\build\reports\problems"
if (Test-Path $problemsReport) {
  Remove-Item -Recurse -Force $problemsReport -ErrorAction SilentlyContinue
}

function Ensure-Aapt2Jar {
  param(
    [string]$Version = "8.8.2-12006047",
    [string]$Sha1 = "3377ec5c84b2dce12b1e218da286176e37831f40"
  )
  $jarName = "aapt2-$Version-windows.jar"
  $destDir = Join-Path $gradleHome "caches\modules-2\files-2.1\com.android.tools.build\aapt2\$Version\$Sha1"
  $destFile = Join-Path $destDir $jarName
  if ((Test-Path $destFile) -and ((Get-Item $destFile).Length -gt 1MB)) {
    Write-Host "AAPT2 already cached: $destFile" -ForegroundColor Green
    return
  }
  $url = "https://dl.google.com/dl/android/maven2/com/android/tools/build/aapt2/$Version/$jarName"
  Write-Host "Pre-fetching AAPT2 from Google Maven..." -ForegroundColor Yellow
  New-Item -ItemType Directory -Path $destDir -Force | Out-Null
  $staging = Join-Path $env:TEMP "aapt2-$Version-windows.jar"
  for ($i = 1; $i -le 3; $i++) {
    try {
      Invoke-WebRequest -Uri $url -OutFile $staging -UseBasicParsing
      Move-Item -Force $staging $destFile
      Write-Host "AAPT2 cached ($((Get-Item $destFile).Length) bytes)" -ForegroundColor Green
      return
    } catch {
      Write-Warning "AAPT2 download attempt $i failed: $_"
      Start-Sleep -Seconds 2
    }
  }
  throw "Could not download AAPT2. Add Windows Defender exclusions for $gradleHome and the project folder."
}

Ensure-Aapt2Jar
Write-Host "Download cache ready." -ForegroundColor Green
