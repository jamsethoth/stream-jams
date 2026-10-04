import { describe, expect, it, vi } from "vitest";
import { createDefaultMusicModuleConfig, musicManagementStatusSchema } from "@stream-jams/core";
import { MusicManagementService, MusicSourceNotFoundError } from "./music-management-service.js";

describe("MusicManagementService", () => {
  it("keeps enablement, selected registration, live status and missing assets distinct", async () => {
    const config = createDefaultMusicModuleConfig();
    const service = new MusicManagementService({
      providers: { findActive: vi.fn(async () => ({ provider: { id: "provider-1" } }) as never), findById: vi.fn(async () => null) },
      runtime: { getStatus: () => ({ state: "auth-required", stale: false, diagnosticReference: "ref_123" }), reconcile: vi.fn(async () => undefined) },
      getConfig: async () => ({ enabled: false, config }),
      assets: { resolveMusicAssets: vi.fn(async (_config, profile) => ({ assets: [], missingAssetIds: profile === "landscape" ? ["brand-missing"] : ["font-missing"] })) }
    });
    expect(musicManagementStatusSchema.parse(await service.getStatus())).toEqual({
      enabled: false, selectedProviderId: "provider-1",
      status: { state: "auth-required", stale: false, diagnosticReference: "ref_123" },
      missingAssetIds: { landscape: ["brand-missing"], vertical: ["font-missing"] }
    });
  });

  it("only reconnects an active Music registration", async () => {
    const reconcile = vi.fn(async () => undefined);
    const service = new MusicManagementService({
      providers: { findActive: vi.fn(async () => null), findById: vi.fn(async id => id === "selected" ? { provider: { capability: "music-source", active: true } } as never : id === "inactive" ? { provider: { capability: "music-source", active: false } } as never : null) },
      runtime: { getStatus: () => ({ state: "disconnected", stale: false, diagnosticReference: null }), reconcile },
      getConfig: async () => ({ enabled: true, config: createDefaultMusicModuleConfig() }),
      assets: { resolveMusicAssets: vi.fn(async () => ({ assets: [], missingAssetIds: [] })) }
    });
    await service.reconnect("inactive");
    expect(reconcile).not.toHaveBeenCalled();
    await service.reconnect("selected");
    expect(reconcile).toHaveBeenCalledOnce();
    await expect(service.reconnect("foreign")).rejects.toBeInstanceOf(MusicSourceNotFoundError);
  });
});
