import { afterEach, describe, expect, it, vi } from "vitest";
import { startPearProtocolFixture, type PearProtocolFixture } from "@stream-jams/test-support";
import { PearMusicSource, validatePearMusicConnection } from "./pear-music-source.js";

let fixture: PearProtocolFixture | null = null;
afterEach(async () => { vi.useRealTimers(); await fixture?.close(); fixture = null; });

async function source(transport: "ws" | "poll" | "auto", token = "throwaway-token") {
  fixture = await startPearProtocolFixture();
  return new PearMusicSource({ config: { baseUrl: fixture.baseUrl, transport }, token, providerId: "provider_1", generation: "generation_1" });
}

describe("Pear protocol boundary", () => {
  it("requires a PLAYER_INFO frame after WS opens", async () => {
    const adapter = await source("ws"); fixture!.setFirstFrame(null);
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ["setTimeout", "clearTimeout"] });
    const validation = adapter.testConnection(new AbortController().signal);
    let settled = false;
    void validation.then(() => { settled = true; }, () => { settled = true; });
    await vi.waitFor(() => expect(fixture!.sockets).toHaveLength(1));
    await vi.advanceTimersByTimeAsync(4_800);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(300);
    await expect(validation).rejects.toThrow();
    vi.useRealTimers();
    expect(fixture!.sockets).toHaveLength(1);
    expect(fixture!.requests).toHaveLength(0);
    await adapter.stop();
  });

  it("accepts an authenticated empty first frame", async () => {
    const adapter = await source("ws");
    await expect(adapter.testConnection(AbortSignal.timeout(5_000))).resolves.toMatchObject({ transport: "ws" });
    expect(fixture!.sockets[0]?.token).toBe("throwaway-token");
    expect(fixture!.requests).toHaveLength(0);
    await adapter.stop();
  });

  it("polls with bearer auth and treats 204 as an empty ready source", async () => {
    const adapter = await source("poll");
    await expect(adapter.testConnection(AbortSignal.timeout(5_000))).resolves.toMatchObject({ transport: "poll" });
    expect(fixture!.sockets).toHaveLength(0);
    expect(fixture!.requests).toEqual([{ path: "/api/v1/song", authorization: "Bearer throwaway-token" }]);
    await adapter.stop();
  });

  it("does not qualify ws-only through REST or fall back after WS auth failure", async () => {
    const adapter = await source("ws", "invalid-token");
    await expect(adapter.testConnection(AbortSignal.timeout(5_000))).rejects.toThrow();
    expect(fixture!.requests).toHaveLength(0);
    await adapter.stop();
  });

  it("rejects REST 401 without a socket or retry", async () => {
    const adapter = await source("poll", "invalid-token");
    await expect(adapter.testConnection(AbortSignal.timeout(5_000))).rejects.toThrow();
    expect(fixture!.requests).toHaveLength(1);
    expect(fixture!.sockets).toHaveLength(0);
    await adapter.stop();
  });

  it("maps an authenticated connection test to a credential-free provider validation result", async () => {
    const adapter = await source("poll");
    const result = await validatePearMusicConnection({ baseUrl: fixture!.baseUrl, transport: "poll" }, "throwaway-token", AbortSignal.timeout(5_000), () => new Date("2026-10-04T00:00:00.000Z"));
    expect(result).toEqual({ valid: true, connectionState: "connected", intakeState: null, validatedAt: "2026-10-04T00:00:00.000Z", availableVoices: [], error: null });
    expect(JSON.stringify(result)).not.toContain("throwaway-token");
    await adapter.stop();
  });

  it("falls back from WS 404 to bearer-authenticated REST in auto mode", async () => {
    const adapter = await source("auto"); fixture!.setWsStatus(404);
    await expect(adapter.testConnection(AbortSignal.timeout(5_000))).resolves.toMatchObject({ transport: "poll" });
    expect(fixture!.requests).toEqual([{ path: "/api/v1/song", authorization: "Bearer throwaway-token" }]);
    await adapter.stop();
  });

  it("treats REST 403 as revoked authorization", async () => {
    const adapter = await source("poll"); fixture!.setSong({ status: 403 });
    await expect(adapter.testConnection(AbortSignal.timeout(5_000))).rejects.toThrow(/authorization/);
    expect(fixture!.requests).toHaveLength(1);
    await adapter.stop();
  });

  it("does not fall back to REST after an auto-mode WS policy close", async () => {
    const adapter = await source("auto", "invalid-token");
    await expect(adapter.testConnection(AbortSignal.timeout(5_000))).rejects.toThrow(/authorization/);
    expect(fixture!.requests).toHaveLength(0);
    await adapter.stop();
  });

  it("does not follow or fall back after a credential-bearing WS redirect", async () => {
    const adapter = await source("auto"); fixture!.setWsStatus(302);
    await expect(adapter.testConnection(AbortSignal.timeout(5_000))).rejects.toThrow();
    expect(fixture!.requests).toHaveLength(0);
    await adapter.stop();
  });

  it("rejects an oversized first WS frame without REST fallback", async () => {
    const adapter = await source("auto");
    fixture!.setFirstFrame({ type: "PLAYER_INFO", padding: "x".repeat(256 * 1024) });
    await expect(adapter.testConnection(AbortSignal.timeout(5_000))).rejects.toThrow();
    expect(fixture!.requests).toHaveLength(0);
    await adapter.stop();
  });
});
