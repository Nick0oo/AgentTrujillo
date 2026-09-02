[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$Email,

  [Parameter(Mandatory = $true)]
  [string]$Password
)

$ErrorActionPreference = "Stop"

$statusLines = npx supabase status -o env 2>$null
$values = @{}
foreach ($line in $statusLines) {
  if ($line -match '^([A-Z_]+)=(.*)$') {
    $values[$matches[1]] = $matches[2].Trim('"')
  }
}

$apiUrl = $values["API_URL"]
$serviceRoleKey = $values["SERVICE_ROLE_KEY"]
if (-not $apiUrl -or -not $serviceRoleKey) {
  throw "LOCAL_SUPABASE_KEYS_UNAVAILABLE"
}

$parsedApiUrl = [Uri]$apiUrl
if ($parsedApiUrl.Scheme -ne "http" -or $parsedApiUrl.Host -notin @("127.0.0.1", "localhost", "::1") -or $parsedApiUrl.Port -ne 54321) {
  throw "DEV_ONLY_REQUIRES_LOCAL_SUPABASE"
}

$headers = @{
  apikey = $serviceRoleKey
  Authorization = "Bearer $serviceRoleKey"
  "Content-Type" = "application/json"
}
$body = @{
  email = $Email
  password = $Password
  email_confirm = $true
  user_metadata = @{
    dev_only = $true
    source = "DEV_ONLY"
  }
} | ConvertTo-Json -Depth 4

try {
  $user = Invoke-RestMethod -Method Post -Uri "$apiUrl/auth/v1/admin/users" -Headers $headers -Body $body
  "created_local_user=$($user.id) confirmed=$($null -ne $user.email_confirmed_at)"
} catch {
  $message = $_.ErrorDetails.Message
  if ($message -match "already been registered|already exists") {
    "local_user=already_exists"
    exit 0
  }
  throw
}
