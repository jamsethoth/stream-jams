import type {
  ModuleOutputRequest,
  OverlayComposition,
  OverlayCompositionService,
  OverlayModuleDefinition,
  OverlayModuleRegistry,
  UnifiedOutputRequest
} from "@stream-jams/core";
import { describe, expect, it } from "vitest";
import { createServerApp } from "../../app.js";
import { LocalOverlayAccessService } from "../../modules/overlays/overlay-access-service.js";
import { OverlayGateway } from "../../websocket/overlay-gateway.js";

describe("overlay routes", () => {
  it("serves a module overlay shell and composition through a module route key", async () => {
    const overlayAccessService = createAccessService(["ovl_moduleLive"]);
    const created = await overlayAccessService.createKey({
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
    expect(composition.json()).toEqual({
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

  it("serves a unified test composition through a unified route key", async () => {
    const overlayAccessService = createAccessService(["ovl_unifiedTest"]);
    const created = await overlayAccessService.createKey({
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

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      overlayId: "default",
      purpose: "test",
      scope: "unified",
      modules: [
        {
          moduleId: "alerts",
          enabled: true,
          instructions: []
        },
        {
          moduleId: "music",
          enabled: true,
          instructions: []
        }
      ]
    });
    expect(compositionService.unifiedRequests).toEqual([
      {
        overlayId: "default",
        purpose: "test",
        enabledModuleIds: ["alerts", "music"]
      }
    ]);
    expect(JSON.stringify(response.json())).not.toContain("management");
    expect(JSON.stringify(response.json())).not.toContain("rawProviderPayload");
  });

  it("registers authenticated WebSocket overlay clients", async () => {
    const overlayAccessService = createAccessService(["ovl_moduleLive"]);
    const created = await overlayAccessService.createKey({
      overlayId: "default",
      moduleId: "alerts",
      purpose: "live",
      scope: "module"
    });
    const overlayGateway = new OverlayGateway({
      overlayAccessService,
      generateClientId: () => "client-1"
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
        scope: "module"
      }
    ]);

    socket.close();
    await app.close();
  });

  it("rejects missing, wrong-purpose, and wrong-scope route keys", async () => {
    const overlayAccessService = createAccessService(["ovl_moduleLive", "ovl_unifiedLive"]);
    const moduleKey = await overlayAccessService.createKey({
      overlayId: "default",
      moduleId: "alerts",
      purpose: "live",
      scope: "module"
    });
    const unifiedKey = await overlayAccessService.createKey({
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
    expect(missing.json()).toMatchObject({
      error: {
        code: "OVERLAY_ROUTE_KEY_REQUIRED"
      }
    });
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
});

function createAccessService(rawKeys: readonly string[]): LocalOverlayAccessService {
  let rawKeyIndex = 0;
  let id = 0;
  return new LocalOverlayAccessService({
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
            id
          }) as OverlayModuleDefinition
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
    return {
      overlayId: request.overlayId,
      purpose: request.purpose,
      scope: "module",
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
    return {
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
