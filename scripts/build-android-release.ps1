# Release APK build (Windows-safe: no gradlew clean, Gradle cache off C: drive).
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

# Gradle defaults to %USERPROFILE%\.gradle on C:. A full C: drive causes corrupt
# cache entries and cryptic mergeReleaseResources / AAPT2 failures
# (com/android/aapt/Resources$ResourceTableOrBuilder).
$gradleHome = "E:\Gradle"
if (-not (Test-Path $gradleHome)) {
  New-Item -ItemType Directory -Path $gradleHome -Force | Out-Null
}
$env:GRADLE_USER_HOME = $gradleHome

$driveLetter = (Get-Item $gradleHome).PSDrive.Name
$freeGb = [math]::Round((Get-PSDrive $driveLetter).Free / 1GB, 2)
Write-Host "GRADLE_USER_HOME=$gradleHome (${driveLetter}: ${freeGb} GB free)" -ForegroundColor Cyan
if ($freeGb -lt 8) {
  Write-Warning "${driveLetter}: has only ${freeGb} GB free. Release builds need ~8-10 GB."
}

Write-Host "Updating Expo/RN deps..." -ForegroundColor Cyan
npx expo install --fix
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Repairing Gradle transform cache (if corrupt)..." -ForegroundColor Yellow
& "$PSScriptRoot\repair-gradle-cache.ps1"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Set-Location android

# Local app outputs only — not gradlew clean (ninja Permission denied on .cxx)
Remove-Item -Recurse -Force "app\build", "build" -ErrorAction SilentlyContinue

Write-Host "assembleRelease (no clean — avoids ninja Permission denied on .cxx)..." -ForegroundColor Yellow
.\gradlew.bat assembleRelease --no-daemon --max-workers=1 --stacktrace
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "APK: android\app\build\outputs\apk\release\app-release.apk" -ForegroundColor Green
Write-Host "Verify 16 KB: Android Studio -> Build -> Analyze APK -> Alignment" -ForegroundColor Cyan
Write-Host "See docs/android-16kb-page-size.md" -ForegroundColor Cyan
