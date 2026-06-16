# Windows-friendly release APK build (avoids EBUSY / Ninja "Permission denied" locks)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path "$root\android\gradlew.bat")) {
  throw "Run from repo root; android\gradlew.bat not found under $root"
}

$env:NODE_ENV = "production"

# Keep Gradle cache off C: — corrupt transforms break dependency resolution
$gradleHome = "E:\Gradle"
if (-not (Test-Path $gradleHome)) { New-Item -ItemType Directory -Path $gradleHome -Force | Out-Null }
$env:GRADLE_USER_HOME = $gradleHome
Write-Host "GRADLE_USER_HOME=$gradleHome" -ForegroundColor Cyan

function Remove-LockedPath {
  param([string]$Path, [string]$Label)
  if (-not (Test-Path $Path)) { return }
  Write-Host "Removing $Label..."
  Remove-Item -Recurse -Force $Path -ErrorAction SilentlyContinue
  if (Test-Path $Path) {
    Write-Host "  (some files still locked — close Android Studio / second Gradle build, then retry)"
  }
}

Write-Host "Stopping Gradle daemons..."
Set-Location "$root\android"
& .\gradlew.bat --stop 2>$null
Get-Process java,ninja,cmake -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 3

Write-Host "Repairing Gradle downloads (AAPT2 / temp file locks)..." -ForegroundColor Yellow
& "$PSScriptRoot\repair-gradle-downloads.ps1"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# CMake / Ninja caches (ninja: failed recompaction: Permission denied)
Remove-LockedPath "$root\node_modules\react-native-screens\android\.cxx" "react-native-screens .cxx"
Remove-LockedPath "$root\node_modules\react-native-reanimated\android\.cxx" "react-native-reanimated .cxx"
Remove-LockedPath "$root\node_modules\expo-modules-core\android\.cxx" "expo-modules-core .cxx"
Remove-LockedPath "$root\android\app\.cxx" "android/app/.cxx"
Remove-LockedPath "$root\android\app\build\intermediates\cxx" "android/app/build/intermediates/cxx"
Remove-LockedPath "$root\node_modules\@react-native-clipboard\clipboard\android\build" "clipboard android/build"

Start-Sleep -Seconds 2

Write-Host "Building release APK (--no-daemon, max-workers=1)..."
& .\gradlew.bat assembleRelease --no-daemon --max-workers=1
$code = $LASTEXITCODE
if ($code -eq 0) {
  Write-Host ""
  Write-Host "OK: android\app\build\outputs\apk\release\app-release.apk"
} else {
  Write-Host "Build failed ($code). If AAPT2 / file lock errors persist:"
  Write-Host "  1) Add Defender exclusions: E:\Gradle, D:\Ultimate.Petanque.app"
  Write-Host "  2) Close Android Studio and any other Gradle builds"
  Write-Host "  3) Run: .\scripts\repair-gradle-downloads.ps1"
  Write-Host "  4) Run this script again in a new PowerShell window"
}
exit $code
