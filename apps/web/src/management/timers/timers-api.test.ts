import { timersOverlayModuleDefinition, type TimerDefinition } from "@stream-jams/core";
import { describe, expect, it, vi } from "vitest";
import { createHttpTimersApi } from "./timers-api.js";

const definition: TimerDefinition = { id: "mitts", label: "Wear oven mitts", durationMs: 60_000, iconAssetId: null,
  startAudioAssetId: null, endAudioAssetId: null, outputs: { browserSource: true, deviceRouteIds: [] },
  createdAt: "2026-09-29T00:00:00.000Z", updatedAt: "2026-09-29T00:00:00.000Z" };

describe("createHttpTimersApi", () => {
  it("validates timer, layout, command, and one-time credential responses", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input); if (url === "/auth/management/sessions") return json({ id: "session", csrfToken: "csrf" });
      const headers = new Headers(init?.headers); expect(headers.get("authorization")).toBe("Bearer session");
      if (init?.method !== undefined) expect(headers.get("x-stream-jams-csrf")).toBe("csrf");
      if (url === "/timers" && init?.method === undefined) return json([definition]);
      if (url === "/timers/state") return json([]);
      if (url === "/timers/browser-sources") return json([
        {
          id: "module:timers:landscape:live", label: "Timers Landscape Live", purpose: "live", overlayId: "default",
          scope: "module", moduleId: "timers", targetProfileId: "landscape", enabled: true, keyId: "key-1",
          url: "http://127.0.0.1/overlay/modules/timers/live/secret?profile=landscape", copyableUrlStatus: "available",
          connectionState: "connected", lastConnectedAt: "2026-09-29T01:05:00.000Z"
        }
      ]);
      if (url === "/overlay-modules/timers/config") return json({ moduleId: "timers", enabled: true,
        config: timersOverlayModuleDefinition.defaultConfig, updatedAt: definition.updatedAt });
      if (url === "/timers/automation-credential" && init?.method === undefined) return json({ configured: false, createdAt: null, rotatedAt: null });
      if (url.endsWith("/rotate")) return json({ configured: true, createdAt: definition.createdAt, rotatedAt: null, token: `tmr_${"a".repeat(32)}` }, 201);
      if (init?.method === "DELETE") return new Response(null, { status: 204 });
      if (/\/(?:start|pause|resume|stop|restart)$/u.test(url)) return json({ changed: true, state: null });
      return json(definition, init?.method === "POST" ? 201 : 200);
    });
    const api = createHttpTimersApi({ fetch: fetcher });
    await expect(api.list()).resolves.toEqual([definition]); await expect(api.listStates()).resolves.toEqual([]);
    const input = { label: definition.label, durationMs: definition.durationMs, iconAssetId: null, startAudioAssetId: null, endAudioAssetId: null, outputs: definition.outputs };
    await expect(api.create(input)).resolves.toEqual(definition); await expect(api.update("mitts/id", input)).resolves.toEqual(definition);
    await expect(api.command("mitts", "restart")).resolves.toEqual({ changed: true, state: null });
    await expect(api.listBrowserSources()).resolves.toEqual([
      expect.objectContaining({ moduleId: "timers", targetProfileId: "landscape", status: "available" })
    ]);
    await expect(api.getModuleConfig()).resolves.toMatchObject({ moduleId: "timers", enabled: true });
    await expect(api.rotateAutomationCredential()).resolves.toMatchObject({ configured: true, token: expect.stringMatching(/^tmr_/) });
    await expect(api.revokeAutomationCredential()).resolves.toBeUndefined(); await expect(api.remove("mitts")).resolves.toBeUndefined();
    expect(fetcher.mock.calls.map(call => String(call[0]))).toContain("/timers/mitts%2Fid");
  });

  it("rejects malformed timer and credential payloads", async () => {
    const fetcher = vi.fn<typeof fetch>(async input => String(input) === "/auth/management/sessions" ? json({ id: "session", csrfToken: "csrf" }) : json([{ id: "bad" }]));
    await expect(createHttpTimersApi({ fetch: fetcher }).list()).rejects.toThrow();
  });
});
function json(value: unknown, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } }); }
