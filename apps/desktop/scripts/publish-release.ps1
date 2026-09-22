param([Parameter(Mandatory=$true)][string]$ReleaseDirectory)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$repository = 'LuVaAcAn/Noite-Desktop'
$version = (Get-Content -Raw -LiteralPath (Join-Path $root 'apps\desktop\package.json') | ConvertFrom-Json).version
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid version.' }
$origin = & git -C $root remote get-url origin
if ($LASTEXITCODE -ne 0 -or $origin -notin @("https://github.com/$repository.git", "https://github.com/$repository", "git@github.com:${repository}.git")) { throw 'Unexpected repository.' }
$dirty = & git -C $root status --porcelain
if ($LASTEXITCODE -ne 0 -or $dirty) { throw 'A clean checkout is required.' }
$head = & git -C $root rev-parse HEAD
if ($LASTEXITCODE -ne 0) { throw 'Cannot identify commit.' }
$tagCommit = & git -C $root rev-list -n 1 "v$version"
if ($LASTEXITCODE -ne 0 -or $head -ne $tagCommit) { throw 'Release tag must identify this commit.' }
$directory = (Resolve-Path -LiteralPath $ReleaseDirectory).Path
$manifestPath = Join-Path $directory 'release-manifest.json'
$manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
if ($manifest.product -ne 'Noite' -or $manifest.version -ne $version -or $manifest.commit -ne $head) { throw 'Manifest does not match checkout.' }
$installer = Join-Path $directory "Noite_${version}_x64-setup.exe"
$binary = Join-Path $directory 'Noite.exe'
foreach ($entry in @(@{ Path=$installer; Hash=$manifest.installer.sha256 }, @{ Path=$binary; Hash=$manifest.binary.sha256 })) {
  if ((Get-FileHash -LiteralPath $entry.Path -Algorithm SHA256).Hash -ne $entry.Hash) { throw 'Artifact digest mismatch.' }
  $signature = Get-AuthenticodeSignature -LiteralPath $entry.Path
  if ($signature.Status -ne 'Valid' -or -not $signature.TimeStamperCertificate) { throw 'A valid timestamped signature is required.' }
}
$checksums = Join-Path $directory 'SHA256SUMS.txt'
if (-not (Test-Path -LiteralPath $checksums)) { throw 'Checksums are required.' }
& gh release create "v$version" $installer $checksums $manifestPath --repo $repository --verify-tag --draft --title "Noite $version" --notes 'Biblioteca local de actividades, planes y recuerdos. Comparte tus datos mediante archivos .noche.'
if ($LASTEXITCODE -ne 0) { throw 'Could not prepare release draft.' }
