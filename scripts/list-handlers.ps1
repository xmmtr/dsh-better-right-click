param(
  [Parameter(Mandatory = $true)][string]$Extension
)

# List the applications registered for a file extension.
# Sources, in the order Windows itself consults them:
#   1. effective default   HKCR\<ext> (default) -> ProgID -> shell\open\command
#   2. per-user open-with  HKCU\...\FileExts\<ext>\OpenWithProgids
#   3. machine open-with   HKCR\<ext>\OpenWithProgids
#   4. recent list         HKCU\...\FileExts\<ext>\OpenWithList (a/b/c..., MRUList order)
# Handlers whose exe is missing are still reported with available=false, so the UI can
# show "invalid" instead of silently doing nothing.
# Output: one compact JSON document on stdout. Never throws.
$ErrorActionPreference = 'SilentlyContinue'
# 宿主用 UTF-8 读 stdout；PowerShell 5.1 默认按控制台代码页输出，中文会变乱码。
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$ext = $Extension.Trim().ToLower()
$seen = @{}
$list = New-Object System.Collections.ArrayList

function Get-Command-Of {
  param([string]$ProgId)
  foreach ($root in @('Registry::HKEY_CLASSES_ROOT', 'HKCU:\SOFTWARE\Classes', 'HKLM:\SOFTWARE\Classes')) {
    $value = (Get-ItemProperty -Path "$root\$ProgId\shell\open\command" -ErrorAction SilentlyContinue).'(default)'
    if ($null -ne $value -and ([string]$value).Trim() -ne '') { return [string]$value }
  }
  return $null
}

function Split-Command {
  param([string]$Command)
  if ($null -eq $Command -or $Command.Trim() -eq '') { return $null }
  $c = $Command.Trim()
  if ($c.StartsWith('"')) {
    $end = $c.IndexOf('"', 1)
    if ($end -le 1) { return $null }
    return [pscustomobject]@{ exe = $c.Substring(1, $end - 1); args = $c.Substring($end + 1).Trim() }
  }
  # Unquoted command: the exe path itself may contain spaces, so take the longest
  # existing-file prefix instead of splitting at the first space.
  $tokens = @($c -split ' ')
  for ($i = $tokens.Count; $i -ge 1; $i--) {
    $candidate = ($tokens[0..($i - 1)] -join ' ')
    if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) { continue }
    $rest = ''
    if ($i -lt $tokens.Count) { $rest = ($tokens[$i..($tokens.Count - 1)] -join ' ') }
    return [pscustomobject]@{ exe = $candidate; args = $rest.Trim() }
  }
  return $null
}

function Add-Handler {
  param([string]$Command, [string]$Source, [string]$ProgId, [string]$FallbackName)
  $parts = $null
  if ($null -ne $Command -and $Command.Trim() -ne '') { $parts = Split-Command $Command }
  if ($null -eq $parts) { return }
  if ([string]::IsNullOrWhiteSpace($parts.exe)) { return }
  $key = ([System.IO.Path]::GetFileName($parts.exe)).ToLower()
  if ($seen.ContainsKey($key)) { return }
  $seen[$key] = $true

  $available = Test-Path -LiteralPath $parts.exe
  $label = ''
  if ($available) {
    $info = (Get-Item -LiteralPath $parts.exe).VersionInfo
    if ($null -ne $info) {
      if ($info.FileDescription) { $label = [string]$info.FileDescription }
      elseif ($info.ProductName) { $label = [string]$info.ProductName }
    }
  }
  if ($label.Trim() -eq '') { $label = [System.IO.Path]::GetFileNameWithoutExtension($parts.exe) }

  [void]$list.Add([pscustomobject]@{
      label     = $label.Trim()
      exe       = $parts.exe
      args      = $parts.args
      source    = $Source
      progId    = $ProgId
      available = $available
    })
}

# 1) effective default
$defaultProgId = (Get-ItemProperty -Path "Registry::HKEY_CLASSES_ROOT\$ext" -ErrorAction SilentlyContinue).'(default)'
if ($defaultProgId) {
  Add-Handler -Command (Get-Command-Of $defaultProgId) -Source 'default' -ProgId $defaultProgId
}

# 2) per-user OpenWithProgids
$userProgKey = "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\FileExts\$ext\OpenWithProgids"
if (Test-Path $userProgKey) {
  foreach ($p in (Get-ItemProperty -Path $userProgKey).PSObject.Properties) {
    if ($p.Name -like 'PS*') { continue }
    Add-Handler -Command (Get-Command-Of $p.Name) -Source 'user-progid' -ProgId $p.Name
  }
}

# 3) machine OpenWithProgids
$machineProgKey = "Registry::HKEY_CLASSES_ROOT\$ext\OpenWithProgids"
if (Test-Path $machineProgKey) {
  foreach ($p in (Get-ItemProperty -Path $machineProgKey).PSObject.Properties) {
    if ($p.Name -like 'PS*') { continue }
    Add-Handler -Command (Get-Command-Of $p.Name) -Source 'progid' -ProgId $p.Name
  }
}

# 4) recent OpenWithList, MRUList order first
$listKey = "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\FileExts\$ext\OpenWithList"
if (Test-Path $listKey) {
  $props = Get-ItemProperty -Path $listKey
  $mapping = @{}
  foreach ($p in $props.PSObject.Properties) {
    if ($p.Name -like 'PS*' -or $p.Name -eq 'MRUList') { continue }
    $mapping[$p.Name] = [string]$p.Value
  }
  $ordered = @()
  if ($props.MRUList) {
    foreach ($ch in ([string]$props.MRUList).ToCharArray()) {
      $k = [string]$ch
      if ($mapping.ContainsKey($k)) { $ordered += $mapping[$k] }
    }
  }
  foreach ($v in $mapping.Values) {
    if ($ordered -notcontains $v) { $ordered += $v }
  }
  foreach ($exeName in $ordered) {
    if ([string]::IsNullOrWhiteSpace($exeName)) { continue }
    $command = $null
    foreach ($root in @('Registry::HKEY_CLASSES_ROOT\Applications', 'HKCU:\SOFTWARE\Classes\Applications', 'HKLM:\SOFTWARE\Classes\Applications')) {
      $value = (Get-ItemProperty -Path "$root\$exeName\shell\open\command" -ErrorAction SilentlyContinue).'(default)'
      if ($null -ne $value -and ([string]$value).Trim() -ne '') { $command = [string]$value; break }
    }
    if ($null -eq $command) {
      foreach ($root in @('Registry::HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths', 'Registry::HKEY_CURRENT_USER\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths')) {
        $appPath = (Get-ItemProperty -Path "$root\$exeName" -ErrorAction SilentlyContinue).'(default)'
        if ($null -ne $appPath -and ([string]$appPath).Trim() -ne '') { $command = '"' + [string]$appPath + '" "%1"'; break }
      }
    }
    Add-Handler -Command $command -Source 'openwith' -ProgId $exeName -FallbackName $exeName
  }
}

[pscustomobject]@{
  ok       = $true
  ext      = $ext
  handlers = @($list)
} | ConvertTo-Json -Depth 5 -Compress
