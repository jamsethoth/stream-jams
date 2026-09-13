import { execFile } from "node:child_process";
import { promisify } from "node:util";

/** Launch can fail before Playwright exposes its child. Only a unique copied probe path is owned here. */
export async function cleanupFailedOverlayLaunch(executablePath: string): Promise<void> {
  const literalPath = executablePath.replaceAll("'", "''");
  const { stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `
    $probeProcesses = @(Get-Process | Where-Object { $_.Path -eq '${literalPath}' });
    foreach ($probeProcess in $probeProcesses) {
      $probeId = $probeProcess.Id;
      $probeStart = $probeProcess.StartTime;
      $probeCurrent = Get-Process -Id $probeId -ErrorAction SilentlyContinue;
      if ($null -ne $probeCurrent -and $probeCurrent.Path -eq '${literalPath}' -and $probeCurrent.StartTime -eq $probeStart) {
        Stop-Process -Id $probeId -Force -ErrorAction Stop;
        if (-not $probeCurrent.WaitForExit(10000)) { throw 'Owned overlay probe process did not exit.' }
        Write-Output "Confirmed owned overlay probe exit: $probeId";
      }
    }
    if (@(Get-Process | Where-Object { $_.Path -eq '${literalPath}' }).Count -ne 0) { throw 'Owned overlay probe process remains.' }
  `], { windowsHide: true, timeout: 20_000 });
  console.info(stdout || "No owned overlay probe process remains after failed launch.");
}
