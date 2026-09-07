# Regenerates the dev TLS certificate for the current LAN IP and refreshes the
# root CA copy served at /mkcert-ca.crt. Run whenever the PC's IP changes
# (Get-NetIPAddress shows the current one) — the old cert stops matching.
#
# One-time per machine: choco install mkcert -y ; mkcert -install
# One-time per phone:   open http://<LAN-IP>:5173/mkcert-ca.crt in Safari,
#                       install the profile, then enable full trust:
#                       Ajustes > Geral > Sobre > Confiabilidade de Certificado

$ErrorActionPreference = 'Stop'
$mkcert = 'C:\ProgramData\chocolatey\bin\mkcert.exe'
if (-not (Test-Path $mkcert)) {
    throw 'mkcert not found. Run once: choco install mkcert -y ; mkcert -install'
}

$ip = (Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.*' } |
    Select-Object -First 1 -ExpandProperty IPAddress)
if (-not $ip) { throw 'No LAN IPv4 address found.' }

New-Item -ItemType Directory -Force -Path certs | Out-Null

# Remove certs issued for previous IPs.
Get-ChildItem certs -File |
    Where-Object { $_.Name -notin @("$ip.pem", "$ip-key.pem", 'rootCA.pem') } |
    Remove-Item -Force

& $mkcert -cert-file "certs\$ip.pem" -key-file "certs\$ip-key.pem" $ip localhost 127.0.0.1
if ($LASTEXITCODE -ne 0) { throw 'mkcert failed.' }

$caroot = (& $mkcert -CAROOT).Trim()
Copy-Item (Join-Path $caroot 'rootCA.pem') certs\rootCA.pem -Force

Write-Host ""
Write-Host "Cert OK -> https://${ip}:5173/  (plus localhost / 127.0.0.1)"
Write-Host "CA para o celular: http://${ip}:5173/mkcert-ca.crt"
