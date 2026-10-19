param(
  [Parameter(Mandatory = $true)][string]$Target,
  [int]$TimeoutMs = 4000
)

# Bring an already-open Explorer window whose focused item is $Target to the front.
# Why: when 'explorer.exe /select' is spawned by a non-foreground process, the window
# opens behind and the user sees "nothing happened". Activate it explicitly, with an
# AppActivate fallback for the foreground lock.
$ErrorActionPreference = 'Stop'

Add-Type -Namespace FileMenu -Name Win -MemberDefinition @'
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(System.IntPtr hWnd);
[DllImport("user32.dll")] public static extern bool ShowWindow(System.IntPtr hWnd, int nCmdShow);
[DllImport("user32.dll")] public static extern System.IntPtr GetForegroundWindow();
'@

function Find-Window {
  param([string]$Path)
  $shell = New-Object -ComObject Shell.Application
  foreach ($w in $shell.Windows()) {
    try {
      $item = $w.Document.FocusedItem
    } catch {
      continue
    }
    if ($null -ne $item -and $item.Path -eq $Path) {
      return $w
    }
  }
  return $null
}

$deadline = (Get-Date).AddMilliseconds($TimeoutMs)
$hit = $null
while ($null -eq $hit -and (Get-Date) -lt $deadline) {
  $hit = Find-Window -Path $Target
  if ($null -eq $hit) { Start-Sleep -Milliseconds 250 }
}

if ($null -eq $hit) {
  Write-Output 'NO-MATCH'
  exit 1
}

$hwnd = [IntPtr]$hit.HWND
[void][FileMenu.Win]::ShowWindow($hwnd, 9)
$foreground = [FileMenu.Win]::SetForegroundWindow($hwnd)
if (-not $foreground -or [FileMenu.Win]::GetForegroundWindow() -ne $hwnd) {
  try {
    $title = [string]$hit.LocationName
    if ($title -ne '') {
      $wsh = New-Object -ComObject WScript.Shell
      [void]$wsh.AppActivate($title)
    }
  } catch {
    # fallback only; a failure here does not affect the reveal itself
  }
}

if ([FileMenu.Win]::GetForegroundWindow() -eq $hwnd) {
  Write-Output ('FOCUSED ' + $hwnd)
  exit 0
}
Write-Output ('MATCHED-NOT-FOREGROUND ' + $hwnd)
exit 2
