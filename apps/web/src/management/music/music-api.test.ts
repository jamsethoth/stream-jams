import { sceneOutputCanvas } from "@stream-jams/core";
import { createDefaultMusicModuleConfig } from "@stream-jams/core";
import { describe, expect, it, vi } from "vitest";
import type { ManagementHttpClient } from "../management-http-client.js";
import { createMusicApi } from "./music-api.js";

const status = { enabled: false, selectedProviderId: null, status: { state: "disconnected", stale: false, diagnosticReference: null }, missingAssetIds: { landscape: [], vertical: [] } };

describe("Music API", () => {
  it("uses typed management endpoints and opaque pairing handles", async () => {
    const getJson = vi.fn(async (path: string) => path.includes("/pairing/")
      ? { attemptId: "pair_123", status: "approved", expiresAt: "2026-10-04T12:00:00.000Z", configuration: { baseUrl: "http://127.0.0.1:26538", transport: "auto" }, certificate: null }
      : status);
    const postJson = vi.fn(async (path: string) => path === "/management/music/pairing"
      ? { attemptId: "pair_123", status: "pending", expiresAt: "2026-10-04T12:00:00.000Z", configuration: { baseUrl: "http://127.0.0.1:26538", transport: "auto" }, certificate: null }
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

  it("parses live playback and loads artwork through the authorized management client", async () => {
    const snapshot = { providerId: "provider-1", generation: "music_1", revision: 2, track: { id: "song", title: "Live", artists: ["Artist"], album: null, artworkRef: "art_1" }, playbackState: "playing", positionMs: 1_000, durationMs: 9_000, observedAtEpochMs: 5_000, session: null };
    const connected = { state: "connected", stale: false, diagnosticReference: null };
    const request = vi.fn(async () => new Response("x"));
    const api = createMusicApi({ getJson: async () => ({ status: connected, snapshot }), request } as unknown as ManagementHttpClient);
    expect(await api.getMusicNowPlaying()).toEqual({ status: connected, snapshot });
    expect((await api.getMusicArtwork("art/1")).size).toBe(1);
    expect(request).toHaveBeenCalledWith("/management/music/artwork/art%2F1", expect.objectContaining({ fallbackMessage: expect.any(String) }));
    for (const invalid of [{ status: connected }, { status: connected, snapshot: { ...snapshot, url: "https://i.ytimg.com/x.jpg" } }, null]) {
      await expect(createMusicApi({ getJson: async () => invalid } as unknown as ManagementHttpClient).getMusicNowPlaying()).rejects.toThrow();
    }
  });

  it("rejects an invalid status response at the client boundary", async () => {
    const api = createMusicApi({ getJson: async () => ({ ...status, token: "private" }) } as unknown as ManagementHttpClient);
    await expect(api.getMusicStatus()).rejects.toThrow();
  });

  it("round-trips Music config through the generic module endpoint and validates output links", async () => {
    const config = createDefaultMusicModuleConfig();
    const getJson = vi.fn(async (path: string) => path.endsWith("/config") ? { enabled: false, config } : [
      { canvas: sceneOutputCanvas(0, 1920, 1080), id: "music-live", label: "Music Landscape Live", overlayId: "default", scope: "module", moduleId: "music", purpose: "live", targetProfileId: "landscape", enabled: false, keyId: null, url: null, copyableUrlStatus: "create-required" },
      { canvas: sceneOutputCanvas(0, 1920, 1080), id: "music-legacy", label: "Music Live", overlayId: "default", scope: "module", moduleId: "music", purpose: "live", targetProfileId: null, enabled: false, keyId: null, url: null, copyableUrlStatus: "create-required" },
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
