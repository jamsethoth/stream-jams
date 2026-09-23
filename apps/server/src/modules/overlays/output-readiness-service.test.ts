import type {
  AudioOutputStatus,
  DesktopOverlayStatus,
  OverlayOutputView,
  SurfaceConfiguration
} from "@stream-jams/core";
import { describe, expect, it, vi } from "vitest";
import type { OverlayGatewayClientState } from "../../websocket/overlay-gateway.js";
import { OutputReadinessService } from "./output-readiness-service.js";

describe("OutputReadinessService", () => {
  it("applies module and unified browser readiness rules for visual and audio content", async () => {
    const harness = createHarness();
    harness.clients.push(client({ scope: "module", moduleId: "screen-effects", targetProfileId: null }));

    await expect(harness.service.isBrowserOutputReady({
      moduleId: "screen-effects", hasVisual: true, hasAudio: false, targetProfileId: null
    })).resolves.toBe(true);

    harness.clients.splice(0, harness.clients.length, client({ scope: "unified", moduleId: null, targetProfileId: null }));
    harness.surfaces[0] = unifiedSurface(false);
    await expect(harness.service.isBrowserOutputReady({
      moduleId: "screen-effects", hasVisual: true, hasAudio: false, targetProfileId: null
    })).resolves.toBe(false);
    await expect(harness.service.isBrowserOutputReady({
      moduleId: "screen-effects", hasVisual: false, hasAudio: true, targetProfileId: null
    })).resolves.toBe(true);

    harness.surfaces[0] = unifiedSurface(true);
    await expect(harness.service.isBrowserOutputReady({
      moduleId: "screen-effects", hasVisual: true, hasAudio: false, targetProfileId: null
    })).resolves.toBe(true);
  });

  it("requires an enabled visible desktop surface on an available selected display", async () => {
    const withoutDesktopHost = createHarness(false);
    withoutDesktopHost.surfaces.push(desktopSurface());
    await expect(withoutDesktopHost.service.isDesktopVisualReady("screen-effects")).resolves.toBe(false);

    const harness = createHarness();
    harness.surfaces.push(desktopSurface());
    harness.desktopStatus.mockResolvedValue(desktopStatus("ready", ["display-1"]));

    await expect(harness.service.isDesktopVisualReady("screen-effects")).resolves.toBe(true);

    harness.desktopStatus.mockResolvedValue(desktopStatus("unavailable", []));
    await expect(harness.service.isDesktopVisualReady("screen-effects")).resolves.toBe(false);

    harness.desktopStatus.mockResolvedValue(desktopStatus("ready", ["other-display"]));
    await expect(harness.service.isDesktopVisualReady("screen-effects")).resolves.toBe(false);

    harness.desktopStatus.mockRejectedValue(new Error("desktop host stopped"));
    await expect(harness.service.isDesktopVisualReady("screen-effects")).resolves.toBe(false);
  });

  it("accepts one ready named audio route and fails closed when status cannot be read", async () => {
    const harness = createHarness();
    harness.audioStatus.mockResolvedValue(audioStatusFixture([
      ["route-missing", "missing-device"],
      ["route-ready", "ready"]
    ]));

    await expect(harness.service.hasReadyAudioRoute(["route-missing", "route-ready"])).resolves.toBe(true);
    await expect(harness.service.hasReadyAudioRoute(["route-missing"])).resolves.toBe(false);
    harness.audioStatus.mockRejectedValue(new Error("audio host stopped"));
    await expect(harness.service.hasReadyAudioRoute(["route-ready"])).resolves.toBe(false);
  });

  it("projects configured alert browser sources with current connection state and latest activity", async () => {
    const harness = createHarness();
    harness.outputs.push(
      output("alerts-landscape", "landscape", "available"),
      output("alerts-vertical", "vertical", "create-required"),
      { ...output("ignore-test", "landscape", "available"), purpose: "test" }
    );
    harness.clients.push(
      client({ targetProfileId: "landscape", connectedAt: "2026-09-23T12:00:00.000Z", connectionState: "connected" }),
      client({ targetProfileId: "landscape", connectedAt: "2026-09-23T12:05:00.000Z", connectionState: "disconnected" })
    );

    await expect(harness.service.listAlertBrowserSources("http://127.0.0.1:39187")).resolves.toEqual([
      expect.objectContaining({
        id: "alerts-landscape",
        connectionState: "connected",
        lastConnectedAt: "2026-09-23T12:05:00.000Z"
      }),
      expect.objectContaining({
        id: "alerts-vertical",
        connectionState: "never-connected",
        lastConnectedAt: null
      })
    ]);
    await expect(harness.service.hasConfiguredAlertBrowserOutput("http://127.0.0.1:39187")).resolves.toBe(true);
    expect(harness.listOutputs).toHaveBeenCalledWith("http://127.0.0.1:39187");
  });
});

