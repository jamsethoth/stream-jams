import {
  DefaultOverlayModuleConfigService,
  InMemoryOverlayModuleConfigRepository,
  createDefaultOverlayModuleRegistry,
  type SecretRef,
  type SecretStore
} from "@stream-jams/core";
import { describe, expect, it } from "vitest";
import { createServerApp } from "../../app.js";
import { LocalManagementSessionService } from "../../modules/auth/management-session-service.js";
import { InMemoryOverlayAccessKeyRepository, LocalOverlayAccessService } from "../../modules/overlays/overlay-access-service.js";
import {
  OverlayOutputManagementService,
  createOverlayRouteKeySecretRef
} from "../../modules/overlays/overlay-output-management-service.js";
import { OverlayGateway } from "../../websocket/overlay-gateway.js";
import { createLocalManagementRateLimitPreHandler, LocalManagementRateLimiter } from "../middleware/local-management-rate-limit.js";
import { createManagementAuthPreHandler } from "../middleware/management-auth.js";

describe("overlay output management routes", () => {
  it("creates, lists, regenerates, and revokes copyable URLs for management clients", async () => {
    const { app, authHeaders } = await createApp(["ovl_first", "ovl_second"]);

    const missingAuth = await app.inject({
      method: "GET",
      url: "/management/overlay-outputs"
    });
    const created = await app.inject({
      method: "POST",
      url: "/management/overlay-outputs/keys",
      headers: authHeaders,
      payload: {
        scope: "module",
        moduleId: "alerts",
        purpose: "live"
      }
    });
    const listed = await app.inject({
      method: "GET",
      url: "/management/overlay-outputs",
      headers: authHeaders
    });
    const overlayKeyAuth = await app.inject({
      method: "GET",
      url: "/management/overlay-outputs",
      headers: {
        authorization: "Bearer ovl_first",
        host: "localhost:80"
      }
    });
    const regenerated = await app.inject({
      method: "POST",
      url: "/management/overlay-outputs/keys/regenerate",
      headers: authHeaders,
      payload: {
        scope: "module",
        moduleId: "alerts",
        purpose: "live"
      }
    });
    const clients = await app.inject({
      method: "GET",
      url: "/management/overlay-clients",
      headers: authHeaders
    });
    const revoked = await app.inject({
      method: "DELETE",
      url: `/management/overlay-outputs/keys/${regenerated.json().keyId}`,
      headers: authHeaders
    });

    expect(missingAuth.statusCode).toBe(401);
    expect(overlayKeyAuth.statusCode).toBe(401);
    expect(created.statusCode).toBe(200);
    expect(created.json()).toMatchObject({
      keyId: "key-1",
      url: "http://localhost:80/overlay/modules/alerts/live/ovl_first"
    });
    expect(listed.json()).toContainEqual(
      expect.objectContaining({
        id: "module:alerts:live",
        keyId: "key-1",
        copyableUrlStatus: "available",
        url: "http://localhost:80/overlay/modules/alerts/live/ovl_first"
      })
    );
    expect(listed.body).not.toContain("route-key");
    expect(regenerated.json()).toMatchObject({
      keyId: "key-2",
      url: "http://localhost:80/overlay/modules/alerts/live/ovl_second"
    });
    expect(clients.statusCode).toBe(200);
    expect(clients.json()).toEqual([]);
    expect(revoked.statusCode).toBe(204);
  });
});

async function createApp(rawKeys: string[]) {
  let id = 0;
  let rawKeyIndex = 0;
  const registry = createDefaultOverlayModuleRegistry();
  const moduleConfigService = new DefaultOverlayModuleConfigService({
    registry,
    repository: new InMemoryOverlayModuleConfigRepository(),
    clock: () => new Date("2026-06-16T12:00:00.000Z")
  });
  const repository = new InMemoryOverlayAccessKeyRepository();
  const overlayAccessService = new LocalOverlayAccessService({
    repository,
    clock: () => new Date("2026-06-16T12:00:00.000Z"),
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
    },
    createRouteKeySecretRef: createOverlayRouteKeySecretRef
  });
  const secretStore = new MemorySecretStore();
  const managementSessionService = new LocalManagementSessionService({
    clock: () => new Date("2026-06-16T12:00:00.000Z"),
    generateId: () => "mgmt_overlay-output-route-session",
    sessionTtlMs: 60_000
  });
  const session = await managementSessionService.createSession();

  return {
    app: createServerApp({
      metadata: {
        appName: "stream-jams",
        version: "1.2.3"
      },
      overlayOutputManagementService: new OverlayOutputManagementService({
        overlayAccessService,
        overlayKeyRepository: repository,
        overlayModuleRegistry: registry,
        overlayModuleConfigService: moduleConfigService,
        secretStore
      }),
      overlayGateway: new OverlayGateway({
        overlayAccessService,
        generateClientId: () => "client-1",
        clock: () => new Date("2026-06-16T12:00:00.000Z")
      }),
      managementAuthPreHandler: createManagementAuthPreHandler({ sessionService: managementSessionService }),
      managementRateLimitPreHandler: createLocalManagementRateLimitPreHandler({
        limiter: new LocalManagementRateLimiter({
          maxRequests: 100,
          windowMs: 60_000,
          clock: () => new Date("2026-06-16T12:00:00.000Z")
        })
      })
    }),
    authHeaders: {
      authorization: `Bearer ${session.id}`,
      host: "localhost:80"
    }
  };
}

class MemorySecretStore implements SecretStore {
  readonly values = new Map<string, string>();

  async setSecret(ref: SecretRef, value: string): Promise<void> {
    this.values.set(key(ref), value);
  }

  async getSecret(ref: SecretRef): Promise<string | null> {
    return this.values.get(key(ref)) ?? null;
  }

  async deleteSecret(ref: SecretRef): Promise<void> {
    this.values.delete(key(ref));
  }
}

function key(ref: SecretRef): string {
  return `${ref.namespace}:${ref.name}:${ref.accountId}`;
}
