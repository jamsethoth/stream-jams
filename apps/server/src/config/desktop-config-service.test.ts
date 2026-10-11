import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { createDefaultAppConfig } from "./default-config.js";
import { DesktopConfigService } from "./desktop-config-service.js";
import { FileConfigStore } from "./file-config-store.js";

const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "stream-jams-desktop-config-"));
  roots.push(root);
  return new FileConfigStore({ configFilePath: join(root, "config.json"), defaultConfig: createDefaultAppConfig(root) });
}

it("does not publish a failed write and allows the next operation to succeed", async () => {
  const store = await fixture();
  await store.readConfig();
  const apply = vi.fn();
  const service = new DesktopConfigService(store, apply);
  vi.spyOn(store, "updateConfig").mockRejectedValueOnce(new Error("Disk full"));
  await expect(service.updateConfig({ closeToTray: false })).rejects.toThrow("Disk full");
  expect(apply).not.toHaveBeenCalled();
  expect((await store.readConfig()).desktop.closeToTray).toBe(true);
  await expect(service.updateConfig({ closeToTray: false })).resolves.toEqual({ available: true, closeToTray: false, gpuAcceleration: true });
  expect(apply).toHaveBeenCalledWith({ closeToTray: false, gpuAcceleration: true });
});

it("reports saved but unapplied preferences and refreshes after restore or rollback", async () => {
  const store = await fixture();
  const apply = vi.fn().mockRejectedValueOnce(new Error("Host unavailable")).mockResolvedValue(undefined);
  const service = new DesktopConfigService(store, apply);
  await expect(service.updateConfig({ closeToTray: false })).rejects.toMatchObject({ statusCode: 503, code: "DESKTOP_CONFIG_NOT_APPLIED" });
  expect((await store.readConfig()).desktop.closeToTray).toBe(false);
  await service.refresh();
  expect(apply).toHaveBeenLastCalledWith({ closeToTray: false, gpuAcceleration: true });
  await store.updateConfig({ desktop: { closeToTray: true } });
  await service.refresh();
  expect(apply).toHaveBeenLastCalledWith({ closeToTray: true, gpuAcceleration: true });
});

it("updates GPU acceleration independently of the close policy", async () => {
  const store = await fixture();
  const apply = vi.fn();
  const service = new DesktopConfigService(store, apply);
  await expect(service.updateConfig({ closeToTray: false })).resolves.toEqual({ available: true, closeToTray: false, gpuAcceleration: true });
  await expect(service.updateConfig({ gpuAcceleration: false })).resolves.toEqual({ available: true, closeToTray: false, gpuAcceleration: false });
  expect(apply).toHaveBeenLastCalledWith({ closeToTray: false, gpuAcceleration: false });
  await expect(service.updateConfig({ closeToTray: true, gpuAcceleration: true })).resolves.toEqual({ available: true, closeToTray: true, gpuAcceleration: true });
  expect((await store.readConfig()).desktop).toEqual({ closeToTray: true, gpuAcceleration: true });
});

it("rejects non-boolean and unknown desktop settings without writing or applying", async () => {
  const store = await fixture();
  const apply = vi.fn();
  const service = new DesktopConfigService(store, apply);
  for (const candidate of [{ gpuAcceleration: "false" }, { gpuAcceleration: 1 }, { closeToTray: null }, { hardwareAcceleration: false }]) {
    await expect(service.updateConfig(candidate)).rejects.toMatchObject({ statusCode: 400, code: "INVALID_DESKTOP_CONFIG", message: "Desktop settings must be booleans." });
  }
  expect(apply).not.toHaveBeenCalled();
  expect((await store.readConfig()).desktop).toEqual({ closeToTray: true, gpuAcceleration: true });
});
