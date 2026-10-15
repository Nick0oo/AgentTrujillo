[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$Email,

  [Parameter(Mandatory = $true)]
  [string]$Password,

  [string]$AgentUrl = "http://127.0.0.1:2000",

  [string]$ChildId
)

$ErrorActionPreference = "Stop"

function Get-LocalSupabaseValues {
  $oldPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = "Continue"
    $lines = npx supabase status -o env 2>$null
  } finally {
    $ErrorActionPreference = $oldPreference
  }

  $values = @{}
  foreach ($line in $lines) {
    if ($line -match '^([A-Z_]+)=(.*)$') {
      $values[$matches[1]] = $matches[2].Trim('"')
    }
  }
  return $values
}

function Assert-LoopbackEndpoint([string]$Value, [int]$Port, [string]$Name) {
  $uri = [Uri]$Value
  if ($uri.Scheme -ne "http" -or $uri.Host -notin @("127.0.0.1", "localhost", "::1") -or $uri.Port -ne $Port) {
    throw "DEV_ONLY_REQUIRES_LOCAL_$Name"
  }
}

function Get-ResponseJson([Microsoft.PowerShell.Commands.BasicHtmlWebResponseObject]$Response) {
  return ($Response.Content | ConvertFrom-Json)
}

$supabase = Get-LocalSupabaseValues
$supabaseUrl = $supabase["API_URL"]
$anonKey = $supabase["ANON_KEY"]
if (-not $supabaseUrl -or -not $anonKey) {
  throw "LOCAL_SUPABASE_KEYS_UNAVAILABLE"
}
Assert-LoopbackEndpoint $supabaseUrl 54321 "SUPABASE"
Assert-LoopbackEndpoint $AgentUrl 2000 "AGENT"

$health = Invoke-WebRequest -UseBasicParsing -Uri "$AgentUrl/eve/v1/health"
$authHeaders = @{
  apikey = $anonKey
  "Content-Type" = "application/json"
}
$login = Invoke-WebRequest -UseBasicParsing -Method Post `
  -Uri "$supabaseUrl/auth/v1/token?grant_type=password" `
  -Headers $authHeaders `
  -Body (@{ email = $Email; password = $Password } | ConvertTo-Json)
$session = Get-ResponseJson $login
$bearer = @{
  Authorization = "Bearer $($session.access_token)"
  apikey = $anonKey
}

$directoryResponse = Invoke-WebRequest -UseBasicParsing `
  -Uri "$AgentUrl/creciendo/v1/children" `
  -Headers $bearer
$directory = Get-ResponseJson $directoryResponse
$authorizedChildren = @($directory.careSpaces | ForEach-Object { @($_.children) })
if (-not $ChildId) {
  $ChildId = $authorizedChildren | Select-Object -First 1 -ExpandProperty childId
}
if (-not $ChildId) {
  throw "NO_AUTHORIZED_LOCAL_CHILD"
}
if (-not (@($authorizedChildren | ForEach-Object { $_.childId }) -contains $ChildId)) {
  throw "CHILD_NOT_IN_AUTHORIZED_DIRECTORY"
}

$capabilities = @{
  channelVersions = @("creciendo.channel.v1")
  eventVersions = @("creciendo.channel-event.v1")
  widgetVersions = @("growth.summary.v1")
  ndjson = $true
}
$contextBody = @{
  version = "creciendo.channel.v1"
  childId = $ChildId
  nonce = "probe-$([Guid]::NewGuid().ToString('N'))"
  capabilities = $capabilities
}
$contextResponse = Invoke-WebRequest -UseBasicParsing -Method Post `
  -Uri "$AgentUrl/creciendo/v1/child-context" `
  -Headers ($bearer + @{ "Content-Type" = "application/json" }) `
  -Body ($contextBody | ConvertTo-Json -Depth 5)
$context = Get-ResponseJson $contextResponse
$scopedHeaders = $bearer + @{ "X-Child-Context" = $context.childContextToken }

$historyResponse = Invoke-WebRequest -UseBasicParsing `
  -Uri "$AgentUrl/creciendo/v1/anthropometry" `
  -Headers $scopedHeaders
$history = Get-ResponseJson $historyResponse
$growthResponse = Invoke-WebRequest -UseBasicParsing `
  -Uri "$AgentUrl/creciendo/v1/anthropometry/growth" `
  -Headers $scopedHeaders
$growth = Get-ResponseJson $growthResponse

[pscustomobject]@{
  Environment = "DEV_ONLY/local"
  AgentHealthStatus = [int]$health.StatusCode
  AuthStatus = [int]$login.StatusCode
  DirectoryStatus = [int]$directoryResponse.StatusCode
  AuthorizedChildren = $authorizedChildren.Count
  ChildContextStatus = [int]$contextResponse.StatusCode
  HistoryStatus = [int]$historyResponse.StatusCode
  HistoryCount = @($history.measurements).Count
  GrowthStatus = [int]$growthResponse.StatusCode
  GrowthState = [string]$growth.status
  GrowthPointCount = @($growth.points).Count
  GrowthReferences = @($growth.points | ForEach-Object { $_.provenance.referenceCode } | Select-Object -Unique)
} | ConvertTo-Json -Depth 4
