$env:HOST = "0.0.0.0"
$env:PORT = "3000"

if (-not $env:ADMIN_PASSWORD) {
  $env:ADMIN_PASSWORD = "admin123"
}

if (-not $env:SESSION_SECRET) {
  $bytes = New-Object byte[] 32
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $env:SESSION_SECRET = ($bytes | ForEach-Object { $_.ToString("x2") }) -join ""
}

Write-Host "Starting Age Pool Tracker on http://localhost:$env:PORT"
Write-Host "To share on your LAN, open http://<this-computer-ip>:$env:PORT from another device."
Write-Host "Admin password: $env:ADMIN_PASSWORD"

node server.js
