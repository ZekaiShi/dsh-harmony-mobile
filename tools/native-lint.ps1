param([string]$ToolRoot = $env:OHOS_CLT)
$ErrorActionPreference = 'Stop'
$taskProject = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (-not $ToolRoot) { $ToolRoot = Join-Path $taskProject '.tools\clt-26\command-line-tools' }
$taskToolRoot = [IO.Path]::GetFullPath($ToolRoot)
$taskNode = Join-Path $taskToolRoot 'tool\node\node.exe'
$taskLinter = Join-Path $taskToolRoot 'codelinter\index.js'
if (-not (Test-Path -LiteralPath $taskLinter)) { throw 'Official CodeLinter not found.' }
$env:NODE_HOME = [IO.Path]::GetDirectoryName($taskNode)
$env:DEVECO_SDK_HOME = Join-Path $taskToolRoot 'sdk'
$env:Path = $env:NODE_HOME + ';' + $env:Path
Set-Location -LiteralPath $taskProject
# The bundled Windows launcher always returns 1; invoke its exact Node entry instead.
& $taskNode $taskLinter $env:DEVECO_SDK_HOME entry/src/main/ets -p default -f json -o reports/native-lint.json -e 'error,warn'
if ($LASTEXITCODE -ne 0) { throw 'CodeLinter reported diagnostics. Inspect reports/native-lint.json.' }
