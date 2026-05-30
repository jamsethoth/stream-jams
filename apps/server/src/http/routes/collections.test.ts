import {
  DefaultAlertService,
  type AlertConfigurationIdKind,
  type AlertService
} from "@stream-jams/core";
import { describe, expect, it } from "vitest";
import { createServerApp } from "../../app.js";
import { SqliteAlertRepository } from "../../modules/alerts/sqlite-alert-repository.js";
import { LocalManagementSessionService } from "../../modules/auth/management-session-service.js";
import { createInMemoryStreamJamsDatabase, type StreamJamsDatabase } from "../../modules/db/database.js";
import { createLocalManagementRateLimitPreHandler, LocalManagementRateLimiter } from "../middleware/local-management-rate-limit.js";
import { createManagementAuthPreHandler } from "../middleware/management-auth.js";

describe("alert collection routes", () => {
  it("creates, lists, updates, toggles, and deletes alert collections", async () => {
    using database = createInMemoryStreamJamsDatabase();
    const { app, authHeaders } = await createAppWithAlerts(database);

    const createResponse = await app.inject({
      method: "POST",
      url: "/alert-collections",
      headers: authHeaders,
      payload: {
        name: "Main Alerts",
        enabled: true
      }
    });

    expect(createResponse.statusCode).toBe(201);
    expect(createResponse.json()).toEqual({
      id: "collection_1",
      name: "Main Alerts",
      enabled: true
    });

    const updateResponse = await app.inject({
      method: "PUT",
      url: "/alert-collections/collection_1",
      headers: authHeaders,
      payload: {
        name: "Main Show Alerts",
        enabled: true
      }
    });
    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json()).toMatchObject({
      id: "collection_1",
      name: "Main Show Alerts"
    });

    const toggleResponse = await app.inject({
      method: "PATCH",
      url: "/alert-collections/collection_1/enabled",
      headers: authHeaders,
      payload: {
        enabled: false
      }
    });
    expect(toggleResponse.statusCode).toBe(200);
    expect(toggleResponse.json()).toMatchObject({
      id: "collection_1",
      enabled: false
    });

    const listResponse = await app.inject({
      method: "GET",
      url: "/alert-collections",
      headers: authHeaders
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toEqual([
      {
        id: "collection_1",
        name: "Main Show Alerts",
        enabled: false
      }
    ]);

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: "/alert-collections/collection_1",
      headers: authHeaders
    });
    expect(deleteResponse.statusCode).toBe(204);
    await expect(
      app.inject({
        method: "GET",
        url: "/alert-collections",
        headers: authHeaders
      })
    ).resolves.toMatchObject({
      statusCode: 200,
      body: "[]"
    });
  });

  it("returns structured errors for invalid payloads and missing collections", async () => {
    using database = createInMemoryStreamJamsDatabase();
    const { app, authHeaders } = await createAppWithAlerts(database);

    const invalidResponse = await app.inject({
      method: "POST",
      url: "/alert-collections",
      headers: authHeaders,
      payload: {
        name: ""
      }
    });
    expect(invalidResponse.statusCode).toBe(400);
    expect(invalidResponse.json()).toEqual({
      error: {
        code: "INVALID_ALERT_COLLECTION_REQUEST",
        message: "Invalid alert collection request"
      }
    });

    const missingResponse = await app.inject({
      method: "PATCH",
      url: "/alert-collections/missing/enabled",
      headers: authHeaders,
      payload: {
        enabled: true
      }
    });
    expect(missingResponse.statusCode).toBe(404);
    expect(missingResponse.json()).toEqual({
      error: {
        code: "ALERT_COLLECTION_NOT_FOUND",
        message: 'Alert collection "missing" was not found'
      }
    });
  });

  it("rejects missing management sessions before reading alert collections", async () => {
    using database = createInMemoryStreamJamsDatabase();
    const { app } = await createAppWithAlerts(database);

    const response = await app.inject({
      method: "GET",
      url: "/alert-collections"
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: {
        code: "MANAGEMENT_SESSION_REQUIRED"
      }
    });
  });
});

async function createAppWithAlerts(database: StreamJamsDatabase) {
  const alertService = createAlertService(database);
  const managementSessionService = new LocalManagementSessionService({
    clock: () => new Date("2026-05-30T08:00:00.000Z"),
    generateId: () => "mgmt_alert-collections-session",
    sessionTtlMs: 60_000
  });
  const session = await managementSessionService.createSession();
  const managementRateLimiter = new LocalManagementRateLimiter({
    maxRequests: 100,
    windowMs: 60_000,
    clock: () => new Date("2026-05-30T08:00:00.000Z")
  });
  const app = createServerApp({
    metadata: {
      appName: "stream-jams",
      version: "1.2.3"
    },
    alertService,
    managementAuthPreHandler: createManagementAuthPreHandler({ sessionService: managementSessionService }),
    managementRateLimitPreHandler: createLocalManagementRateLimitPreHandler({ limiter: managementRateLimiter })
  });

  return {
    app,
    alertService,
    authHeaders: {
      authorization: `Bearer ${session.id}`
    }
  };
}

function createAlertService(database: StreamJamsDatabase): AlertService {
  let nextId = 0;
  return new DefaultAlertService({
    repository: new SqliteAlertRepository(database.connection),
    generateId: (kind: AlertConfigurationIdKind) => `${kind}_${(nextId += 1)}`
  });
}
