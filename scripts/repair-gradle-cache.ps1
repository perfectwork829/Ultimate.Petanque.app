# Fixes corrupt Gradle 8.13 transform cache on Windows:
# "Could not deserialize analysis ... instrumentation-hierarchy.bin"
# Caused by interrupted builds, full C: drive, or Defender locking cache files.
$ErrorActionPreference = "Stop"

$gradleHome = "E:\Gradle"
if (-not (Test-Path $gradleHome)) {
  New-Item -ItemType Directory -Path $gradleHome -Force | Out-Null
}
$env:GRADLE_USER_HOME = $gradleHome

Write-Host "GRADLE_USER_HOME = $gradleHome" -ForegroundColor Cyan
$freeGb = [math]::Round((Get-PSDrive E).Free / 1GB, 2)
Write-Host "E: free space: ${freeGb} GB" -ForegroundColor Cyan

Write-Host "Stopping Gradle daemons..." -ForegroundColor Yellow
$root = Split-Path -Parent $PSScriptRoot
Set-Location "$root\android"
& .\gradlew.bat --stop 2>$null
Get-Process java,ninja,cmake -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 3

# Corrupt transforms on default C: profile (even when using E: for new builds)
$cTransforms = "$env:USERPROFILE\.gradle\caches\8.13\transforms"
$cCache813 = "$env:USERPROFILE\.gradle\caches\8.13"
$eTransforms = "$gradleHome\caches\8.13\transforms"
$eCache813 = "$gradleHome\caches\8.13"

foreach ($path in @($cTransforms, $eTransforms, $cCache813, $eCache813)) {
  if (Test-Path $path) {
    Write-Host "Removing $path ..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force $path -ErrorAction SilentlyContinue
  }
}

# Copy Gradle wrapper dist from C: to E: if E: wrapper is incomplete
$cWrapper = "$env:USERPROFILE\.gradle\wrapper\dists\gradle-8.13-bin"
$eWrapper = "$gradleHome\wrapper\dists\gradle-8.13-bin"
if ((Test-Path $cWrapper) -and -not (Test-Path "$eWrapper\*\gradle-8.13\bin\gradle.bat")) {
  Write-Host "Copying Gradle 8.13 wrapper to E:\Gradle ..." -ForegroundColor Yellow
  New-Item -ItemType Directory -Path "$gradleHome\wrapper\dists" -Force | Out-Null
  robocopy $cWrapper $eWrapper /E /NFL /NDL /NJH /NJS | Out-Null
}

& "$PSScriptRoot\repair-gradle-downloads.ps1"

Write-Host "Gradle cache repaired. Use GRADLE_USER_HOME=E:\Gradle for all builds." -ForegroundColor Green
Write-Host "Next: .\scripts\android-assemble-release.ps1" -ForegroundColor Green
