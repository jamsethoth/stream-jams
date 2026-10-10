import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { runSquirrelEvent, squirrelAppUserModelId, squirrelEvent, squirrelUpdateCommand } from "./squirrel-events.js";

const installedExe = "C:\\Users\\streamer\\AppData\\Local\\StreamJams\\app-0.1.0\\Stream Jams.exe";
const updateExe = "C:\\Users\\streamer\\AppData\\Local\\StreamJams\\Update.exe";

describe("Squirrel installer events", () => {
  it("recognizes only Squirrel hooks in the first application argument", () => {
    expect(squirrelEvent([installedExe, "--squirrel-install", "0.1.0"])).toBe("install");
    expect(squirrelEvent([installedExe, "--squirrel-updated", "0.1.0"])).toBe("updated");
    expect(squirrelEvent([installedExe, "--squirrel-uninstall", "0.1.0"])).toBe("uninstall");
    expect(squirrelEvent([installedExe, "--squirrel-obsolete", "0.1.0"])).toBe("obsolete");
    expect(squirrelEvent([installedExe, "--squirrel-firstrun"])).toBeNull();
    expect(squirrelEvent([installedExe])).toBeNull();
    expect(squirrelEvent([installedExe, "--inspect", "--squirrel-install"])).toBeNull();
  });

  it("creates and removes shortcuts through the sibling Update.exe", () => {
    const shortcuts = ["--shortcut-locations", "Desktop,StartMenu"];
    expect(squirrelUpdateCommand("install", installedExe)).toEqual({ file: updateExe, args: ["--createShortcut", "Stream Jams.exe", ...shortcuts] });
    expect(squirrelUpdateCommand("updated", installedExe)).toEqual({ file: updateExe, args: ["--createShortcut", "Stream Jams.exe", ...shortcuts] });
    expect(squirrelUpdateCommand("uninstall", installedExe)).toEqual({ file: updateExe, args: ["--removeShortcut", "Stream Jams.exe", ...shortcuts] });
    expect(squirrelUpdateCommand("obsolete", installedExe)).toBeNull();
  });

  it("uses Squirrel's shortcut AppUserModelID only for installed copies", () => {
    expect(squirrelAppUserModelId(installedExe, (path) => path === updateExe)).toBe("com.squirrel.StreamJams.StreamJams");
    expect(squirrelAppUserModelId("D:\\portable\\Stream Jams-win32-x64\\Stream Jams.exe", () => false)).toBeNull();
  });

  it("waits for Update.exe to exit", async () => {
    const child = new EventEmitter();
    const spawn = vi.fn(() => child);
    const pending = runSquirrelEvent("install", installedExe, spawn, 60_000);
    let settled = false;
    void pending.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    child.emit("close");
    await pending;
    expect(spawn).toHaveBeenCalledWith(updateExe, ["--createShortcut", "Stream Jams.exe", "--shortcut-locations", "Desktop,StartMenu"], { detached: true, stdio: "ignore", windowsHide: true });
  });

  it("settles when Update.exe is missing, fails to spawn, or hangs", async () => {
    const missing = new EventEmitter();
    const pendingMissing = runSquirrelEvent("uninstall", installedExe, () => missing, 60_000);
    missing.emit("error", new Error("ENOENT"));
    await expect(pendingMissing).resolves.toBeUndefined();

    await expect(runSquirrelEvent("install", installedExe, () => { throw new Error("spawn failed"); }, 60_000)).resolves.toBeUndefined();

    vi.useFakeTimers();
    try {
      const hung = runSquirrelEvent("install", installedExe, () => new EventEmitter(), 10_000);
      await vi.advanceTimersByTimeAsync(10_000);
      await expect(hung).resolves.toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does nothing for an obsolete version", async () => {
    const spawn = vi.fn(() => new EventEmitter());
    await runSquirrelEvent("obsolete", installedExe, spawn);
    expect(spawn).not.toHaveBeenCalled();
  });
});
