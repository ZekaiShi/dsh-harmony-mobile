param([string]$Version = '0.7.0', [int]$CoreTests = 64)
$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid version.' }
Set-Location -LiteralPath $taskRoot
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$taskArtifact = "deliveries/DSH-Connect-$Version-unsigned.hap"
Copy-Item -LiteralPath 'entry/build/default/outputs/default/entry-default-unsigned.hap' -Destination $taskArtifact -Force
$taskZip = [IO.Compression.ZipFile]::OpenRead((Join-Path $taskRoot $taskArtifact))
try {
  $taskReader = New-Object IO.StreamReader($taskZip.GetEntry('module.json').Open())
  try { $taskManifest = $taskReader.ReadToEnd() | ConvertFrom-Json } finally { $taskReader.Dispose() }
  if ($taskManifest.app.versionName -ne $Version) { throw 'Version mismatch.' }
  $taskReport = Get-Content reports/native-build.json -Raw | ConvertFrom-Json
  $taskReport.checkedAt = [DateTimeOffset]::Now.ToString('o')
  $taskReport.version = $Version
  $taskReport.artifact = $taskArtifact
  $taskReport.bytes = (Get-Item -LiteralPath $taskArtifact).Length
  $taskReport.sha256 = (Get-FileHash -LiteralPath $taskArtifact -Algorithm SHA256).Hash.ToLowerInvariant()
  $taskReport.compiledArkTsBytes = $taskZip.GetEntry('ets/modules.abc').Length
  $taskReport.entries = @($taskZip.Entries | ForEach-Object FullName)
  $taskReport.manifest = $taskManifest
  $taskReport.coreTests.passed = $CoreTests
  $taskBuildLog = Get-Content reports/native-build-current.log -Raw
  if ($taskBuildLog -notmatch 'BUILD SUCCESSFUL' -or $taskBuildLog -match 'BUILD FAILED') { throw 'Native compiler did not pass.' }
  $taskTaskMatch = [regex]::Match($taskBuildLog, '(\d+) tasks in total: (\d+) executed, (\d+) up-to-date')
  if (-not $taskTaskMatch.Success) { throw 'Build task counts missing.' }
  $taskReport.tasks.total = [int]$taskTaskMatch.Groups[1].Value
  $taskReport.tasks.executed = [int]$taskTaskMatch.Groups[2].Value
  $taskReport.tasks.upToDate = [int]$taskTaskMatch.Groups[3].Value
  $taskReport.architecture = 'ArkUI + native DSH HTTP/SSE + RCP chat and media + Asset Store + private conversation and image files; no Web node'
  $taskReport.limitations = @('Physical device, real public HTTPS tunnel, real model/image provider and camera recognition NOT_RUN', 'Core PIN test uses simulated tunnel headers', 'File references show path and line range; upstream QR bridge has no file preview endpoint', 'DSH attachments, math/HTML, DSH model/task settings and anchor scrolling not implemented', 'Chat supports four protocols; media supports compatible Images/JSON edits, Seedream, Gemini, SiliconFlow and OpenRouter Images; no video/audio, async image polling or old multipart edits', 'Model access and provider network availability require user-configured service validation; no paid models called', 'Formal publisher, contact, privacy policy, production signing and applicable qualifications remain to be completed', 'Dark resources supplied; dark mode runtime NOT_RUN', 'Real holding sensor, material optics and power on physical phone NOT_RUN; API23 fallback compiled but old-OS runtime NOT_RUN')
  $taskLint = Get-Content reports/native-lint.json -Raw
  if ($taskLint.Trim() -ne '[]') { throw 'Native lint is not clean.' }
  $taskVerification = Get-Content reports/emulator-compatibility.json -Raw | ConvertFrom-Json
  $taskAssistant = Get-Content reports/assistant-emulator.json -Raw | ConvertFrom-Json
  $taskMedia = Get-Content reports/media-emulator.json -Raw | ConvertFrom-Json
  if (-not $taskVerification.pass -or $taskVerification.version -ne $Version -or -not $taskAssistant.pass -or $taskAssistant.version -ne $Version -or -not $taskMedia.pass -or $taskMedia.version -ne $Version) { throw 'Current-version emulator verification incomplete.' }
  $taskProviders = Get-Content reports/providers-emulator.json -Raw | ConvertFrom-Json
  if (-not $taskProviders.pass -or $taskProviders.version -ne $Version) { throw 'Current provider emulator verification incomplete.' }
  $taskTotal = $taskVerification.checked.Count + $taskAssistant.checked.Count + $taskMedia.checked.Count + $taskProviders.checked.Count
  $taskReport.emulator | Add-Member -NotePropertyName providerChecks -NotePropertyValue $taskProviders.checked.Count -Force
  $taskReport.emulator | Add-Member -NotePropertyName providerReport -NotePropertyValue 'reports/providers-emulator.json' -Force
  $taskReport.emulator.checksPassed = $taskTotal
  $taskReport.emulator | Add-Member -NotePropertyName desktopChecks -NotePropertyValue $taskVerification.checked.Count -Force
  $taskReport.emulator | Add-Member -NotePropertyName assistantChecks -NotePropertyValue $taskAssistant.checked.Count -Force
  $taskReport.emulator | Add-Member -NotePropertyName assistantReport -NotePropertyValue 'reports/assistant-emulator.json' -Force
  $taskReport.emulator | Add-Member -NotePropertyName mediaChecks -NotePropertyValue $taskMedia.checked.Count -Force
  $taskReport.emulator | Add-Member -NotePropertyName mediaReport -NotePropertyValue 'reports/media-emulator.json' -Force
  $taskReport.deviceVerification = "API26_EMULATOR_$($taskTotal)_CHECKS_PASS; physical device NOT_RUN"
  $taskUtf8 = New-Object Text.UTF8Encoding($false)
  [IO.File]::WriteAllText((Join-Path $taskRoot 'reports/native-build.json'), ($taskReport | ConvertTo-Json -Depth 25), $taskUtf8)
  $taskRun = Get-Content reports/emulator-run.json -Raw | ConvertFrom-Json
  $taskRun.checkedAt = $taskReport.checkedAt
  $taskRun.version = $Version
  $taskRun.artifact = $taskArtifact
  $taskRun.checksPassed = $taskTotal
  $taskRun.nativeUI = 'ArkUI standalone assistant, media studio and DSH session list, messages, composer and questions; Web absent'
  $taskRun.readyScreen = 'native workbench; ready for model configuration or desktop QR'
  $taskRun | Add-Member -NotePropertyName assistantReport -NotePropertyValue 'reports/assistant-emulator.json' -Force
  $taskRun | Add-Member -NotePropertyName mediaReport -NotePropertyValue 'reports/media-emulator.json' -Force
  $taskRun.PSObject.Properties.Remove('testOnlyRecentRecordsRemoved')
  [IO.File]::WriteAllText((Join-Path $taskRoot 'reports/emulator-run.json'), ($taskRun | ConvertTo-Json -Depth 10), $taskUtf8)
  Write-Output "Verified HAP: $taskArtifact ($($taskReport.bytes) bytes)"
  Write-Output "SHA256: $($taskReport.sha256)"
} finally { $taskZip.Dispose() }
