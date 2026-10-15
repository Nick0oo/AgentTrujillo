param(
  [int]$Port = 2000
)

$ErrorActionPreference = 'Stop'
$backendRoot = Split-Path -Parent $PSScriptRoot

Push-Location $backendRoot
try {
  # Supabase CLI writes a warning to stderr when optional containers are stopped.
  # Keep that warning from aborting the launcher; the API/DB env output is still usable.
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $statusText = npx supabase status -o env 2>$null | Out-String
  $ErrorActionPreference = $previousErrorActionPreference
} finally {
  Pop-Location
}

function Local-EnvValue([string]$Name) {
  $line = (($statusText -split "`r?`n") | Where-Object { $_ -like "$Name=*" } | Select-Object -First 1)
  if ([string]::IsNullOrWhiteSpace($line)) { throw "LOCAL_SUPABASE_${Name}_MISSING" }
  return $line.Substring($Name.Length + 1).Trim()
}

$localAnonKey = Local-EnvValue 'ANON_KEY'
$localServiceRoleKey = Local-EnvValue 'SERVICE_ROLE_KEY'

Set-Item Env:APP_ENV -Value 'development'
Set-Item Env:SUPABASE_URL -Value 'http://127.0.0.1:54321'
Set-Item Env:SUPABASE_PUBLISHABLE_KEY -Value $localAnonKey
Set-Item Env:SUPABASE_SERVICE_ROLE_KEY -Value $localServiceRoleKey
Set-Item Env:SUPABASE_JWT_ISSUER -Value 'http://127.0.0.1:54321/auth/v1'
Set-Item Env:SUPABASE_JWT_AUDIENCE -Value 'authenticated'
Set-Item Env:CRECIMIENTO_GROWTH_MODE -Value 'DEV_ONLY'
Set-Item Env:PORT -Value $Port

Set-Location $backendRoot
npm run dev
