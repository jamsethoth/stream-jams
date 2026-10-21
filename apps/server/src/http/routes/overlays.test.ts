import { HistoricalOverlayKeyFixture } from "../test-support/historical-overlay-key-fixture.js";
import { sceneOutputCanvas } from "@stream-jams/core";
import type {
  ModuleOutputRequest,
  OverlayComposition,
  OverlayCompositionService,
  OverlayModuleDefinition,
  OverlayModuleRegistry,
  UnifiedOutputRequest
} from "@stream-jams/core";
import { describe, expect, it } from "vitest";
import { createOverlayRouteTestApp as createServerApp } from "./test-support/route-test-app.js";
import { OverlayGateway } from "../../websocket/overlay-gateway.js";
import { RetiredOutputAttemptTracker } from "../../modules/overlays/retired-output-attempts.js";

describe("overlay routes", () => {
  it("requires exact ordinary Music profile keys and denies historical retired routes", async () => {
    const access = createAccessService(["ovl_musicLive", "ovl_musicTest", "ovl_unified"]);
    const live = await access.createKey({ overlayId: "default", moduleId: "music", purpose: "live", scope: "module", targetProfileId: "vertical" });
    const test = await access.seedHistoricalKey({ overlayId: "default", moduleId: "music", purpose: "test", scope: "module", targetProfileId: "landscape" });
    const unified = await access.seedHistoricalKey({ overlayId: "default", moduleId: null, purpose: "live", scope: "unified" });
    const compositions = new RecordingOverlayCompositionService();
    const app = createServerApp({ metadata: { appName: "stream-jams", version: "1.2.3" }, overlayAccessService: access,
      overlayCompositionService: compositions, overlayModuleRegistry: createRegistry(["music"]), webShellRenderer: createTestWebShellRenderer() });
    try {
      expect((await app.inject({ url: `/overlay/modules/music/live/${live.rawKey}/composition?profile=vertical` })).statusCode).toBe(200);
      expect((await app.inject({ url: `/overlay/modules/music/test/${test.rawKey}/composition?profile=landscape` })).statusCode).toBe(401);
      expect((await app.inject({ url: `/overlay/unified/live/${unified.rawKey}/composition` })).statusCode).toBe(401);
      for (const url of [`/overlay/modules/music/test/${live.rawKey}/composition?profile=vertical`,
        `/overlay/modules/music/live/${test.rawKey}/composition?profile=landscape`,
        `/overlay/modules/music/live/${live.rawKey}/composition?profile=landscape`,
        `/overlay/unified/test/${unified.rawKey}/composition`]) {
        expect((await app.inject({ url })).statusCode).toBe(401);
      }
      // Public URL input cannot select a trusted desktop recipient or inject a saved capture.
      for (const selector of ["recipientKind=desktop", "savedConfig=forged"]) {
        expect((await app.inject({ url: `/overlay/modules/music/live/${live.rawKey}/composition?profile=vertical&${selector}` })).statusCode).toBe(401);
      }
      await access.revokeKey(live.record.id);
      expect((await app.inject({ url: `/overlay/modules/music/live/${live.rawKey}/composition?profile=vertical` })).statusCode).toBe(401);
      expect(compositions.moduleRequests.map(request => [request.purpose, request.targetProfileId])).toEqual([["live", "vertical"]]);
    } finally { await app.close(); }
  });
  it("authorizes Videos browser sources through the existing module route keys only", async () => {
    const access = createAccessService(["ovl_videosLive", "ovl_alertsLive", "ovl_unified"]);
    const live = await access.createKey({ overlayId: "default", moduleId: "videos", purpose: "live", scope: "module" });
    await expect(access.createKey({ overlayId: "default", moduleId: "videos", purpose: "test", scope: "module" })).rejects.toThrow(/retired/u);
    const alerts = await access.seedHistoricalKey({ overlayId: "default", moduleId: "alerts", purpose: "live", scope: "module" });
    const unified = await access.seedHistoricalKey({ overlayId: "default", moduleId: null, purpose: "live", scope: "unified" });
    const compositions = new RecordingOverlayCompositionService();
    const app = createServerApp({ metadata: { appName: "stream-jams", version: "1.2.3" }, overlayAccessService: access,
      overlayCompositionService: compositions, overlayModuleRegistry: createRegistry(["alerts", "videos"]), webShellRenderer: createTestWebShellRenderer() });
    try {
      const shell = await app.inject({ url: `/overlay/modules/videos/live/${live.rawKey}` });
      expect(shell.statusCode).toBe(200);
      expect(shell.body).not.toContain(live.rawKey);
      expect((await app.inject({ url: `/overlay/modules/videos/live/${live.rawKey}/composition` })).statusCode).toBe(200);
      for (const url of [
        "/overlay/modules/videos/live",
        `/overlay/modules/videos/test/${live.rawKey}/composition`,
        `/overlay/modules/videos/live/${alerts.rawKey}/composition`,
        `/overlay/modules/videos/live/${unified.rawKey}/composition`
      ]) {
        expect((await app.inject({ url })).statusCode).toBe(401);
      }
      // Overlay keys never authorize management APIs.
      expect((await app.inject({ url: "/management/overlay-outputs", headers: { authorization: `Bearer ${live.rawKey}` } })).statusCode).not.toBe(200);
      await access.revokeKey(live.record.id);
      expect((await app.inject({ url: `/overlay/modules/videos/live/${live.rawKey}/composition` })).statusCode).toBe(401);

      expect((await app.inject({ url: `/overlay/unified/live/${unified.rawKey}/composition` })).statusCode).toBe(401);
      expect(compositions.unifiedRequests).toEqual([]);
    } finally { await app.close(); }
  });
  it("serves a module overlay shell and composition through a module route key", async () => {
    const overlayAccessService = createAccessService(["ovl_moduleLive"]);
    const created = await overlayAccessService.seedHistoricalKey({
      overlayId: "default",
      moduleId: "alerts",
      purpose: "live",
      scope: "module"
    });
    const compositionService = new RecordingOverlayCompositionService();
    const app = createServerApp({
      metadata: {
        appName: "stream-jams",
        version: "1.2.3"
      },
      overlayAccessService,
      overlayCompositionService: compositionService,
      overlayModuleRegistry: createRegistry(["alerts"]),
      webShellRenderer: createTestWebShellRenderer()
    });

    const shell = await app.inject({
      method: "GET",
      url: `/overlay/modules/alerts/live/${created.rawKey}`
    });
    const composition = await app.inject({
      method: "GET",
      url: `/overlay/modules/alerts/live/${created.rawKey}/composition`
    });

    expect(shell.statusCode).toBe(200);
    expect(shell.headers["content-type"]).toContain("text/html");
    expect(shell.body).toContain('<div id="root"></div>');
    expect(shell.body).toContain("/assets/index-test.js");
    expect(shell.body).not.toContain("/src/main.tsx");
    expect(shell.body).not.toContain(created.rawKey);
    expect(composition.statusCode).toBe(200);
    expect(composition.json()).toEqual({ runtimeId: "fixture-runtime", canvas: sceneOutputCanvas(),
      overlayId: "default",
      purpose: "live",
      scope: "module",
      modules: [
        {
          moduleId: "alerts",
          enabled: true,
          instructions: []
        }
      ]
    });
    expect(compositionService.moduleRequests).toEqual([
      {
        moduleId: "alerts",
        overlayId: "default",
        purpose: "live"
      }
    ]);
  });

  it("authorizes and composes module output for the requested target profile", async () => {
    const overlayAccessService = createAccessService(["ovl_vertical"]);
    const created = await overlayAccessService.createKey({
      overlayId: "default",
      moduleId: "alerts",
      purpose: "live",
      scope: "module",
      targetProfileId: "vertical"
    });
    const compositionService = new RecordingOverlayCompositionService();
    const app = createServerApp({
      metadata: { appName: "stream-jams", version: "1.2.3" },
      overlayAccessService,
      overlayCompositionService: compositionService,
      overlayModuleRegistry: createRegistry(["alerts"]),
      webShellRenderer: createTestWebShellRenderer()
    });

    const vertical = await app.inject({
      method: "GET",
      url: `/overlay/modules/alerts/live/${created.rawKey}/composition?profile=vertical`
    });
    const landscape = await app.inject({
      method: "GET",
      url: `/overlay/modules/alerts/live/${created.rawKey}/composition?profile=landscape`
    });

    expect(vertical.statusCode).toBe(200);
    expect(compositionService.moduleRequests).toEqual([
      {
        moduleId: "alerts",
        overlayId: "default",
        purpose: "live",
        targetProfileId: "vertical"
      }
    ]);
    expect(landscape.statusCode).toBe(401);
  });

  it("rejects historical unified composition and keeps navigation blank and transparent", async () => {
    const overlayAccessService = createAccessService(["ovl_unifiedTest"]);
    const created = await overlayAccessService.seedHistoricalKey({
      overlayId: "default",
      moduleId: null,
      purpose: "test",
      scope: "unified"
    });
    const compositionService = new RecordingOverlayCompositionService();
    const app = createServerApp({
      metadata: {
        appName: "stream-jams",
        version: "1.2.3"
      },
      overlayAccessService,
      overlayCompositionService: compositionService,
      overlayModuleRegistry: createRegistry(["alerts", "music"]),
      webShellRenderer: createTestWebShellRenderer()
    });

    const response = await app.inject({
      method: "GET",
      url: `/overlay/unified/test/${created.rawKey}/composition`
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: { code: "OVERLAY_ROUTE_KEY_UNAUTHORIZED" } });
    expect(compositionService.unifiedRequests).toEqual([]);
    for (const url of ["/overlay/unified/live", `/overlay/unified/test/${created.rawKey}`]) {
      const shell = await app.inject({ url });
      expect(shell.statusCode).toBe(401);
      expect(shell.headers["content-type"]).toContain("text/html");
      expect(shell.body).toContain("background:transparent");
      expect(shell.body).not.toMatch(/script|root|management|ovl_/u);
    }
  });

  it("counts retired test/unified URL use by kind only while responses stay transparent and fail closed", async () => {
    const access = createAccessService(["ovl_liveKey", "ovl_retiredTest", "ovl_retiredUnified"]);
    const live = await access.createKey({ overlayId: "default", moduleId: "music", purpose: "live", scope: "module", targetProfileId: "vertical" });
    const test = await access.seedHistoricalKey({ overlayId: "default", moduleId: "music", purpose: "test", scope: "module", targetProfileId: "landscape" });
    const unified = await access.seedHistoricalKey({ overlayId: "default", moduleId: null, purpose: "live", scope: "unified" });
    const tracker = new RetiredOutputAttemptTracker(() => new Date("2026-10-11T12:00:00.000Z"));
    const overlayGateway = new OverlayGateway({ overlayAccessService: access, generateClientId: () => "client-retired", clock: () => new Date("2026-10-11T12:00:00.000Z") });
    const app = createServerApp({ metadata: { appName: "stream-jams", version: "1.2.3" }, overlayAccessService: access, overlayGateway,
      overlayCompositionService: new RecordingOverlayCompositionService(), overlayModuleRegistry: createRegistry(["music"]), webShellRenderer: createTestWebShellRenderer(),
      recordRetiredOutputAttempt: kind => tracker.record(kind) });
    try {
      expect((await app.inject({ url: `/overlay/modules/music/live/${live.rawKey}/composition?profile=vertical` })).statusCode).toBe(200);
      expect((await app.inject({ url: "/overlay/modules/music/live" })).statusCode).toBe(401);
      expect(tracker.list()).toEqual([]);
      const shell = await app.inject({ url: `/overlay/modules/music/test/${test.rawKey}?profile=landscape` });
      expect(shell.statusCode).toBe(401);
      expect(shell.body).toContain("background:transparent");
      expect((await app.inject({ url: `/overlay/modules/music/test/${test.rawKey}/composition?profile=landscape` })).statusCode).toBe(401);
      expect((await app.inject({ url: "/overlay/modules/music/test" })).statusCode).toBe(401);
      for (const url of [`/overlay/unified/live/${unified.rawKey}`, "/overlay/unified/test", `/overlay/unified/live/${unified.rawKey}/composition`]) {
        expect((await app.inject({ url })).statusCode).toBe(401);
      }
      await app.ready();
      const closed = new Promise<number>(resolve => {
        void app.injectWS(`/overlay/ws/unified/live/${unified.rawKey}`, {}, { onInit(webSocket) { webSocket.once("close", code => resolve(code)); } });
      });
      expect(await closed).not.toBe(1000);
      expect(overlayGateway.clients).toEqual([]);
      expect(tracker.list()).toEqual([
        { kind: "module-test", lastSeenAt: "2026-10-11T12:00:00.000Z", count: 3 },
        { kind: "unified", lastSeenAt: "2026-10-11T12:00:00.000Z", count: 4 }
      ]);
      expect(JSON.stringify(tracker.list())).not.toMatch(/ovl_|music|overlay\//u);
    } finally { await app.close(); }
  });

  it("registers authenticated WebSocket overlay clients", async () => {
    const overlayAccessService = createAccessService(["ovl_moduleLive"]);
    const created = await overlayAccessService.seedHistoricalKey({
      overlayId: "default",
      moduleId: "alerts",
      purpose: "live",
      scope: "module"
    });
    const overlayGateway = new OverlayGateway({
      overlayAccessService,
      generateClientId: () => "client-1",
      clock: () => new Date("2026-06-16T12:00:00.000Z")
    });
    const app = createServerApp({
      metadata: {
        appName: "stream-jams",
        version: "1.2.3"
      },
      overlayAccessService,
      overlayCompositionService: new RecordingOverlayCompositionService(),
      overlayModuleRegistry: createRegistry(["alerts"]),
      webShellRenderer: createTestWebShellRenderer(),
      overlayGateway
    });
    await app.ready();

    let resolveConnected: (value: unknown) => void = () => undefined;
    const connectedMessage = new Promise((resolve) => {
      resolveConnected = resolve;
    });
    const socket = await app.injectWS(
      `/overlay/ws/modules/alerts/live/${created.rawKey}`,
      {},
      {
        onInit(webSocket) {
          webSocket.once("message", (data) => resolveConnected(JSON.parse(data.toString()) as unknown));
        }
      }
    );
    const connected = await connectedMessage;

    expect(connected).toEqual({
      type: "overlay.connected",
      clientId: "client-1",
      overlayId: "default",
      moduleId: "alerts",
      purpose: "live",
      scope: "module"
    });
    expect(overlayGateway.clients).toEqual([
      {
        id: "client-1",
        overlayId: "default",
        moduleId: "alerts",
        purpose: "live",
        scope: "module",
        connectedAt: "2026-06-16T12:00:00.000Z",
        lastSeenAt: "2026-06-16T12:00:00.000Z",
        userAgent: null
      }
    ]);

    socket.close();
    await app.close();
  });

  it("rejects missing, wrong-purpose, and wrong-scope route keys", async () => {
    const overlayAccessService = createAccessService(["ovl_moduleLive", "ovl_unifiedLive"]);
    const moduleKey = await overlayAccessService.seedHistoricalKey({
      overlayId: "default",
      moduleId: "alerts",
      purpose: "live",
      scope: "module"
    });
    const unifiedKey = await overlayAccessService.seedHistoricalKey({
      overlayId: "default",
      moduleId: null,
      purpose: "live",
      scope: "unified"
    });
    const app = createServerApp({
      metadata: {
        appName: "stream-jams",
        version: "1.2.3"
      },
      overlayAccessService,
      overlayCompositionService: new RecordingOverlayCompositionService(),
      overlayModuleRegistry: createRegistry(["alerts"]),
      webShellRenderer: createTestWebShellRenderer()
    });

    const missing = await app.inject({
      method: "GET",
      url: "/overlay/modules/alerts/live"
    });
    const wrongPurpose = await app.inject({
      method: "GET",
      url: `/overlay/modules/alerts/test/${moduleKey.rawKey}/composition`
    });
    const wrongScope = await app.inject({
      method: "GET",
      url: `/overlay/modules/alerts/live/${unifiedKey.rawKey}/composition`
    });

    expect(missing.statusCode).toBe(401);
    expect(missing.headers["content-type"]).toContain("text/html");
    expect(missing.body).toContain("background:transparent");
    expect(missing.body).not.toContain("script");
    expect(wrongPurpose.statusCode).toBe(401);
    expect(wrongPurpose.json()).toMatchObject({
      error: {
        code: "OVERLAY_ROUTE_KEY_UNAUTHORIZED"
      }
    });
    expect(wrongScope.statusCode).toBe(401);
    expect(wrongScope.json()).toMatchObject({
      error: {
        code: "OVERLAY_ROUTE_KEY_UNAUTHORIZED"
      }
    });
  });

  it("serves the key-free offline worker and fallback beside the keyed overlay shell", async () => {
    const app = createServerApp({ metadata: { appName: "stream-jams", version: "1.2.3" }, overlayAccessService: createAccessService([]),
      overlayCompositionService: new RecordingOverlayCompositionService(), overlayModuleRegistry: createRegistry(["alerts"]), webShellRenderer: createTestWebShellRenderer() });
    try {
      const worker = await app.inject({ url: "/overlay/offline-worker.js" });
      expect([worker.statusCode, worker.headers["content-type"]]).toEqual([200, "text/javascript; charset=utf-8"]);
      const fallback = await app.inject({ url: "/overlay/offline-fallback" });
      expect([fallback.statusCode, fallback.headers["cache-control"]]).toEqual([200, "no-store"]);
      // The keyed shell still fails closed; the fallback is only ever served by the browser's worker.
      expect((await app.inject({ url: "/overlay/modules/alerts/live/ovl_unknown?profile=landscape" })).statusCode).toBe(401);
    } finally { await app.close(); }
  });
});

function createAccessService(rawKeys: readonly string[]): HistoricalOverlayKeyFixture {
  let rawKeyIndex = 0;
  let id = 0;
  return new HistoricalOverlayKeyFixture({
    clock: () => new Date("2026-05-30T12:00:00.000Z"),
    generateId: () => {
      id += 1;
      return `key-${id}`;
    },
    generateRawKey: () => {
      const rawKey = rawKeys[rawKeyIndex];
      rawKeyIndex += 1;
      if (rawKey === undefined) {
        throw new Error("Missing raw key fixture");
      }

      return rawKey;
    }
  });
}

function createRegistry(moduleIds: readonly string[]): Pick<OverlayModuleRegistry, "listModules"> {
  return {
    listModules() {
      return moduleIds.map(
        (id) =>
          ({
            id,
            renderer: { entryPoint: `overlay/modules/${id}`, supportsDesktopComposition: true, supportedOutputs: ["module", "unified"] }
          }) as unknown as OverlayModuleDefinition
      );
    }
  };
}

function createTestWebShellRenderer() {
  return {
    async renderManagementShell() {
      return "<!doctype html><html><body><div id=\"root\"></div><script type=\"module\" src=\"/assets/index-test.js\"></script></body></html>";
    },
    async renderOverlayShell() {
      return "<!doctype html><html><body><div id=\"root\"></div><script type=\"module\" src=\"/assets/index-test.js\"></script></body></html>";
    }
  };
}

class RecordingOverlayCompositionService implements OverlayCompositionService {
  readonly moduleRequests: ModuleOutputRequest[] = [];
  readonly unifiedRequests: UnifiedOutputRequest[] = [];

  async resolveModuleOutput(request: ModuleOutputRequest): Promise<OverlayComposition> {
    this.moduleRequests.push(request);
    return { runtimeId: "fixture-runtime", canvas: sceneOutputCanvas(),
      overlayId: request.overlayId,
      purpose: request.purpose,
      scope: "module",
      ...(request.targetProfileId === undefined ? {} : { targetProfileId: request.targetProfileId }),
      modules: [
        {
          moduleId: request.moduleId,
          enabled: true,
          instructions: []
        }
      ]
    };
  }

  async resolveUnifiedOutput(request: UnifiedOutputRequest): Promise<OverlayComposition> {
    this.unifiedRequests.push(request);
    return { runtimeId: "fixture-runtime", canvas: sceneOutputCanvas(),
      overlayId: request.overlayId,
      purpose: request.purpose,
      scope: "unified",
      modules: request.enabledModuleIds.map((moduleId) => ({
        moduleId,
        enabled: true,
        instructions: []
      }))
    };
  }
}
