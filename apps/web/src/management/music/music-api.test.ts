import { createDefaultMusicModuleConfig } from "@stream-jams/core";
import { describe, expect, it, vi } from "vitest";
import type { ManagementHttpClient } from "../management-http-client.js";
import { createMusicApi } from "./music-api.js";

const status = { enabled: false, selectedProviderId: null, status: { state: "disconnected", stale: false, diagnosticReference: null }, missingAssetIds: { landscape: [], vertical: [] } };

describe("Music API", () => {
  it("uses typed management endpoints and opaque pairing handles", async () => {
    const getJson = vi.fn(async (path: string) => path.includes("/pairing/")
      ? { attemptId: "pair_123", status: "approved", expiresAt: "2026-10-04T12:00:00.000Z" }
      : status);
    const postJson = vi.fn(async (path: string) => path === "/management/music/pairing"
      ? { attemptId: "pair_123", status: "pending", expiresAt: "2026-10-04T12:00:00.000Z" }
      : path.endsWith("/credential")
        ? { validation: { valid: true, connectionState: "connected", intakeState: null, validatedAt: "2026-10-04T12:00:00.000Z", availableVoices: [], error: null }, runtimeReconcilePending: false, credentialRetirementPending: false }
        : status);
    const deleteRequest = vi.fn(async () => undefined);
    const api = createMusicApi({ getJson, postJson, deleteRequest } as unknown as ManagementHttpClient);
    const config = { baseUrl: "http://127.0.0.1:26538", transport: "auto" as const };
    expect((await api.beginMusicPairing(config)).status).toBe("pending");
    expect((await api.getMusicPairing("pair_123")).status).toBe("approved");
    expect(await api.getMusicStatus()).toEqual(status);
    expect(await api.reconnectMusicSource("provider/1")).toEqual(status);
    expect((await api.replaceMusicCredential("provider/1", { pairingAttemptId: "pair_123", configuration: config })).validation.valid).toBe(true);
    await api.cancelMusicPairing("pair_123");
    expect(postJson).toHaveBeenCalledWith("/management/music/pairing", config, expect.any(String));
    expect(postJson).toHaveBeenCalledWith("/management/music/providers/provider%2F1/credential", { pairingAttemptId: "pair_123", configuration: config }, expect.any(String));
    expect(deleteRequest).toHaveBeenCalledWith("/management/music/pairing/pair_123", expect.any(String));
    expect(JSON.stringify(postJson.mock.calls)).not.toMatch(/accessToken|secretRef|Bearer/u);
  });

  it("rejects an invalid status response at the client boundary", async () => {
    const api = createMusicApi({ getJson: async () => ({ ...status, token: "private" }) } as unknown as ManagementHttpClient);
    await expect(api.getMusicStatus()).rejects.toThrow();
  });

  it("round-trips Music config through the generic module endpoint and validates output links", async () => {
    const config = createDefaultMusicModuleConfig();
    const getJson = vi.fn(async (path: string) => path.endsWith("/config") ? { enabled: false, config } : [
      { id: "music-live", label: "Music Landscape Live", overlayId: "default", scope: "module", moduleId: "music", purpose: "live", targetProfileId: "landscape", enabled: false, keyId: null, url: null, copyableUrlStatus: "create-required" },
      { id: "music-legacy", label: "Music Live", overlayId: "default", scope: "module", moduleId: "music", purpose: "live", targetProfileId: null, enabled: false, keyId: null, url: null, copyableUrlStatus: "create-required" },
      { id: "alerts-live", moduleId: "alerts" }
    ]);
    const putJson = vi.fn(async () => ({ enabled: true, config }));
    const api = createMusicApi({ getJson, putJson } as unknown as ManagementHttpClient);
    expect((await api.getMusicConfig()).config).toEqual(config);
    expect((await api.saveMusicConfig(true, config)).enabled).toBe(true);
    expect(putJson).toHaveBeenCalledWith("/overlay-modules/music/config", { enabled: true, config }, expect.any(String));
    expect((await api.listMusicOutputs()).map(output => output.id)).toEqual(["music-live"]);
  });

  it("rejects malformed Music output metadata", async () => {
    const api = createMusicApi({ getJson: async () => [{ moduleId: "music", url: "https://unexpected.example/" }] } as unknown as ManagementHttpClient);
    await expect(api.listMusicOutputs()).rejects.toThrow(/Music output response is invalid/u);
  });
});
