param([string]$Version = '')
$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location -LiteralPath $taskRoot
if (-not $Version) { $Version = (Get-Content package.json -Raw | ConvertFrom-Json).version }
if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid version.' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
$taskSourcePath = Join-Path $taskRoot "deliveries/DSH-Connect-HarmonyOS-source-v$Version.zip"
$taskZip = [IO.Compression.ZipFile]::OpenRead($taskSourcePath)
$taskForbidden = @(); $taskSecrets = @()
try {
  foreach ($taskEntry in $taskZip.Entries) {
    if ($taskEntry.FullName -match '/(reports|deliveries|\.cache|\.tools|\.research|\.git|\.idea|node_modules|oh_modules|build)/|\.(p12|p7b|cer|keystore|pem|key|p8|der|jks|hap)$|/(\.env[^/]*|local\.properties)$') { $taskForbidden += $taskEntry.FullName }
    if ($taskEntry.FullName -match '\.(ets|ts|mjs|ps1|json|json5|md|txt|svg)$|/LICENSE$') {
      $taskReader = New-Object IO.StreamReader($taskEntry.Open())
      try { $taskText = $taskReader.ReadToEnd() } finally { $taskReader.Dispose() }
      if ($taskText -match '(?m)^-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----' -or $taskText -match '(?i)["''][ \t]*(?:sk-(?:proj-|or-v1-)?[a-z0-9_-]{24,}|AKIA[A-Z0-9]{16})[ \t]*["'']') { $taskSecrets += $taskEntry.FullName }
      if ($taskEntry.FullName -eq 'dsh-harmonyos/build-profile.json5') {
        $taskProfile = $taskText | ConvertFrom-Json
        if ($taskProfile.app.signingConfigs.Count -ne 0 -or @($taskProfile.app.products | Where-Object { $_.signingConfig }).Count -ne 0 -or $taskText -match 'storePassword|keyPassword|certpath|storeFile|profileFile') { throw 'Local signing data found in exported profile.' }
      }
    }
  }
  $taskCount = $taskZip.Entries.Count
} finally { $taskZip.Dispose() }
if ($taskForbidden.Count -or $taskSecrets.Count) { throw ('Export review failed; inspect filenames only: ' + (($taskForbidden + $taskSecrets) -join ', ')) }
$taskHapPath = Join-Path $taskRoot 'entry/build/default/outputs/default/entry-default-unsigned.hap'
$taskHap = [IO.Compression.ZipFile]::OpenRead($taskHapPath)
try {
  $taskManifestEntry = $taskHap.GetEntry('module.json')
  if (-not $taskManifestEntry) { throw 'HAP module manifest missing.' }
  $taskReader = New-Object IO.StreamReader($taskManifestEntry.Open())
  try { $taskManifest = $taskReader.ReadToEnd() | ConvertFrom-Json } finally { $taskReader.Dispose() }
  if ($taskManifest.app.versionName -ne $Version) { throw 'HAP version mismatch.' }
  $taskHapForbidden = @($taskHap.Entries | Where-Object { $_.FullName -match '(^|/)(node_modules|\.research|\.cache|reports|tools|tests|local\.properties|build-profile\.json5)(/|$)|\.(p12|keystore|key|pem|jks)$' })
  if ($taskHapForbidden.Count) { throw 'Development or private signing files in HAP.' }
} finally { $taskHap.Dispose() }
$taskAudit = Get-Content reports/npm-audit-fixed-2026-10-26.json -Raw | ConvertFrom-Json
if ($taskAudit.metadata.vulnerabilities.total -ne 0) { throw 'Dependency advisory scan is not clean.' }
$taskResult = [ordered]@{
  version = $Version; checkedAt = [DateTime]::UtcNow.ToString('o'); pass = $true
  sourceEntries = $taskCount; sourceForbiddenFiles = 0; recognizedSecretPatterns = 0
  sourceSha256 = (Get-FileHash -LiteralPath $taskSourcePath -Algorithm SHA256).Hash
  hapSha256 = (Get-FileHash -LiteralPath $taskHapPath -Algorithm SHA256).Hash
  bundleName = $taskManifest.app.bundleName; debuggable = $taskManifest.app.debug
  npmKnownAdvisories = 0
  note = 'Pattern and packaging checks supplement manual review. No absolute absence-of-secrets or absence-of-vulnerabilities guarantee. Debug HAP is not a store release.'
}
$taskResult | ConvertTo-Json -Depth 6 | Set-Content ("reports/security-delivery-$Version.json") -Encoding UTF8
$taskResult | ConvertTo-Json -Depth 6
