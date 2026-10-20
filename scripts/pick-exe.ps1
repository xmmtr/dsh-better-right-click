param(
  [string]$Title = '选择用来打开该类型文件的程序'
)

# 让用户自己挑一个 .exe（Windows 的「打开方式」清单只收录注册过的程序，
# 便携版 / 绿色软件不会出现在里面，所以需要一个手动入口）。
# 输出：选中的绝对路径；取消则输出空行。永不抛异常。
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)

try {
  Add-Type -AssemblyName System.Windows.Forms
} catch {
  exit 3
}

$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.Title = $Title
$dialog.Filter = '程序 (*.exe)|*.exe|所有文件 (*.*)|*.*'
$dialog.CheckFileExists = $true
$dialog.CheckPathExists = $true
$dialog.Multiselect = $false
$dialog.DereferenceLinks = $true

# 宿主是 Electron 的无窗口进程，直接 ShowDialog() 可能落在别的窗口后面，
# 所以挂一个置顶的隐藏父窗口，保证对话框出现在前台。
$owner = New-Object System.Windows.Forms.Form
$owner.Text = $Title
$owner.ShowInTaskbar = $false
$owner.TopMost = $true
$owner.WindowState = [System.Windows.Forms.FormWindowState]::Minimized
$owner.Show()
$owner.Hide()

$result = $dialog.ShowDialog($owner)
if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
  [Console]::Out.WriteLine($dialog.FileName)
}
$owner.Close()
