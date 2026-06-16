# Safe C: drive cleanup (caches/temp only — does not touch projects on D:).
$ErrorActionPreference = "Continue"
$before = (Get-PSDrive C).Free
$freed = 0

function Remove-SafePath {
  param([string]$Path, [string]$Label)
  if (-not (Test-Path $Path)) { return }
  $size = 0
  Get-ChildItem $Path -Recurse -Force -File -ErrorAction SilentlyContinue | ForEach-Object { $size += $_.Length }
  Write-Host "Removing $Label (~$([math]::Round($size/1GB,2)) GB)..." -ForegroundColor Yellow
  Remove-Item -Recurse -Force $Path -ErrorAction SilentlyContinue
  if (-not (Test-Path $Path)) { $script:freed += $size }
}

Write-Host "C: free before: $([math]::Round($before/1GB,2)) GB" -ForegroundColor Cyan

# Stop build tools that lock caches
Set-Location "$PSScriptRoot\..\android" -ErrorAction SilentlyContinue
& .\gradlew.bat --stop 2>$null
Get-Process java,ninja,cmake -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# Gradle on C: (use GRADLE_USER_HOME=E:\Gradle for builds)
if ($env:GRADLE_USER_HOME -ne "E:\Gradle") {
  Write-Host "Tip: set permanent GRADLE_USER_HOME=E:\Gradle to keep C: clean." -ForegroundColor Cyan
}
Remove-SafePath "$env:USERPROFILE\.gradle" "Gradle cache on C: (.gradle)"

# Temp
Remove-SafePath $env:TEMP "User Temp"
Remove-SafePath "$env:USERPROFILE\AppData\Local\Temp" "Local Temp"
Remove-SafePath "C:\Windows\Temp" "Windows Temp"

# npm / yarn
Remove-SafePath "$env:USERPROFILE\AppData\Local\npm-cache" "npm cache"
Remove-SafePath "$env:USERPROFILE\AppData\Local\Yarn\Cache" "Yarn cache"

# Browser caches (Chrome)
$chromeBase = "$env:LOCALAPPDATA\Google\Chrome\User Data"
foreach ($sub in @("Default\Cache", "Default\Code Cache", "Default\GPUCache", "Default\Service Worker\CacheStorage", "ShaderCache")) {
  Remove-SafePath (Join-Path $chromeBase $sub) "Chrome $sub"
}

# Edge cache
$edgeBase = "$env:LOCALAPPDATA\Microsoft\Edge\User Data"
foreach ($sub in @("Default\Cache", "Default\Code Cache")) {
  Remove-SafePath (Join-Path $edgeBase $sub) "Edge $sub"
}

# Windows update download cache (safe; Windows re-downloads if needed)
Remove-SafePath "C:\Windows\SoftwareDistribution\Download" "Windows Update downloads"

# Installer package cache (MSI/VS redistributables — re-download on reinstall)
Remove-SafePath "C:\ProgramData\Package Cache" "Package Cache"

# Crash dumps
Remove-SafePath "$env:USERPROFILE\AppData\Local\CrashDumps" "Crash dumps"

# Empty Recycle Bin
try {
  Clear-RecycleBin -Force -ErrorAction SilentlyContinue
  Write-Host "Recycle Bin emptied." -ForegroundColor Yellow
} catch {}

$after = (Get-PSDrive C).Free
Write-Host ""
Write-Host "C: free after:  $([math]::Round($after/1GB,2)) GB" -ForegroundColor Green
Write-Host "Reclaimed:      ~$([math]::Round(($after - $before)/1GB,2)) GB" -ForegroundColor Green
Write-Host ""
Write-Host "Optional (manual, large):" -ForegroundColor Cyan
Write-Host "  .android\avd (~20 GB): 2 Pixel 7 emulators - delete one in Android Studio AVD Manager if unused"
Write-Host "  Nox_share (~3 GB):     delete folder if Nox emulator not used"
Write-Host "  AppData\Local\Pub (~1 GB): run 'flutter pub cache clean' if you use Flutter"
