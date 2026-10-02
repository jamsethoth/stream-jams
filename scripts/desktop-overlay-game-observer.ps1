param([ValidateRange(1000,300000)][int]$TimeoutMs = 30000)
$ErrorActionPreference = 'Stop'
Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class GameProbe {
 public delegate bool Callback(IntPtr hwnd, IntPtr extra);
 [DllImport("user32.dll")] public static extern bool EnumWindows(Callback callback, IntPtr extra);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
 [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hwnd);
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hwnd);
 [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int count);
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll", EntryPoint="GetWindowLongPtrW")] public static extern IntPtr GetWindowLongPtr(IntPtr hwnd, int index);
 [StructLayout(LayoutKind.Sequential)] public struct Rect { public int left, top, right, bottom; }
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd, out Rect rect);
}
"@
$clock = [Diagnostics.Stopwatch]::StartNew()
while ($clock.ElapsedMilliseconds -lt $TimeoutMs) {
 $script:games = [Collections.Generic.List[object]]::new()
 $script:overlays = [Collections.Generic.List[object]]::new()
 $script:rank = 0
 $callback = [GameProbe+Callback] {
  param($hwnd, $extra)
  $rank = $script:rank++
  [uint32]$owner = 0
  [void][GameProbe]::GetWindowThreadProcessId($hwnd, [ref]$owner)
  try { $process = Get-Process -Id $owner -ErrorAction Stop } catch { return $true }
  $game = $process.ProcessName -in @('Control_DX11', 'Control_DX12')
  $title = [Text.StringBuilder]::new(128)
  [void][GameProbe]::GetWindowText($hwnd, $title, 128)
  $overlay = $title.ToString() -ceq 'Stream Jams desktop overlay' -and $process.ProcessName -in @('electron', 'Stream Jams', 'stream-jams')
  if (!$game -and !$overlay) { return $true }
  [uint32]$confirmed = 0
  [void][GameProbe]::GetWindowThreadProcessId($hwnd, [ref]$confirmed)
  if (![GameProbe]::IsWindow($hwnd) -or $confirmed -ne $owner) { return $true }
  try { if ((Get-Process -Id $confirmed -ErrorAction Stop).StartTime -ne $process.StartTime) { return $true } } catch { return $true }
  $rect = [GameProbe+Rect]::new()
  if (![GameProbe]::GetWindowRect($hwnd, [ref]$rect)) { return $true }
  $row = @{ hwnd = $hwnd.ToInt64(); pid = [int]$owner; rank = $rank; live = $true; executable = $process.ProcessName; visible = [GameProbe]::IsWindowVisible($hwnd); exStyle = [GameProbe]::GetWindowLongPtr($hwnd, -20).ToInt64(); bounds = @($rect.left,$rect.top,$rect.right,$rect.bottom) }
  if ($game) { $script:games.Add($row) } else { $script:overlays.Add($row) }
  return $true
 }
 [void][GameProbe]::EnumWindows($callback, [IntPtr]::Zero)
 @{ kind = 'sample'; elapsedMs = $clock.Elapsed.TotalMilliseconds; foreground = [GameProbe]::GetForegroundWindow().ToInt64(); games = @($script:games.ToArray()); overlays = @($script:overlays.ToArray()) } | ConvertTo-Json -Depth 5 -Compress
 Start-Sleep -Milliseconds 100
}
