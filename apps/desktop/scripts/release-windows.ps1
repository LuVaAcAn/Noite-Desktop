param(
  [Parameter(Mandatory = $true)]
  [string]$CertificateThumbprint,
  [string]$TimestampUrl = 'http://timestamp.digicert.com'
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$tauriRoot = Join-Path $repoRoot 'apps\desktop\src-tauri'

$bundleRoot = Join-Path $tauriRoot 'target\release\bundle\nsis'
$binaryPath = Join-Path $tauriRoot 'target\release\Noite.exe'

$signConfig = Join-Path $env:TEMP "noite-sign-$PID.json"
$npm = 'C:\Program Files\nodejs\npm.cmd'
$node = 'C:\Program Files\nodejs\node.exe'
$cargo = Join-Path $env:USERPROFILE '.cargo\bin\cargo.exe'
$cargoAudit = Join-Path $env:USERPROFILE '.cargo\bin\cargo-audit.exe'

function Invoke-Checked([string]$FilePath, [string[]]$Arguments, [string]$WorkingDirectory) {
  Push-Location $WorkingDirectory
  try {
    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$FilePath terminó con código $LASTEXITCODE." }
  } finally {
    Pop-Location
  }
}

if (-not (Test-Path -LiteralPath $npm) -or -not (Test-Path -LiteralPath $node) -or -not (Test-Path -LiteralPath $cargo)) {
  throw 'No se encontraron npm o Cargo en las ubicaciones esperadas.'
}
if (-not (Test-Path -LiteralPath $cargoAudit)) {
  throw 'Falta cargo-audit. Instálalo con cargo install cargo-audit --locked.'
}

$dirty = & git -C $repoRoot status --porcelain
if ($LASTEXITCODE -ne 0 -or $dirty) {
  throw 'La release debe construirse desde un árbol Git limpio.'
}
$commit = (& git -C $repoRoot rev-parse HEAD).Trim()
$version = (Get-Content -Raw -LiteralPath (Join-Path $repoRoot 'apps\desktop\package.json') | ConvertFrom-Json).version
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid release version.' }
$configuration = Get-Content -Raw -LiteralPath (Join-Path $tauriRoot 'tauri.conf.json') | ConvertFrom-Json
if ($configuration.version -ne $version) { throw 'Manifest versions must match.' }
$installerPath = Join-Path $bundleRoot "Noite_${version}_x64-setup.exe"
$releaseRoot = Join-Path $repoRoot "artifacts\release\v$version"

$thumbprint = ($CertificateThumbprint -replace '\s', '').ToUpperInvariant()
$certificate = Get-ChildItem -Path Cert:\CurrentUser\My, Cert:\LocalMachine\My |
  Where-Object Thumbprint -eq $thumbprint |
  Select-Object -First 1
if (-not $certificate) { throw 'No se encontró el certificado indicado en CurrentUser/My ni LocalMachine/My.' }
if (-not $certificate.HasPrivateKey) { throw 'El certificado no tiene una clave privada disponible.' }
if ($certificate.NotAfter -le (Get-Date)) { throw 'El certificado de firma está vencido.' }
if (-not ($certificate.EnhancedKeyUsageList.ObjectId.Value -contains '1.3.6.1.5.5.7.3.3')) {
  throw 'El certificado no declara el uso Code Signing.'
}

$kitsRoot = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10\bin'
$signTool = Get-ChildItem -Path $kitsRoot -Filter signtool.exe -Recurse -ErrorAction SilentlyContinue |
  Where-Object FullName -Match '\\x64\\signtool\.exe$' |
  Sort-Object FullName -Descending |
  Select-Object -First 1 -ExpandProperty FullName
if (-not $signTool) { throw 'No se encontró SignTool x64 del Windows SDK.' }

Invoke-Checked $npm @('ci') $repoRoot
Invoke-Checked $node @('apps/desktop/scripts/generate-third-party-notices.mjs') $repoRoot
Invoke-Checked 'git' @('-C', $repoRoot, 'diff', '--exit-code', '--', 'THIRD_PARTY_LICENSES.md') $repoRoot
Invoke-Checked $npm @('audit', '--audit-level=moderate') $repoRoot
Invoke-Checked $npm @('run', 'lint') $repoRoot
Invoke-Checked $npm @('run', 'test') $repoRoot
Invoke-Checked $npm @('run', 'build') $repoRoot
Invoke-Checked $cargo @('fmt', '--all', '--check') $tauriRoot
Invoke-Checked $cargo @('clippy', '--all-targets', '--locked', '--', '-D', 'warnings') $tauriRoot
Invoke-Checked $cargo @('test', '--locked') $tauriRoot
Invoke-Checked $cargoAudit @('audit') $tauriRoot

$expectedBundleRoot = [IO.Path]::GetFullPath((Join-Path $tauriRoot 'target\release\bundle\nsis'))
if ([IO.Path]::GetFullPath($bundleRoot) -ne $expectedBundleRoot) { throw 'La ruta de bundles no pasó la validación.' }
if (Test-Path -LiteralPath $bundleRoot) { Remove-Item -LiteralPath $bundleRoot -Recurse -Force }

$temporaryConfig = @{
  bundle = @{
    windows = @{
      certificateThumbprint = $thumbprint
      digestAlgorithm = 'sha256'
      timestampUrl = $TimestampUrl
      tsp = $true
    }
  }
}
$temporaryConfig | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $signConfig -Encoding utf8
try {
  $unitSeparator = [char]0x1f
  $env:CARGO_ENCODED_RUSTFLAGS = @(
    '--remap-path-prefix', "$repoRoot=.",
    '--remap-path-prefix', "$($env:USERPROFILE)=<BUILD_USER>"
  ) -join $unitSeparator
  # Tauri applies bundle metadata before invoking SignTool. This ordering is
  # essential: signing Noite.exe before `tauri bundle` invalidates its signature.
  Invoke-Checked $npm @('run', 'tauri', '--', 'build', '--bundles', 'nsis', '--config', $signConfig, '--ci') $repoRoot
} finally {
  Remove-Item Env:CARGO_ENCODED_RUSTFLAGS -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $signConfig -Force -ErrorAction SilentlyContinue
}

if (-not (Test-Path -LiteralPath $binaryPath)) { throw 'Tauri no produjo Noite.exe.' }
if (-not (Test-Path -LiteralPath $installerPath)) { throw 'Tauri no produjo el instalador NSIS esperado.' }
Invoke-Checked $signTool @('verify', '/pa', '/all', '/v', $binaryPath) $repoRoot
Invoke-Checked $signTool @('verify', '/pa', '/all', '/v', $installerPath) $repoRoot

foreach ($path in @($binaryPath, $installerPath)) {
  $signature = Get-AuthenticodeSignature -LiteralPath $path
  if ($signature.Status -ne 'Valid' -or -not $signature.SignerCertificate -or -not $signature.TimeStamperCertificate) {
    throw "Firma Authenticode inválida en ${path}: $($signature.StatusMessage)"
  }
}

$expectedReleaseRoot = [IO.Path]::GetFullPath((Join-Path $repoRoot "artifacts\release\v$version"))
if ([IO.Path]::GetFullPath($releaseRoot) -ne $expectedReleaseRoot) { throw 'La ruta de entrega no pasó la validación.' }
if (Test-Path -LiteralPath $releaseRoot) { Remove-Item -LiteralPath $releaseRoot -Recurse -Force }
New-Item -ItemType Directory -Force -Path $releaseRoot | Out-Null
$finalInstaller = Join-Path $releaseRoot "Noite_${version}_x64-setup.exe"
$finalBinary = Join-Path $releaseRoot 'Noite.exe'
Copy-Item -LiteralPath $installerPath -Destination $finalInstaller -Force
Copy-Item -LiteralPath $binaryPath -Destination $finalBinary -Force
$installerHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $finalInstaller).Hash
$binaryHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $finalBinary).Hash
$manifest = [ordered]@{
  product = 'Noite'
  version = $version
  architecture = 'x64'
  commit = $commit
  builtAtUtc = [DateTime]::UtcNow.ToString('o')
  signer = $certificate.Subject
  certificateThumbprint = $thumbprint
  timestampUrl = $TimestampUrl
  installer = [ordered]@{ file = "Noite_${version}_x64-setup.exe"; sha256 = $installerHash }
  binary = [ordered]@{ file = 'Noite.exe'; sha256 = $binaryHash }
}
$manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $releaseRoot 'release-manifest.json') -Encoding utf8
"$installerHash  Noite_${version}_x64-setup.exe" | Set-Content -LiteralPath (Join-Path $releaseRoot 'SHA256SUMS.txt') -Encoding ascii
"$binaryHash  Noite.exe" | Add-Content -LiteralPath (Join-Path $releaseRoot 'SHA256SUMS.txt') -Encoding ascii

Write-Host "Release firmada preparada en $releaseRoot"
Write-Host "SHA-256 instalador: $installerHash"
