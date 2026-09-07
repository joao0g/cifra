# Abre a porta do dev server na rede local (somente a sub-rede /24).
# Executar elevado: clique em "Sim" no prompt do UAC.
$port = 5173
$subnet = "192.168.15.0/24"
$name = "Cifra PWA dev $port (LAN only)"

if (-not ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Error "Este script precisa ser executado como administrador."
    exit 1
}

Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue | Remove-NetFirewallRule

New-NetFirewallRule `
    -DisplayName $name `
    -Direction Inbound `
    -Protocol TCP `
    -LocalPort $port `
    -RemoteAddress $subnet `
    -Action Allow `
    -Profile Any |
    Out-Null

Get-NetFirewallRule -DisplayName $name |
    Select-Object DisplayName, Enabled, Direction, Action |
    Format-Table -AutoSize
