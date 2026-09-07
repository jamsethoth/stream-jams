param([string]$ProcessIds)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class OwnedWaitProbe {
 [DllImport("advapi32.dll", SetLastError=true)] static extern IntPtr OpenThreadWaitChainSession(uint flags, IntPtr callback);
 [DllImport("advapi32.dll")] static extern void CloseThreadWaitChainSession(IntPtr session);
 [DllImport("advapi32.dll", SetLastError=true)] static extern bool GetThreadWaitChain(IntPtr session, IntPtr context, uint flags, uint tid, ref uint count, IntPtr nodes, out bool cycle);
 [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
 [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
 [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetExitCodeProcess(IntPtr handle, out uint code);
 [DllImport("ntdll.dll")] static extern int NtQueryInformationProcess(IntPtr handle, int cls, IntPtr data, int size, out int returned);
 public static object ExitState(uint pid) {
  var h=OpenProcess(0x1000,false,pid);
  if(h==IntPtr.Zero) return new { Error=Marshal.GetLastWin32Error() };
  uint code; GetExitCodeProcess(h,out code);
  var data=Marshal.AllocHGlobal(48);
  try { int n; var status=NtQueryInformationProcess(h,0,data,48,out n); return new { ExitCode=code, QueryStatus=status, NativeExitStatus=status==0?Marshal.ReadInt32(data):0 }; }
  finally { Marshal.FreeHGlobal(data); CloseHandle(h); }
 }
 public static object Chain(uint tid) {
  var session=OpenThreadWaitChainSession(0,IntPtr.Zero);
  if(session==IntPtr.Zero) return new { Error=Marshal.GetLastWin32Error() };
  var buffer=Marshal.AllocHGlobal(280*16);
  try {
   uint count=16; bool cycle;
   if(!GetThreadWaitChain(session,IntPtr.Zero,0,tid,ref count,buffer,out cycle)) return new { Error=Marshal.GetLastWin32Error() };
   var nodes=new List<object>();
   for(int i=0;i<Math.Min(count,16);i++) {
    var p=IntPtr.Add(buffer,280*i); int type=Marshal.ReadInt32(p), status=Marshal.ReadInt32(p,4);
    if(type==8) nodes.Add(new { Type=type, Status=status, PID=Marshal.ReadInt32(p,8), TID=Marshal.ReadInt32(p,12), WaitTime=Marshal.ReadInt32(p,16) });
    else nodes.Add(new { Type=type, Status=status, Name=Marshal.PtrToStringUni(IntPtr.Add(p,8),128).TrimEnd('\0') });
   }
   return new { Cycle=cycle, Nodes=nodes };
  } finally { Marshal.FreeHGlobal(buffer); CloseThreadWaitChainSession(session); }
 }
}
'@
$captures = foreach ($ownedId in ($ProcessIds -split ',' | ForEach-Object { [int]$_ })) {
 $owned = Get-Process -Id $ownedId -ErrorAction SilentlyContinue
 if ($null -eq $owned) { [pscustomobject]@{ PID=$ownedId; Gone=$true }; continue }
 $threads = @($owned.Threads | ForEach-Object {
  $thread = $_
  [pscustomobject]@{ Id=$thread.Id; State="$($thread.ThreadState)"; Wait=if($thread.ThreadState -eq 'Wait'){"$($thread.WaitReason)"}else{''}; Chain=[OwnedWaitProbe]::Chain($thread.Id) }
 })
 [pscustomobject]@{ PID=$ownedId; Name=$owned.ProcessName; Handles=$owned.HandleCount; Exit=[OwnedWaitProbe]::ExitState($ownedId); Threads=$threads }
}
$captures | ConvertTo-Json -Depth 12 -Compress
