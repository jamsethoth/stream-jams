import type { FastifyRequest } from "fastify";
import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { LocalOverlayAccessService } from "../../modules/overlays/overlay-access-service.js";
import { createOverlayAuthPreHandler } from "./overlay-auth.js";

const now = new Date("2026-05-29T12:00:00.000Z");

describe("createOverlayAuthPreHandler", () => {
  it("authorizes a module overlay from the route segment key and ignores query-string keys", async () => {
    const overlayAccessService = new LocalOverlayAccessService({
      clock: () => now,
      generateId: () => "key-1",
      generateRawKey: () => "ovl_segmentKey"
    });
    await overlayAccessService.createKey({
      overlayId: "default",
      moduleId: "alerts",
      purpose: "live",
      scope: "module"
    });
    const app = createOverlayApp(overlayAccessService);

    const response = await app.inject({
      method: "GET",
      url: "/overlay/modules/alerts/live/ovl_segmentKey?key=ovl_queryKey"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });

    const queryOnly = await app.inject({
      method: "GET",
      url: "/overlay/modules/alerts/live?key=ovl_segmentKey"
    });

    expect(queryOnly.statusCode).toBe(401);
    expect(queryOnly.json()).toMatchObject({
      error: {
        code: "OVERLAY_ROUTE_KEY_REQUIRED"
      }
    });
  });

  it("authorizes a unified overlay from the route segment key", async () => {
    const overlayAccessService = new LocalOverlayAccessService({
      clock: () => now,
      generateId: () => "key-1",
      generateRawKey: () => "ovl_unifiedSegmentKey"
    });
    const created = await overlayAccessService.createKey({
      overlayId: "default",
      moduleId: null,
      purpose: "test",
      scope: "unified"
    });
    const app = createUnifiedOverlayApp(overlayAccessService);

    const response = await app.inject({
      method: "GET",
      url: `/overlay/unified/test/${created.rawKey}`
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
  });

  it("rejects live/test, module/unified, wrong-module, and revoked key mismatches", async () => {
    const overlayAccessService = new LocalOverlayAccessService({
      clock: () => now,
      generateId: createSequentialIdGenerator(),
      generateRawKey: createSequentialRawKeyGenerator(["ovl_testKey", "ovl_unifiedKey", "ovl_revokedKey"])
    });
    const testKey = await overlayAccessService.createKey({
      overlayId: "default",
      moduleId: "alerts",
      purpose: "test",
      scope: "module"
    });
    const unifiedKey = await overlayAccessService.createKey({
      overlayId: "default",
      moduleId: null,
      purpose: "live",
      scope: "unified"
    });
    const revokedKey = await overlayAccessService.createKey({
      overlayId: "default",
      moduleId: "alerts",
      purpose: "live",
      scope: "module"
    });
    await overlayAccessService.revokeKey(revokedKey.record.id);
    const app = createOverlayApp(overlayAccessService);

    await expectOverlayDenied(app, `/overlay/modules/alerts/live/${testKey.rawKey}`, "OVERLAY_ROUTE_KEY_UNAUTHORIZED");
    await expectOverlayDenied(app, `/overlay/modules/alerts/live/${unifiedKey.rawKey}`, "OVERLAY_ROUTE_KEY_UNAUTHORIZED");
    await expectOverlayDenied(app, `/overlay/modules/music/test/${testKey.rawKey}`, "OVERLAY_ROUTE_KEY_UNAUTHORIZED");
    await expectOverlayDenied(app, `/overlay/modules/alerts/live/${revokedKey.rawKey}`, "OVERLAY_ROUTE_KEY_UNAUTHORIZED");
  });
});

function createOverlayApp(overlayAccessService: LocalOverlayAccessService) {
  const app = Fastify({ logger: false });
  const preHandler = createOverlayAuthPreHandler({
    overlayAccessService,
    resolveAccessRequest: resolveModuleOverlayAccessRequest
  });

  app.get("/overlay/modules/:moduleId/:purpose", { preHandler }, async () => ({ ok: true }));
  app.get("/overlay/modules/:moduleId/:purpose/:overlayKey", { preHandler }, async () => ({ ok: true }));
  return app;
}

function createUnifiedOverlayApp(overlayAccessService: LocalOverlayAccessService) {
  const app = Fastify({ logger: false });
  app.get(
    "/overlay/unified/:purpose/:overlayKey",
    {
      preHandler: createOverlayAuthPreHandler({
        overlayAccessService,
        resolveAccessRequest: resolveUnifiedOverlayAccessRequest
      })
    },
    async () => ({ ok: true })
  );
  return app;
}

function resolveModuleOverlayAccessRequest(request: FastifyRequest) {
  const params = request.params as {
    readonly moduleId?: string;
    readonly purpose?: "live" | "test";
    readonly overlayKey?: string;
  };

  if (params.overlayKey === undefined || params.purpose === undefined || params.moduleId === undefined) {
    return null;
  }

  return {
    overlayId: "default",
    moduleId: params.moduleId,
    purpose: params.purpose,
    scope: "module" as const,
    rawKey: params.overlayKey
  };
}

function resolveUnifiedOverlayAccessRequest(request: FastifyRequest) {
  const params = request.params as {
    readonly purpose?: "live" | "test";
    readonly overlayKey?: string;
  };

  if (params.overlayKey === undefined || params.purpose === undefined) {
    return null;
  }

  return {
    overlayId: "default",
    moduleId: null,
    purpose: params.purpose,
    scope: "unified" as const,
    rawKey: params.overlayKey
  };
}

async function expectOverlayDenied(app: ReturnType<typeof createOverlayApp>, url: string, code: string): Promise<void> {
  const response = await app.inject({
    method: "GET",
    url
  });

  expect(response.statusCode).toBe(401);
  expect(response.json()).toMatchObject({
    error: {
      code
    }
  });
}

function createSequentialIdGenerator(): () => string {
  let id = 0;
  return () => {
    id += 1;
    return `key-${id}`;
  };
}

function createSequentialRawKeyGenerator(rawKeys: readonly string[]): () => string {
  let index = 0;
  return () => {
    const rawKey = rawKeys[index];
    index += 1;
    if (rawKey === undefined) {
      throw new Error("Missing raw key fixture");
    }
    return rawKey;
  };
}
