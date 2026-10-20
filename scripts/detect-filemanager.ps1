param(
    [switch]$Pretty
)

# 侦测「文件夹打开方式」是否被第三方文件管理器接管，并列出本机可用的替代品。
# 输出：单行 JSON
#   { owner: 'explorer'|'other'|'unknown', name, exe, command, candidates: [{name, exe, command}] }
# 说明：
#   - 只看注册表，不启动任何程序；
#   - command 是可直接用的命令模板，%1 = 目标绝对路径（由宿主做分词与替换，不经 shell）。
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)

function Get-DefaultCommand {
    param([string]$Path)
    try {
        $item = Get-Item -LiteralPath $Path -ErrorAction Stop
        $value = $item.GetValue('')
        if ($null -ne $value -and "$value".Trim() -ne '') { return "$value".Trim() }
    } catch {
        return ''
    }
    return ''
}

# 从命令行里取出可执行文件路径（支持带引号和不带引号两种写法）
function Split-ExePath {
    param([string]$CommandLine)
    $text = "$CommandLine".Trim()
    if ($text -eq '') { return '' }
    if ($text.StartsWith('"')) {
        $end = $text.IndexOf('"', 1)
        if ($end -gt 0) { return $text.Substring(1, $end - 1) }
        return ''
    }
    return ($text -split '\s+')[0]
}

$userCmd = Get-DefaultCommand 'HKCU:\Software\Classes\Folder\shell\open\command'
$machineCmd = Get-DefaultCommand 'HKLM:\SOFTWARE\Classes\Folder\shell\open\command'
$commandLine = if ($userCmd -ne '') { $userCmd } else { $machineCmd }
$exe = Split-ExePath $commandLine
$exeName = if ($exe -ne '') { [System.IO.Path]::GetFileName($exe) } else { '' }

$owner = 'unknown'
if ($exeName -ne '') {
    if ($exeName -ieq 'explorer.exe') { $owner = 'explorer' } else { $owner = 'other' }
}

# 常见第三方文件管理器：按 App Paths 或默认安装目录找可执行文件
$known = @(
    @{ Name = 'Directory Opus'; Files = @('dopusrt.exe', 'dopus.exe'); Template = '%EXE% /cmd Go NEWTAB="%1"' },
    @{ Name = 'XYplorer';       Files = @('XYplorer.exe');                Template = '%EXE% /select="%1"' },
    @{ Name = 'Total Commander'; Files = @('totalcmd64.exe', 'totalcmd.exe'); Template = '%EXE% /select="%1"' }
)

function Find-AppPath {
    param([string]$FileName)
    $roots = @(
        'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths',
        'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths',
        'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\App Paths'
    )
    foreach ($root in $roots) {
        $candidate = Join-Path $root $FileName
        try {
            $value = (Get-ItemProperty -LiteralPath $candidate -ErrorAction Stop).'(default)'
            if ($null -ne $value -and (Test-Path -LiteralPath "$value")) { return "$value" }
        } catch {
            continue
        }
    }
    return ''
}

$candidates = @()
foreach ($entry in $known) {
    foreach ($file in $entry.Files) {
        $found = Find-AppPath $file
        if ($found -eq '') { continue }
        $candidates += [pscustomobject]@{
            name    = $entry.Name
            exe     = $found
            command = $entry.Template.Replace('%EXE%', '"' + $found + '"')
        }
        break
    }
}

$name = ''
if ($owner -eq 'explorer') {
    $name = 'Explorer'
} elseif ($owner -eq 'other') {
    $name = $exeName
    foreach ($candidate in $candidates) {
        if ([System.IO.Path]::GetFileName($candidate.exe) -ieq $exeName -or
            ($exe -ne '' -and $candidate.exe -ieq $exe)) {
            $name = $candidate.name
            break
        }
    }
}

# 可直接使用的模板：%1 = 目标绝对路径
$template = ''
if ($owner -eq 'explorer' -and $exe -ne '') {
    $template = '"' + $exe + '" /select,"%1"'
} elseif ($owner -eq 'other' -and $commandLine -match '%[1Ll]') {
    # 注册表里的接管命令本身带占位符，直接复用
    $template = $commandLine -replace '%[Ll]', '%1'
}

$result = [pscustomobject]@{
    owner      = $owner
    name       = $name
    exe        = $exe
    command    = $template
    candidates = @($candidates)
}

if ($Pretty) {
    $result | ConvertTo-Json -Depth 4
} else {
    $result | ConvertTo-Json -Depth 4 -Compress
}
