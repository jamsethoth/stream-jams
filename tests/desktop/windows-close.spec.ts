import { execFile, spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { expect, test } from "@playwright/test";

test("native X exits the packaged application without an attached debugger", async () => {
  const root = await mkdtemp(join(tmpdir(), "stream-jams-native-close-"));
  const listener = createServer();
  await new Promise<void>((resolve) => listener.listen(0, "127.0.0.1", resolve));
  const address = listener.address();
  if (address === null || typeof address === "string") throw new Error("Expected a TCP port");
  await new Promise<void>((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
  const configPath = join(root, "config.json");
  await writeFile(configPath, JSON.stringify({ desktop: { closeToTray: false }, server: { host: "127.0.0.1", port: address.port }, storage: { dataDirectory: join(root, "data"), assetDirectory: join(root, "assets") } }));
  const env: NodeJS.ProcessEnv = { ...process.env, STREAM_JAMS_CONFIG_PATH: configPath, STREAM_JAMS_DESKTOP_USER_DATA_PATH: join(root, "electron") };
  delete env.ELECTRON_RUN_AS_NODE;
  // This is an interactive window test. Hiding the native startup window makes
  // .NET's MainWindowHandle intentionally unavailable, so the app is visible.
  const child = spawn(resolve("apps/desktop/out/Stream Jams-win32-x64/Stream Jams.exe"), [], { cwd: root, env, stdio: "ignore", windowsHide: false });
  let exited = false;
  let windowHandle: number | undefined;
  let cleanupFailure: unknown;
  child.once("exit", () => { exited = true; });
  try {
    await expect.poll(() => fetch(`http://127.0.0.1:${address.port}/health`, { signal: AbortSignal.timeout(1_000) }).then((response) => response.status, () => 0), { timeout: 20_000 }).toBe(200);
    if (child.pid === undefined) throw new Error("Packaged app did not start");
    // .NET sends WM_CLOSE to this exact owned process; no global window search
    // or synthetic click can affect a user's other app instance.
    const script = `$testApp = Get-Process -Id ${child.pid}; $deadline = [DateTime]::UtcNow.AddSeconds(10); do { $testApp.Refresh(); if ($testApp.MainWindowHandle -ne 0) { break }; Start-Sleep -Milliseconds 100 } while ([DateTime]::UtcNow -lt $deadline); if ($testApp.MainWindowHandle -eq 0) { throw 'Owned management window was not shown' }; $testWindow = $testApp.MainWindowHandle.ToInt64(); Start-Sleep -Milliseconds 1000; if (-not $testApp.CloseMainWindow()) { throw 'Owned window rejected WM_CLOSE' }; Write-Output $testWindow`;
    const closeResult = await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { windowsHide: true, timeout: 15_000 });
    windowHandle = Number(closeResult.stdout.trim());
    await expect.poll(() => exited, { timeout: 15_000 }).toBe(true);
    expect(child.exitCode).toBe(0);
    await expect.poll(() => fetch(`http://127.0.0.1:${address.port}/health`, { signal: AbortSignal.timeout(1_000) }).then(() => true, () => false)).toBe(false);
    console.info("Native X stopped the owned listener and exited with code 0.");
  } catch (error) {
    console.error("Native X acceptance failed:", error instanceof Error ? error.message : error);
    // Capture state before test cleanup can terminate anything. A vanished
    // window is not evidence that the app or its listener has actually stopped.
    const healthStatus = await fetch(`http://127.0.0.1:${address.port}/health`, { signal: AbortSignal.timeout(1_000) }).then((response) => response.status, () => 0);
    console.info("Native shutdown state:", { pid: child.pid, windowHandle, exitEvent: exited, exitCode: child.exitCode, signalCode: child.signalCode, healthStatus });
    if (child.pid !== undefined && Number.isSafeInteger(windowHandle) && windowHandle! > 0) {
      const probe = `Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class TestWindowProbe { [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hwnd); [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hwnd); }'; $testApp = Get-Process -Id ${child.pid} -ErrorAction SilentlyContinue; [pscustomobject]@{ windowExists = [TestWindowProbe]::IsWindow([IntPtr]${windowHandle}); windowVisible = [TestWindowProbe]::IsWindowVisible([IntPtr]${windowHandle}); processFound = $null -ne $testApp; hasExited = if ($null -ne $testApp) { $testApp.HasExited } else { $true } } | ConvertTo-Json -Compress`;
      const state = await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", probe], { windowsHide: true, timeout: 5_000 }).catch(() => null);
      console.info("Windows shutdown state:", state?.stdout.trim() ?? "probe unavailable");
    }
    throw error;
  } finally {
    if (!exited && child.pid !== undefined) await promisify(execFile)("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, timeout: 5_000 }).catch(() => undefined);
    // Chromium children can remain in Windows' terminating state briefly after
    // the main process and listener are gone. Keep cleanup bounded, but allow
    // their profile handles to be released before treating it as a leak.
    try { await rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }); }
    catch (error) { cleanupFailure = error; console.warn(`Native test cleanup failed: ${root}`); }
  }
  if (cleanupFailure !== undefined) throw cleanupFailure;
});
