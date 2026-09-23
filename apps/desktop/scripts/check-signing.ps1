$ErrorActionPreference = 'Stop'
$certificates = @(Get-ChildItem -Path Cert:\CurrentUser\My, Cert:\LocalMachine\My | Where-Object {
  $_.HasPrivateKey -and ($_.EnhancedKeyUsageList.ObjectId.Value -contains '1.3.6.1.5.5.7.3.3')
})
$kits = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10\bin'
$tool = Get-ChildItem -LiteralPath $kits -Filter signtool.exe -Recurse -ErrorAction SilentlyContinue |
  Where-Object FullName -Match '\\x64\\signtool\.exe$' |
  Sort-Object FullName -Descending | Select-Object -First 1 -ExpandProperty FullName
$usable = @($certificates | Where-Object { $_.NotBefore -le (Get-Date) -and $_.NotAfter -gt (Get-Date) })
[pscustomobject]@{
  SignTool = $tool
  AvailableCertificates = $usable.Count
  ReadyForSigningAttempt = [bool]($tool -and $usable.Count)
  Note = 'La clave, cadena de confianza y acceso al token se verifican durante la firma. No se exportan certificados ni claves.'
}
$certificates | Select-Object Subject, Thumbprint, NotBefore, NotAfter
if (-not $usable.Count) {
  Write-Output 'No se encontró un certificado vigente con clave privada y uso Code Signing. Configura el certificado/token del emisor y vuelve a comprobar.'
}
