# Optimized phone release APK — ARM ABIs only (drops x86/x86_64 emulator libs).
# Typical size: ~90–120 MB vs ~210 MB universal APK with all 4 ABIs.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path "$root\android\gradlew.bat")) {
  throw "Run from repo root; android\gradlew.bat not found under $root"
}

$env:NODE_ENV = "production"
$env:EX_DEV_CLIENT_NETWORK_INSPECTOR = "false"

$gradleHome = "E:\Gradle"
if (-not (Test-Path $gradleHome)) { New-Item -ItemType Directory -Path $gradleHome -Force | Out-Null }
$env:GRADLE_USER_HOME = $gradleHome
Write-Host "GRADLE_USER_HOME=$gradleHome" -ForegroundColor Cyan
Write-Host "Optimized build: arm64-v8a + armeabi-v7a only (no x86 emulator libs)" -ForegroundColor Cyan

function Remove-LockedPath {
  param([string]$Path, [string]$Label)
  if (-not (Test-Path $Path)) { return }
  Write-Host "Removing $Label..."
  Remove-Item -Recurse -Force $Path -ErrorAction SilentlyContinue
}

Set-Location "$root\android"
& .\gradlew.bat --stop 2>$null
Get-Process java,ninja,cmake -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 3

& "$PSScriptRoot\repair-gradle-downloads.ps1"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# Rebuild ARM-only natives — strip cached x86/x86_64 merge outputs from prior universal builds
$nativeCleanPaths = @(
  "$root\android\app\.cxx",
  "$root\android\app\build\intermediates\merged_native_libs",
  "$root\android\app\build\intermediates\stripped_native_libs",
  "$root\android\app\build\intermediates\merged_jni_libs",
  "$root\android\app\build\outputs\apk",
  "$root\node_modules\react-native-screens\android\.cxx",
  "$root\node_modules\react-native-reanimated\android\.cxx",
  "$root\node_modules\expo-modules-core\android\.cxx",
  "$root\node_modules\@shopify\react-native-skia\android\.cxx"
)
foreach ($p in $nativeCleanPaths) { Remove-LockedPath $p $p }
Remove-LockedPath "$root\android\build\reports\problems" "android/build/reports/problems"

Write-Host "Building optimized release APK..." -ForegroundColor Yellow
& .\gradlew.bat assembleRelease --no-daemon --max-workers=1 "-PreactNativeArchitectures=arm64-v8a,armeabi-v7a" "-Pandroid.enableBundleCompression=true"
$code = $LASTEXITCODE

$srcApk = "$root\android\app\build\outputs\apk\release\app-release.apk"
$destApk = "$root\app-release-arm-optimized.apk"

function Get-ApkAbis([string]$ApkPath) {
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $zip = [System.IO.Compression.ZipFile]::OpenRead($ApkPath)
  try {
    $abis = $zip.Entries | Where-Object { $_.FullName -like "lib/*/*" } | ForEach-Object { ($_.FullName -split '/')[1] } | Sort-Object -Unique
    return @($abis)
  } finally { $zip.Dispose() }
}

if ((Test-Path $srcApk)) {
  Copy-Item -Force $srcApk $destApk
  $sizeMb = [math]::Round((Get-Item $destApk).Length / 1MB, 2)
  $abis = Get-ApkAbis $destApk
  Write-Host ""
  Write-Host "APK: $destApk ($sizeMb MB)" -ForegroundColor Green
  Write-Host "ABIs: $($abis -join ', ')" -ForegroundColor Cyan
  if ($abis -contains 'x86' -or $abis -contains 'x86_64') {
    Write-Warning "APK still contains emulator ABIs. Re-run after closing Android Studio."
    exit 1
  }
  if ($code -ne 0) {
    Write-Warning "Gradle exited $code but APK was produced."
  }
  exit 0
}

Write-Host "Build failed ($code) - no APK output." -ForegroundColor Red
exit $code
