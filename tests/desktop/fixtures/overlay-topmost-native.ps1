param([Parameter(Mandatory)][long]$Overlay, [Parameter(Mandatory)][long]$Competitor, [Parameter(Mandatory)][int]$OwnerPid, [ValidateSet('raise','background-raise','activate-owned','input','capture','gone')][string]$Action = 'raise', [switch]$Baseline, [string]$CapturePath)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class TopmostNative {
 [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left,Top,Right,Bottom; }
 [StructLayout(LayoutKind.Sequential)] public struct Point { public int X,Y; }
 [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr h,uint cmd);
 [DllImport("user32.dll",EntryPoint="GetWindowLongPtrW")] public static extern IntPtr GetWindowLongPtr(IntPtr h,int index);
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out Rect rect);
 [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h,IntPtr after,int x,int y,int w,int height,uint flags);
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);
 [DllImport("user32.dll")] public static extern bool GetCursorPos(out Point point);
 [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(Point point);
 [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr h,uint flags);
 [DllImport("user32.dll")] public static extern void mouse_event(uint flags,uint x,uint y,uint data,UIntPtr extra);
 [DllImport("user32.dll")] public static extern void keybd_event(byte key,byte scan,uint flags,UIntPtr extra);
 [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
 [DllImport("user32.dll",SetLastError=true)] public static extern IntPtr GetDC(IntPtr h);
 [DllImport("user32.dll")] public static extern int ReleaseDC(IntPtr h,IntPtr dc);
 [DllImport("gdi32.dll",SetLastError=true)] public static extern bool BitBlt(IntPtr target,int x,int y,int width,int height,IntPtr source,int sourceX,int sourceY,uint operation);
}
'@
[void][TopmostNative]::SetProcessDPIAware()
function Assert-Owned([long]$Handle) {
 $nativePid = [uint32]0
 if (-not [TopmostNative]::IsWindow([IntPtr]::new($Handle))) { throw 'Owned window unavailable' }
 [void][TopmostNative]::GetWindowThreadProcessId([IntPtr]::new($Handle),[ref]$nativePid)
 if ($nativePid -ne $OwnerPid) { throw "Window owner mismatch: HWND=$Handle expectedPid=$OwnerPid observedPid=$nativePid" }
}
Assert-Owned $Competitor
if ($Action -eq 'gone') { @{ exists = [TopmostNative]::IsWindow([IntPtr]::new($Overlay)) } | ConvertTo-Json -Compress; exit }
Assert-Owned $Overlay
$rect = New-Object TopmostNative+Rect
[void][TopmostNative]::GetWindowRect([IntPtr]::new($Competitor),[ref]$rect)
function Sample {
 Assert-Owned $Overlay
 Assert-Owned $Competitor
 $cursor = [TopmostNative]::GetWindow([IntPtr]::new($Overlay),2)
 $above = $false
 for ($i=0; $i -lt 10000 -and $cursor -ne [IntPtr]::Zero; $i++) {
  if ($cursor.ToInt64() -eq $Competitor) { $above = $true; break }
  $cursor = [TopmostNative]::GetWindow($cursor,2)
 }
 @{ elapsedMs = $watch.Elapsed.TotalMilliseconds; overlayAbove = $above; foreground = [TopmostNative]::GetForegroundWindow().ToInt64().ToString(); overlayVisible = [TopmostNative]::IsWindowVisible([IntPtr]::new($Overlay)); style = [TopmostNative]::GetWindowLongPtr([IntPtr]::new($Overlay),-20).ToInt64(); bounds = @{ x=$rect.Left;y=$rect.Top;width=$rect.Right-$rect.Left;height=$rect.Bottom-$rect.Top } }
}
$watch = [Diagnostics.Stopwatch]::StartNew()
if ($Action -eq 'activate-owned') {
 if ([TopmostNative]::GetForegroundWindow().ToInt64() -eq $Competitor) {
  @{ foreground=$Competitor.ToString(); activation='already-owned-foreground' } | ConvertTo-Json -Compress
  exit
 }
 if (-not [TopmostNative]::SetWindowPos([IntPtr]::new($Competitor),[IntPtr]::new(-1),0,0,0,0,0x13)) { throw 'Owned activation raise failed' }
 $original = New-Object TopmostNative+Point
 [void][TopmostNative]::GetCursorPos([ref]$original)
 try {
  $target = New-Object TopmostNative+Point
  $target.X = $rect.Left+200
  $target.Y = $rect.Top+150
  [void][TopmostNative]::SetCursorPos($target.X,$target.Y)
  Assert-Owned $Competitor
  $hit = [TopmostNative]::GetAncestor([TopmostNative]::WindowFromPoint($target),2)
  if ($hit.ToInt64() -ne $Competitor) { throw 'Owned activation target is occluded; no input sent' }
  Assert-Owned ($hit.ToInt64())
  [TopmostNative]::mouse_event(2,0,0,0,[UIntPtr]::Zero)
  [TopmostNative]::mouse_event(4,0,0,0,[UIntPtr]::Zero)
  $watch.Restart()
  do {
   $foreground = [TopmostNative]::GetForegroundWindow().ToInt64()
   if ($foreground -eq $Competitor) { break }
   Start-Sleep -Milliseconds 10
  } while ($watch.ElapsedMilliseconds -lt 1000)
  if ($foreground -ne $Competitor) { throw "Owned activation did not obtain foreground: expectedHandle=$Competitor observedHandle=$foreground" }
  @{ foreground=$foreground.ToString(); activation='verified-owned-native-click';elapsedMs=$watch.Elapsed.TotalMilliseconds } | ConvertTo-Json -Compress
 } finally { [void][TopmostNative]::SetCursorPos($original.X,$original.Y) }
} elseif ($Action -eq 'raise' -or $Action -eq 'background-raise') {
 $initialForeground = [TopmostNative]::GetForegroundWindow().ToInt64().ToString()
 if ($Action -eq 'raise' -and [TopmostNative]::GetForegroundWindow().ToInt64() -ne $Competitor) {
  $foreground = [TopmostNative]::GetForegroundWindow()
  $foregroundPid = [uint32]0
  [void][TopmostNative]::GetWindowThreadProcessId($foreground,[ref]$foregroundPid)
  throw "Owned competitor is not foreground: expectedHandle=$Competitor observedHandle=$foreground observedPid=$foregroundPid"
 }
 if (-not [TopmostNative]::SetWindowPos([IntPtr]::new($Competitor),[IntPtr]::new(-1),0,0,0,0,0x13)) { throw 'Owned competitor raise failed' }
 $watch.Restart()
 $samples = @()
 do { $sample=Sample; $samples += $sample; if (-not $Baseline -and $sample.overlayAbove) { break }; Start-Sleep -Milliseconds 10 } while ($watch.ElapsedMilliseconds -lt 1000)
 @{ samples=$samples; latencyMs=$sample.elapsedMs; initialForeground=$initialForeground } | ConvertTo-Json -Depth 5 -Compress
} elseif ($Action -eq 'input') {
 $original = New-Object TopmostNative+Point
 [void][TopmostNative]::GetCursorPos([ref]$original)
 try {
 if ([TopmostNative]::GetForegroundWindow().ToInt64() -ne $Competitor) { throw 'Input target lost foreground; no input sent' }
 [void][TopmostNative]::SetCursorPos($rect.Left+200,$rect.Top+150)
 Assert-Owned $Competitor
 if ([TopmostNative]::GetForegroundWindow().ToInt64() -ne $Competitor) { throw 'Input target changed; no input sent' }
 $target = New-Object TopmostNative+Point
 $target.X = $rect.Left+200
 $target.Y = $rect.Top+150
 $hit = [TopmostNative]::GetAncestor([TopmostNative]::WindowFromPoint($target),2)
 if ($hit.ToInt64() -ne $Competitor) { throw 'Owned competitor is not the native hit target; no input sent' }
 Assert-Owned ($hit.ToInt64())
 [TopmostNative]::mouse_event(2,0,0,0,[UIntPtr]::Zero)
 [TopmostNative]::mouse_event(4,0,0,0,[UIntPtr]::Zero)
 if ([TopmostNative]::GetForegroundWindow().ToInt64() -ne $Competitor) { throw 'Input target changed; no key sent' }
 [TopmostNative]::keybd_event(0x77,0,0,[UIntPtr]::Zero)
 [TopmostNative]::keybd_event(0x77,0,2,[UIntPtr]::Zero)
 Sample | ConvertTo-Json -Depth 5 -Compress
 } finally { [void][TopmostNative]::SetCursorPos($original.X,$original.Y) }
} elseif ($Action -eq 'capture') {
 Add-Type -AssemblyName System.Drawing
 $bitmap = New-Object Drawing.Bitmap ($rect.Right-$rect.Left),($rect.Bottom-$rect.Top)
 $graphics = [Drawing.Graphics]::FromImage($bitmap)
 $sourceDc = [IntPtr]::Zero
 $targetDc = [IntPtr]::Zero
 try {
  $sourceDc = [TopmostNative]::GetDC([IntPtr]::Zero)
  if ($sourceDc -eq [IntPtr]::Zero) { throw 'Desktop capture source DC unavailable' }
  $targetDc = $graphics.GetHdc()
  try {
   # Win32 SRCCOPY | CAPTUREBLT includes layered windows; Graphics.CopyFromScreen rejects the combined enum.
   if (-not [TopmostNative]::BitBlt($targetDc,0,0,$bitmap.Width,$bitmap.Height,$sourceDc,$rect.Left,$rect.Top,[uint32]0x40CC0020)) {
    throw "Desktop BitBlt capture failed: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())"
   }
  } finally {
   if ($targetDc -ne [IntPtr]::Zero) { $graphics.ReleaseHdc($targetDc); $targetDc = [IntPtr]::Zero }
  }
  $center=$bitmap.GetPixel(200,150)
  $bitmap.Save($CapturePath,[Drawing.Imaging.ImageFormat]::Png)
  @{ sample=(Sample); center=@{r=$center.R;g=$center.G;b=$center.B};capture='Windows GDI BitBlt SRCCOPY|CAPTUREBLT compositor crop' } | ConvertTo-Json -Depth 6 -Compress
 } finally {
  if ($targetDc -ne [IntPtr]::Zero) { $graphics.ReleaseHdc($targetDc) }
  if ($sourceDc -ne [IntPtr]::Zero) { [void][TopmostNative]::ReleaseDC([IntPtr]::Zero,$sourceDc) }
  $graphics.Dispose()
  $bitmap.Dispose()
 }
}
