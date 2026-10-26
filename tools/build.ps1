param([string]$ToolRoot = $env:OHOS_CLT, [switch]$Clean)
$ErrorActionPreference = 'Stop'
$taskProject = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (-not $ToolRoot) {
  $taskBundledTools = Join-Path $taskProject '.tools\clt-26\command-line-tools'
  if (Test-Path -LiteralPath $taskBundledTools) { $ToolRoot = $taskBundledTools }
}
if (-not $ToolRoot) {
  throw 'HarmonyOS tools not found. Install official Command Line Tools and set OHOS_CLT to its command-line-tools directory, or open this project in DevEco Studio.'
}
$taskToolRoot = [IO.Path]::GetFullPath($ToolRoot)
$taskLocalTools = Join-Path $taskProject '.tools'
if ($taskToolRoot.StartsWith($taskLocalTools + '\', [StringComparison]::OrdinalIgnoreCase)) {
  $taskToolScope = Join-Path $taskLocalTools 'package.json'
  if (-not (Test-Path -LiteralPath $taskToolScope)) {
    Set-Content -LiteralPath $taskToolScope -Value '{"private":true,"type":"commonjs"}' -Encoding ascii
  }
}
$taskHvigor = Join-Path $taskToolRoot 'hvigor\bin\hvigorw.js'
$taskOhpm = Join-Path $taskToolRoot 'ohpm\bin\ohpm.bat'
$taskNode = Join-Path $taskToolRoot 'tool\node\node.exe'
if (-not (Test-Path -LiteralPath $taskNode)) { $taskNode = (Get-Command node -ErrorAction Stop).Source }
if (-not (Test-Path -LiteralPath $taskHvigor)) { throw "hvigorw.js not found: $taskHvigor" }
if (-not (Test-Path -LiteralPath $taskOhpm)) { throw "ohpm.bat not found: $taskOhpm" }
$taskSdk = Join-Path $taskToolRoot 'sdk'
if (-not (Test-Path -LiteralPath $taskSdk)) { throw "SDK not found: $taskSdk" }
$taskJbr = Join-Path $taskToolRoot 'tool\jbr'
if (-not (Test-Path -LiteralPath $taskJbr)) {
  $taskJbr = Join-Path $taskProject '.tools\DevEcoStudio-26\jbr'
}
if (-not (Test-Path -LiteralPath (Join-Path $taskJbr 'bin\java.exe'))) {
  $taskInstalledStudio = Get-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*', 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*' -ErrorAction SilentlyContinue |
    Where-Object { $_.DisplayName -eq 'DevEco Studio' -and $_.InstallLocation } | Select-Object -First 1
  if ($null -ne $taskInstalledStudio) { $taskJbr = Join-Path $taskInstalledStudio.InstallLocation 'jbr' }
}
if (Test-Path -LiteralPath (Join-Path $taskJbr 'bin\java.exe')) {
  $env:JAVA_HOME = $taskJbr
  $env:Path = (Join-Path $taskJbr 'bin') + ';' + $env:Path
}
$env:DEVECO_SDK_HOME = $taskSdk
$env:NODE_HOME = [IO.Path]::GetDirectoryName($taskNode)
$env:Path = $env:NODE_HOME + ';' + $env:Path
Set-Location -LiteralPath $taskProject
# Restrict build and dependency caches to this independent application.
$env:HVIGOR_USER_HOME = Join-Path $taskProject '.cache\hvigor'
$env:npm_config_cache = Join-Path $taskProject '.cache\npm'
& $taskOhpm install --cache (Join-Path $taskProject '.cache\ohpm')
if ($LASTEXITCODE -ne 0) { throw 'ohpm install failed; native build has not started.' }
if ($Clean) {
  & $taskNode $taskHvigor --mode module -p product=default -p module=entry@default clean --no-daemon
  if ($LASTEXITCODE -ne 0) { throw 'Hvigor clean failed.' }
}
& $taskNode $taskHvigor --mode module -p product=default -p module=entry@default -p buildMode=debug assembleHap --no-daemon
if ($LASTEXITCODE -ne 0) { throw 'HarmonyOS native build failed. Inspect the compiler output.' }
Write-Host 'Build completed. Check whether the artifact is signed. This script does not install the app or create signing materials.'
