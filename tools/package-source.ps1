param([string]$Version = '')
$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location -LiteralPath $taskRoot
if (-not $Version) { $Version = (Get-Content package.json -Raw | ConvertFrom-Json).version }
if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid version.' }
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
New-Item -ItemType Directory -Path (Join-Path $taskRoot 'deliveries') -Force | Out-Null
$taskFiles = @(rg --files --hidden -g '!node_modules/**' -g '!oh_modules/**' -g '!.tools/**' -g '!.cache/**' -g '!.research/**' -g '!.hvigor/**' -g '!**/build/**' -g '!deliveries/**' -g '!reports/**' -g '!.git/**' -g '!.idea/**' -g '!local.properties' -g '!*.p12' -g '!*.p7b' -g '!*.cer' -g '!*.keystore' -g '!*.pem' -g '!*.key' -g '!*.p8' -g '!*.der' -g '!*.jks' -g '!signing.local.json5' -g '!.env*' | Where-Object {
  # Public sources are an allowlist. Screenshots, runtime reports and unknown
  # top-level folders must never become public merely because they were added.
  $taskRelative = $_.Replace('\', '/')
  $taskRelative -match '^(entry/src/|AppScope/|hvigor/|tests/)' -or
  $taskRelative -match '^(docs/[^/]+\.md|tools/[^/]+\.(mjs|ps1)|entry/(build-profile\.json5|hvigorfile\.ts|oh-package\.json5))$' -or
  $taskRelative -match '^(README\.md|LICENSE|THIRD_PARTY_NOTICES\.md|\.gitignore|build-profile\.json5|hvigorfile\.ts|oh-package\.json5|package(-lock)?\.json|tsconfig\.core\.json)$'
} | Sort-Object)
$taskTemporary = Join-Path $taskRoot ('deliveries/source-' + [guid]::NewGuid().ToString('N') + '.tmp.zip')
$taskArchive = [IO.Compression.ZipFile]::Open($taskTemporary, [IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($taskFile in $taskFiles) {
    $taskFullPath = [IO.Path]::GetFullPath((Join-Path $taskRoot $taskFile))
    if (-not $taskFullPath.StartsWith($taskRoot + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Source escapes project.' }
    $taskEntryName = 'dsh-harmonyos/' + $taskFile.Replace('\', '/')
    if ($taskFile -eq 'build-profile.json5') {
      # Studio stores local signing paths and encrypted passwords here. Export a portable unsigned profile.
      $taskBuildProfile = Get-Content -LiteralPath $taskFullPath -Raw -Encoding UTF8 | ConvertFrom-Json
      $taskBuildProfile.app.signingConfigs = @()
      foreach ($taskProduct in $taskBuildProfile.app.products) { $taskProduct.PSObject.Properties.Remove('signingConfig') }
      $taskEntry = $taskArchive.CreateEntry($taskEntryName, [IO.Compression.CompressionLevel]::Optimal)
      $taskWriter = New-Object IO.StreamWriter($taskEntry.Open(), (New-Object Text.UTF8Encoding($false)))
      try { $taskWriter.Write(($taskBuildProfile | ConvertTo-Json -Depth 40)) } finally { $taskWriter.Dispose() }
    } else {
      $taskIsText = $taskFile -match '\.(ets|ts|mjs|ps1|json|json5|md|txt|svg)$' -or $taskFile -eq 'LICENSE'
      if ($taskIsText) {
        $taskContent = Get-Content -LiteralPath $taskFullPath -Raw -Encoding UTF8
        if ($taskContent -match '(?m)^-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----' -or
            $taskContent -match '(?i)["''][ \t]*(?:sk-(?:proj-|or-v1-)?[a-z0-9_-]{24,}|AKIA[A-Z0-9]{16})[ \t]*["'']') {
          throw ('Potential secret in source file; inspect locally: ' + $taskFile)
        }
      }
      [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($taskArchive, $taskFullPath, $taskEntryName, [IO.Compression.CompressionLevel]::Optimal) | Out-Null
    }
  }
} finally { $taskArchive.Dispose() }
$taskCheck = [IO.Compression.ZipFile]::OpenRead($taskTemporary)
try {
  if ($taskCheck.Entries.Count -ne $taskFiles.Count) { throw 'Archive count mismatch.' }
  if (@($taskCheck.Entries | Where-Object { $_.FullName -match '/(\.tools|\.cache|\.research|node_modules|oh_modules|build|deliveries|reports|\.idea|\.git)/|\.(p12|p7b|cer|keystore|pem|key|p8|der|jks)$' }).Count -gt 0) { throw 'Excluded content found.' }
} finally { $taskCheck.Dispose() }
$taskDestination = Join-Path $taskRoot ('deliveries/DSH-Connect-HarmonyOS-source-v' + $Version + '.zip')
Move-Item -LiteralPath $taskTemporary -Destination $taskDestination -Force
Write-Output ('Source archive: ' + $taskDestination)
Write-Output ('Entries: ' + $taskFiles.Count)
