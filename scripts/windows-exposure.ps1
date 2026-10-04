param([string]$ExplicitPids = '')
$ErrorActionPreference = 'Stop'
$inspectionErrors = [System.Collections.Generic.List[string]]::new()
$selectedProcesses = @()
$selectedEndpoints = @()
$selectedRules = @()
$activeProfiles = @()
$firewallProfiles = @()
$requestedPids = @($ExplicitPids.Split(',') | Where-Object { $_ -match '^[1-9][0-9]*$' } | ForEach-Object { [int]$_ })
function Get-ExposureFilters([string]$Command, [object[]]$Rules = @()) {
  $filters = @{}
  try { & $Command -PolicyStore ActiveStore | ForEach-Object { $filters[$_.InstanceID] = $_ } }
  catch {
    if ($Rules.Count -gt 0) {
      try { $Rules | & $Command | ForEach-Object { $filters[$_.InstanceID] = $_ } }
      catch { $inspectionErrors.Add("$Command relevant-rule inspection denied or partial; Windows rights may be required") }
    } else { $inspectionErrors.Add("$Command inspection denied or unavailable") }
  }
  return $filters
}
try {
  $selectedProcesses = @(Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId,Name,ExecutablePath | Where-Object { $_.Name -in @('Stream Jams.exe', 'Streamer.bot.exe', 'Speaker.bot.exe') -or $_.ProcessId -in $requestedPids } | ForEach-Object { @{ processId = [int]$_.ProcessId; parentProcessId = [int]$_.ParentProcessId; name = $_.Name; executablePath = $_.ExecutablePath } })
  foreach ($requestedPid in $requestedPids) { if ($requestedPid -notin $selectedProcesses.processId) { $inspectionErrors.Add('Explicit process exited or was not observable') } }
  if (@($selectedProcesses | Where-Object { -not $_.executablePath }).Count) { $inspectionErrors.Add('Some executable paths were not observable') }
} catch { $inspectionErrors.Add('Process inspection denied or unavailable') }
foreach ($endpointProtocol in @('TCP','UDP')) {
  try {
    $items = if ($endpointProtocol -eq 'TCP') { @(Get-NetTCPConnection -State Listen) } else { @(Get-NetUDPEndpoint) }
    $selectedEndpoints += @($items | Where-Object { $_.OwningProcess -in $selectedProcesses.processId } | ForEach-Object { @{ processId = [int]$_.OwningProcess; protocol = $endpointProtocol; address = $_.LocalAddress; port = [int]$_.LocalPort } })
  } catch { $inspectionErrors.Add("$endpointProtocol endpoint inspection denied or unavailable") }
}
try {
  $activeProfiles = @(Get-NetConnectionProfile | ForEach-Object { if ($_.NetworkCategory -eq 'DomainAuthenticated') { 'Domain' } else { [string]$_.NetworkCategory } } | Select-Object -Unique)
  $firewallProfiles = @(Get-NetFirewallProfile -PolicyStore ActiveStore | Where-Object { [string]$_.Name -in $activeProfiles } | ForEach-Object { @{ name = [string]$_.Name; enabled = [string]$_.Enabled; defaultInboundAction = [string]$_.DefaultInboundAction; defaultOutboundAction = [string]$_.DefaultOutboundAction } })
  # Bulk queries avoid one CIM round trip per rule/filter pair. Filter InstanceID is the rule InstanceID.
  $applicationFilters = Get-ExposureFilters 'Get-NetFirewallApplicationFilter'
  $relevantRules = @(Get-NetFirewallRule -PolicyStore ActiveStore -Direction Inbound -Enabled True | Where-Object { $applicationFilters[$_.InstanceID].Program -eq 'Any' -or $applicationFilters[$_.InstanceID].Program -in $selectedProcesses.executablePath })
  $portFilters = Get-ExposureFilters 'Get-NetFirewallPortFilter' $relevantRules
  $addressFilters = Get-ExposureFilters 'Get-NetFirewallAddressFilter' $relevantRules
  $serviceFilters = Get-ExposureFilters 'Get-NetFirewallServiceFilter' $relevantRules
  $interfaceFilters = Get-ExposureFilters 'Get-NetFirewallInterfaceFilter' $relevantRules
  $interfaceTypeFilters = Get-ExposureFilters 'Get-NetFirewallInterfaceTypeFilter' $relevantRules
  foreach ($rule in $relevantRules) {
    $app = $applicationFilters[$rule.InstanceID]
    if ($null -eq $app) { throw 'Incomplete application filter snapshot' }
    if ($app.Program -ne 'Any' -and $app.Program -notin $selectedProcesses.executablePath) { continue }
    $port = $portFilters[$rule.InstanceID]
    $address = $addressFilters[$rule.InstanceID]
    $service = $serviceFilters[$rule.InstanceID]
    $interface = $interfaceFilters[$rule.InstanceID]
    $interfaceType = $interfaceTypeFilters[$rule.InstanceID]
    $filterCompleteness = if ($null -eq $port -or $null -eq $address -or $null -eq $service -or $null -eq $interface -or $null -eq $interfaceType) { 'partial' } else { 'complete' }
    $selectedRules += @{ name = $rule.Name; enabled = [string]$rule.Enabled; action = [string]$rule.Action; profiles = @(([string]$rule.Profile).Split(',') | ForEach-Object { $_.Trim() }); application = $app.Program; protocol = $(if ($null -eq $port) { 'Any' } else { [string]$port.Protocol }); localPort = $(if ($null -eq $port) { @('Any') } else { @($port.LocalPort) }); remotePort = @($port.RemotePort); localAddress = @($address.LocalAddress); remoteAddress = @($address.RemoteAddress); service = $service.Service; interfaceAlias = @($interface.InterfaceAlias); interfaceType = [string]$interfaceType.InterfaceType; filterCompleteness = $filterCompleteness }
  }
} catch { $inspectionErrors.Add('Firewall inspection denied or partial') }
@{ processes = @($selectedProcesses); endpoints = @($selectedEndpoints); rules = @($selectedRules); activeProfiles = @($activeProfiles); firewallProfiles = @($firewallProfiles); errors = @($inspectionErrors) } | ConvertTo-Json -Depth 8 -Compress
