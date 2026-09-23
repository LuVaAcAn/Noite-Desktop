param(
  [string]$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
)

$ErrorActionPreference = 'Stop'
$dist = Join-Path $RepositoryRoot 'apps\desktop\dist'
$binary = Join-Path $RepositoryRoot 'apps\desktop\src-tauri\target\release\Noite.exe'
$version = (Get-Content -Raw -LiteralPath (Join-Path $RepositoryRoot 'apps\desktop\package.json') | ConvertFrom-Json).version
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw 'Versión de instalador no válida.' }
$installer = Join-Path $RepositoryRoot "apps\desktop\src-tauri\target\release\bundle\nsis\Noite_${version}_x64-setup.exe"

if (-not (Test-Path -LiteralPath $dist)) { throw 'Falta el directorio dist de producción.' }

$sourceMaps = @(Get-ChildItem -LiteralPath $dist -File -Recurse -Filter '*.map')
if ($sourceMaps.Count -gt 0) { throw "dist contiene $($sourceMaps.Count) source map(s)." }

$tracked = @(& git -C $RepositoryRoot ls-files)
if ($LASTEXITCODE -ne 0) { throw 'No se pudo enumerar el contenido versionado.' }
$forbiddenTracked = @($tracked | Where-Object {
  $_ -match '(^|/)(\.env\.local|\.env\.production)$' -or
  $_ -match '\.(pfx|p12|jks|keystore|key|pem)$'
})
if ($forbiddenTracked.Count -gt 0) {
  throw "Hay credenciales o archivos privados versionados: $($forbiddenTracked -join ', ')"
}

$scanFiles = @(Get-ChildItem -LiteralPath $dist -File -Recurse | Select-Object -ExpandProperty FullName)
foreach ($candidate in @($binary, $installer)) {
  if (Test-Path -LiteralPath $candidate) { $scanFiles += $candidate }
}

$scanner = Join-Path $PSScriptRoot 'scan-artifact-markers.mjs'
& node $scanner --self-test
if ($LASTEXITCODE -ne 0) { throw 'Fallaron las pruebas del inspector de artefactos.' }
& node $scanner @scanFiles
if ($LASTEXITCODE -ne 0) { throw 'Los artefactos no superaron la inspección.' }

Write-Host 'Artefactos: sin source maps, credenciales privadas ni rutas locales conocidas.'
