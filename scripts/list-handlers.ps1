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
#
# Perf note: 0.6.3 -- the previous version used Get-ItemProperty on three candidate
# roots per ProgID. A *missing* key under the merged HKCR view costs ~67 ms each, so a
# typical .pdf lookup took ~11 s and the host timed out. Registry::ClassesRoot already
# merges HKCU\Software\Classes + HKLM\Software\Classes, so the fallbacks were both
# redundant and slow; we now read through the .NET registry API, where misses are cheap.
$ErrorActionPreference = 'SilentlyContinue'
# 宿主用 UTF-8 读 stdout；PowerShell 5.1 默认按控制台代码页输出，中文会变乱码。
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)

$ext = $Extension.Trim().ToLower()
if (-not $ext.StartsWith('.')) { $ext = '.' + $ext }
$seen = @{}
$list = New-Object System.Collections.ArrayList

$HKCR = [Microsoft.Win32.Registry]::ClassesRoot
$HKCU = [Microsoft.Win32.Registry]::CurrentUser
$HKLM = [Microsoft.Win32.Registry]::LocalMachine

function Get-DefaultValue {
  param($Hive, [string]$SubKey)
  if ([string]::IsNullOrWhiteSpace($SubKey)) { return $null }
  try {
    $key = $Hive.OpenSubKey($SubKey)
    if ($null -eq $key) { return $null }
    try {
      $value = $key.GetValue('')
      if ($null -eq $value) { return $null }
      $text = [string]$value
      if ($text.Trim() -eq '') { return $null }
      return $text
    } finally { $key.Close() }
  } catch { return $null }
}

function Get-ValueNames {
  param($Hive, [string]$SubKey)
  try {
    $key = $Hive.OpenSubKey($SubKey)
    if ($null -eq $key) { return @() }
    try { return @($key.GetValueNames()) } finally { $key.Close() }
  } catch { return @() }
}

function Get-CommandOf {
  param([string]$ProgId)
  return Get-DefaultValue $HKCR "$ProgId\shell\open\command"
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
  param([string]$Command, [string]$Source, [string]$ProgId)
  if ([string]::IsNullOrWhiteSpace($Command)) { return }
  $parts = Split-Command $Command
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
$defaultProgId = Get-DefaultValue $HKCR $ext
if ($defaultProgId) { Add-Handler (Get-CommandOf $defaultProgId) 'default' $defaultProgId }

# 2) per-user OpenWithProgids
foreach ($progId in (Get-ValueNames $HKCU "SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\FileExts\$ext\OpenWithProgids")) {
  if ($progId.Trim() -eq '') { continue }
  Add-Handler (Get-CommandOf $progId) 'user-progid' $progId
}

# 3) machine OpenWithProgids
foreach ($progId in (Get-ValueNames $HKCR "$ext\OpenWithProgids")) {
  if ($progId.Trim() -eq '') { continue }
  Add-Handler (Get-CommandOf $progId) 'progid' $progId
}

# 4) recent OpenWithList, MRUList order first
$listSub = "SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\FileExts\$ext\OpenWithList"
$mapping = [ordered]@{}
$mru = $null
try {
  $key = $HKCU.OpenSubKey($listSub)
  if ($null -ne $key) {
    try {
      foreach ($name in $key.GetValueNames()) {
        if ($name -eq 'MRUList') { $mru = [string]$key.GetValue($name); continue }
        $mapping[$name] = [string]$key.GetValue($name)
      }
    } finally { $key.Close() }
  }
} catch { }

$ordered = @()
if ($mru) {
  foreach ($ch in $mru.ToCharArray()) {
    $k = [string]$ch
    if ($mapping.Contains($k)) { $ordered += $mapping[$k] }
  }
}
foreach ($v in $mapping.Values) { if ($ordered -notcontains $v) { $ordered += $v } }

foreach ($exeName in $ordered) {
  if ([string]::IsNullOrWhiteSpace($exeName)) { continue }
  $command = Get-DefaultValue $HKCR "Applications\$exeName\shell\open\command"
  if ([string]::IsNullOrWhiteSpace($command)) {
    $appPath = Get-DefaultValue $HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\$exeName"
    if ([string]::IsNullOrWhiteSpace($appPath)) {
      $appPath = Get-DefaultValue $HKCU "SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\$exeName"
    }
    if (-not [string]::IsNullOrWhiteSpace($appPath)) { $command = '"' + $appPath + '" "%1"' }
  }
  Add-Handler $command 'openwith' $exeName
}

[pscustomobject]@{
  ok       = $true
  ext      = $ext
  handlers = @($list)
} | ConvertTo-Json -Depth 5 -Compress