function createHarness(includeDesktopHost = true) {
  const clients: OverlayGatewayClientState[] = [];
  const outputs: OverlayOutputView[] = [];
  const surfaces: SurfaceConfiguration[] = [];
  const desktopStatus = vi.fn(async (): Promise<DesktopOverlayStatus> => desktopStatusFixture());
  const audioStatus = vi.fn(async (): Promise<AudioOutputStatus> => audioStatusFixture([]));
  const listOutputs = vi.fn(async (origin: string) => {
    void origin;
    return outputs;
  });
  const service = new OutputReadinessService({
    getClientStates: () => clients,
    listOutputs,
    listSurfaces: async () => surfaces,
    ...(includeDesktopHost ? { desktopHost: { getStatus: desktopStatus } } : {}),
    getAudioStatus: audioStatus
  });
  return { service, clients, outputs, surfaces, desktopStatus, audioStatus, listOutputs };
}

function client(overrides: Partial<OverlayGatewayClientState> = {}): OverlayGatewayClientState {
  return {
    id: "client-1",
    overlayId: "default",
    moduleId: "alerts",
    purpose: "live",
    scope: "module",
    targetProfileId: "landscape",
    connectedAt: "2026-09-23T12:00:00.000Z",
    lastSeenAt: "2026-09-23T12:00:00.000Z",
    userAgent: null,
    connectionState: "connected",
    disconnectedAt: null,
    ...overrides
  };
}

function output(
  id: string,
  targetProfileId: "landscape" | "vertical",
  copyableUrlStatus: OverlayOutputView["copyableUrlStatus"]
): OverlayOutputView {
  return {
    id,
    label: id,
    enabled: true,
    overlayId: "default",
    moduleId: "alerts",
    purpose: "live",
    scope: "module",
    targetProfileId,
    keyId: copyableUrlStatus === "available" ? `key-${id}` : null,
    url: copyableUrlStatus === "available" ? `http://127.0.0.1/${id}` : null,
    copyableUrlStatus
  };
}

function unifiedSurface(visible: boolean): SurfaceConfiguration {
  return {
    id: "unified-browser:default",
    kind: "unified-browser",
    overlayId: "default",
    layers: [{ moduleId: "screen-effects", visible }]
  };
}

function desktopSurface(): SurfaceConfiguration {
  return {
    id: "desktop:primary",
    kind: "desktop",
    enabled: true,
    displayId: "display-1",
    opacity: 1,
    layers: [{ moduleId: "screen-effects", visible: true }]
  };
}

function desktopStatus(state: DesktopOverlayStatus["state"], displayIds: readonly string[]): DesktopOverlayStatus {
  return {
    available: state === "ready",
    state,
    message: null,
    displays: displayIds.map((id) => ({
      id,
      label: id,
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      scaleFactor: 1
    }))
  };
}

function desktopStatusFixture(): DesktopOverlayStatus {
  return desktopStatus("unavailable", []);
}

function audioStatusFixture(routes: readonly [string, AudioOutputStatus["routes"][number]["state"]][]): AudioOutputStatus {
  return {
    capability: { available: true, devices: [], reason: null, nextStep: null },
    muted: false,
    routes: routes.map(([id, state]) => ({
      route: { id, name: id, deviceId: `${id}-device`, deviceLabel: id },
      state
    }))
  };
}
