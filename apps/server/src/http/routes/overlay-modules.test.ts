import {
  DefaultOverlayModuleConfigService,
  InMemoryOverlayModuleConfigRepository,
  createDefaultOverlayModuleRegistry
} from "@stream-jams/core";
import { describe, expect, it } from "vitest";
import { createServerApp } from "../../app.js";
import { LocalManagementSessionService } from "../../modules/auth/management-session-service.js";
import { createLocalManagementRateLimitPreHandler, LocalManagementRateLimiter } from "../middleware/local-management-rate-limit.js";
import { createManagementAuthPreHandler } from "../middleware/management-auth.js";

describe("overlay module routes", () => {
  it("lists registered modules for authenticated management clients", async () => {
    const { app, authHeaders } = await createAppWithOverlayModules();

    const response = await app.inject({
      method: "GET",
      url: "/overlay-modules",
      headers: authHeaders
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      expect.objectContaining({
        id: "alerts",
        displayName: "Alerts",
        defaultEnabled: true,
        renderer: {
          entryPoint: "overlay/modules/alerts",
          supportedOutputs: ["module", "unified"]
        }
      })
    ]);
    expect(response.json()[0]).not.toHaveProperty("configSchema");
  });

  it("returns default module config before any config has been saved", async () => {
    const { app, authHeaders } = await createAppWithOverlayModules();

    const response = await app.inject({
      method: "GET",
      url: "/overlay-modules/alerts/config",
      headers: authHeaders
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      moduleId: "alerts",
      enabled: true,
      config: {
        canvas: {
          width: 1920,
          height: 1080
        }
      },
      updatedAt: "2026-05-30T05:00:00.000Z"
    });
  });

  it("saves module config through the service boundary", async () => {
    const { app, authHeaders } = await createAppWithOverlayModules();

    const response = await app.inject({
      method: "PUT",
      url: "/overlay-modules/alerts/config",
      headers: authHeaders,
      payload: {
        enabled: false,
        config: {
          canvas: {
            width: 1280,
            height: 720
          }
        }
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      moduleId: "alerts",
      enabled: false,
      config: {
        canvas: {
          width: 1280,
          height: 720
        }
      }
    });
  });


  it("returns 400 for invalid Alerts canvas config", async () => {
    const { app, authHeaders } = await createAppWithOverlayModules();

    const response = await app.inject({
      method: "PUT",
      url: "/overlay-modules/alerts/config",
      headers: authHeaders,
      payload: {
        enabled: true,
        config: {
          canvas: {
            width: "wide",
            height: -720
          }
        }
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: {
        code: "INVALID_OVERLAY_MODULE_CONFIG",
        message: "Invalid overlay module config for \"alerts\"",
        moduleId: "alerts"
      }
    });
  });

  it("returns 400 for unknown Alerts config fields without replacing saved config", async () => {
    const { app, authHeaders } = await createAppWithOverlayModules();
    const saved = await app.inject({
      method: "PUT",
      url: "/overlay-modules/alerts/config",
      headers: authHeaders,
      payload: {
        enabled: false,
        config: {
          canvas: {
            width: 1280,
            height: 720
          }
        }
      }
    });

    const rejected = await app.inject({
      method: "PUT",
      url: "/overlay-modules/alerts/config",
      headers: authHeaders,
      payload: {
        enabled: true,
        config: {
          canvas: {
            width: 1920,
            height: 1080
          },
          collection: {
            name: "Default"
          }
        }
      }
    });
    const current = await app.inject({
      method: "GET",
      url: "/overlay-modules/alerts/config",
      headers: authHeaders
    });

    expect(saved.statusCode).toBe(200);
    expect(rejected.statusCode).toBe(400);
    expect(rejected.json()).toEqual({
      error: {
        code: "INVALID_OVERLAY_MODULE_CONFIG",
        message: "Invalid overlay module config for \"alerts\"",
        moduleId: "alerts"
      }
    });
    expect(current.json()).toMatchObject({
      moduleId: "alerts",
      enabled: false,
      config: {
        canvas: {
          width: 1280,
          height: 720
        }
      }
    });
  });

  it("toggles module enabled state independently from module config", async () => {
    const { app, authHeaders } = await createAppWithOverlayModules();
    await app.inject({
      method: "PUT",
      url: "/overlay-modules/alerts/config",
      headers: authHeaders,
      payload: {
        enabled: true,
        config: {
          canvas: {
            width: 1600,
            height: 900
          }
        }
      }
    });

    const response = await app.inject({
      method: "PATCH",
      url: "/overlay-modules/alerts/enabled",
      headers: authHeaders,
      payload: {
        enabled: false
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      moduleId: "alerts",
      enabled: false,
      config: {
        canvas: {
          width: 1600,
          height: 900
        }
      }
    });
  });

  it("rejects missing management sessions", async () => {
    const { app } = await createAppWithOverlayModules();

    const response = await app.inject({
      method: "GET",
      url: "/overlay-modules"
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: {
        code: "MANAGEMENT_SESSION_REQUIRED"
      }
    });
  });

  it("returns 404 for unknown module config requests", async () => {
    const { app, authHeaders } = await createAppWithOverlayModules();

    const response = await app.inject({
      method: "GET",
      url: "/overlay-modules/music/config",
      headers: authHeaders
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: {
        code: "OVERLAY_MODULE_NOT_FOUND",
        message: 'Unknown overlay module "music"',
        moduleId: "music"
      }
    });
  });

  it("returns 400 for invalid module config save payloads", async () => {
    const { app, authHeaders } = await createAppWithOverlayModules();

    const response = await app.inject({
      method: "PUT",
      url: "/overlay-modules/alerts/config",
      headers: authHeaders,
      payload: {
        enabled: "yes",
        config: {}
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: {
        code: "INVALID_OVERLAY_MODULE_CONFIG_REQUEST",
        message: "Invalid overlay module config request"
      }
    });
  });
});

async function createAppWithOverlayModules() {
  const registry = createDefaultOverlayModuleRegistry();
  const moduleConfigService = new DefaultOverlayModuleConfigService({
    registry,
    repository: new InMemoryOverlayModuleConfigRepository(),
    clock: () => new Date("2026-05-30T05:00:00.000Z")
  });
  const managementSessionService = new LocalManagementSessionService({
    clock: () => new Date("2026-05-30T05:00:00.000Z"),
    generateId: () => "mgmt_overlay-module-route-session",
    sessionTtlMs: 60_000
  });
  const session = await managementSessionService.createSession();
  const managementRateLimiter = new LocalManagementRateLimiter({
    maxRequests: 100,
    windowMs: 60_000,
    clock: () => new Date("2026-05-30T05:00:00.000Z")
  });
  const app = createServerApp({
    metadata: {
      appName: "stream-jams",
      version: "1.2.3"
    },
    overlayModuleRegistry: registry,
    overlayModuleConfigService: moduleConfigService,
    managementAuthPreHandler: createManagementAuthPreHandler({ sessionService: managementSessionService }),
    managementRateLimitPreHandler: createLocalManagementRateLimitPreHandler({ limiter: managementRateLimiter })
  });

  return {
    app,
    authHeaders: {
      authorization: `Bearer ${session.id}`
    }
  };
}
