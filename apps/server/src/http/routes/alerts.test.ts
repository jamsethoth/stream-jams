import {
  DefaultAlertService,
  type AlertConfigurationIdKind,
  type CreateAlertRuleInput,
  type AlertRule,
  type AlertService,
  type AlertVariant,
  type NormalizedStreamEvent
} from "@stream-jams/core";
import { describe, expect, it, vi } from "vitest";
import { createServerApp } from "../../app.js";
import { SqliteAlertRepository } from "../../modules/alerts/sqlite-alert-repository.js";
import { LocalManagementSessionService } from "../../modules/auth/management-session-service.js";
import { createInMemoryStreamJamsDatabase, type StreamJamsDatabase } from "../../modules/db/database.js";
import { createLocalManagementRateLimitPreHandler, LocalManagementRateLimiter } from "../middleware/local-management-rate-limit.js";
import { createManagementAuthPreHandler } from "../middleware/management-auth.js";
import type { AlertTestPlaybackCoordinator } from "./alerts.js";

describe("alert rule routes", () => {
  it("creates, lists, updates, toggles, and deletes alert rules", async () => {
    using database = createInMemoryStreamJamsDatabase();
    const { app, alertService, authHeaders } = await createAppWithAlerts(database);
    const collection = await alertService.createCollection({ name: "Main Alerts", enabled: true });

    const createResponse = await app.inject({
      method: "POST",
      url: "/alerts/rules",
      headers: authHeaders,
      payload: createRulePayload([collection.id])
    });

    expect(createResponse.statusCode).toBe(201);
    const createdRule = createResponse.json() as AlertRule;
    expect(createdRule).toMatchObject({
      id: "rule_2",
      name: "Follow Alert",
      enabled: true,
      collectionIds: [collection.id]
    });
    expect(createdRule.variants[0]).toMatchObject({
      id: "variant_3",
      name: "Default"
    });

    const listResponse = await app.inject({
      method: "GET",
      url: "/alerts/rules",
      headers: authHeaders
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toEqual([createdRule]);

    const updateResponse = await app.inject({
      method: "PUT",
      url: `/alerts/rules/${createdRule.id}`,
      headers: authHeaders,
      payload: omitRuleId({
        ...createdRule,
        name: "Updated Follow Alert"
      })
    });
    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json()).toMatchObject({
      id: createdRule.id,
      name: "Updated Follow Alert"
    });

    const toggleResponse = await app.inject({
      method: "PATCH",
      url: `/alerts/rules/${createdRule.id}/enabled`,
      headers: authHeaders,
      payload: {
        enabled: false
      }
    });
    expect(toggleResponse.statusCode).toBe(200);
    expect(toggleResponse.json()).toMatchObject({
      id: createdRule.id,
      enabled: false
    });

    const activationResponse = await app.inject({
      method: "GET",
      url: "/alerts/activation",
      headers: authHeaders
    });
    expect(activationResponse.statusCode).toBe(200);
    expect(activationResponse.json()).toEqual({
      enabledCollectionIds: [collection.id],
      disabledRuleIds: [createdRule.id]
    });

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: `/alerts/rules/${createdRule.id}`,
      headers: authHeaders
    });
    expect(deleteResponse.statusCode).toBe(204);
  });

  it("upserts and deletes non-final variants through alert rule routes", async () => {
    using database = createInMemoryStreamJamsDatabase();
    const { app, alertService, authHeaders } = await createAppWithAlerts(database);
    const collection = await alertService.createCollection({ name: "Main Alerts", enabled: true });
    const rule = await alertService.createRule(createRulePayload([collection.id]));
    const originalVariant = rule.variants[0];
    if (originalVariant === undefined) {
      throw new Error("Missing variant fixture");
    }

    const updateVariantResponse = await app.inject({
      method: "PUT",
      url: `/alerts/rules/${rule.id}/variants/${originalVariant.id}`,
      headers: authHeaders,
      payload: omitVariantId({
        ...originalVariant,
        name: "VIP Follow",
        weight: 2
      })
    });
    expect(updateVariantResponse.statusCode).toBe(200);
    expect((updateVariantResponse.json() as AlertRule).variants).toMatchObject([
      {
        id: originalVariant.id,
        name: "VIP Follow",
        weight: 2
      }
    ]);

    const createVariantResponse = await app.inject({
      method: "PUT",
      url: `/alerts/rules/${rule.id}/variants/variant_bonus`,
      headers: authHeaders,
      payload: omitVariantId({
        ...originalVariant,
        name: "Bonus Follow"
      })
    });
    expect(createVariantResponse.statusCode).toBe(200);
    expect((createVariantResponse.json() as AlertRule).variants.map((variant) => variant.id)).toEqual([
      originalVariant.id,
      "variant_bonus"
    ]);

    const deleteVariantResponse = await app.inject({
      method: "DELETE",
      url: `/alerts/rules/${rule.id}/variants/variant_bonus`,
      headers: authHeaders
    });
    expect(deleteVariantResponse.statusCode).toBe(200);
    expect((deleteVariantResponse.json() as AlertRule).variants).toHaveLength(1);

    const deleteLastVariantResponse = await app.inject({
      method: "DELETE",
      url: `/alerts/rules/${rule.id}/variants/${originalVariant.id}`,
      headers: authHeaders
    });
    expect(deleteLastVariantResponse.statusCode).toBe(400);
    expect(deleteLastVariantResponse.json()).toMatchObject({
      error: {
        code: "ALERT_RULE_REQUIRES_VARIANT"
      }
    });
  });

  it("returns structured conflicts for duplicate and cross-rule variant IDs", async () => {
    using database = createInMemoryStreamJamsDatabase();
    const { app, alertService, authHeaders } = await createAppWithAlerts(database);
    const collection = await alertService.createCollection({ name: "Main Alerts", enabled: true });
    const firstRule = await alertService.createRule(createRulePayload([collection.id]));
    const secondRule = await alertService.createRule(createRulePayload([collection.id]));
    const firstVariant = firstRule.variants[0];
    const secondVariant = secondRule.variants[0];
    if (firstVariant === undefined || secondVariant === undefined) {
      throw new Error("Missing variant fixture");
    }

    const duplicateVariantResponse = await app.inject({
      method: "PUT",
      url: `/alerts/rules/${firstRule.id}`,
      headers: authHeaders,
      payload: omitRuleId({
        ...firstRule,
        variants: [firstVariant, firstVariant]
      })
    });
    expect(duplicateVariantResponse.statusCode).toBe(409);
    expect(duplicateVariantResponse.json()).toEqual({
      error: {
        code: "ALERT_VARIANT_ID_CONFLICT",
        message: `Alert variant id "${firstVariant.id}" is duplicated`
      }
    });

    const crossRuleVariantResponse = await app.inject({
      method: "PUT",
      url: `/alerts/rules/${secondRule.id}/variants/${firstVariant.id}`,
      headers: authHeaders,
      payload: omitVariantId(secondVariant)
    });
    expect(crossRuleVariantResponse.statusCode).toBe(409);
    expect(crossRuleVariantResponse.json()).toEqual({
      error: {
        code: "ALERT_VARIANT_ID_CONFLICT",
        message: `Alert variant "${firstVariant.id}" already belongs to rule "${firstRule.id}"`
      }
    });
  });

  it("returns structured errors for invalid payloads and missing alert rules", async () => {
    using database = createInMemoryStreamJamsDatabase();
    const { app, alertService, authHeaders } = await createAppWithAlerts(database);

    const invalidResponse = await app.inject({
      method: "POST",
      url: "/alerts/rules",
      headers: authHeaders,
      payload: {
        name: ""
      }
    });
    expect(invalidResponse.statusCode).toBe(400);
    expect(invalidResponse.json()).toEqual({
      error: {
        code: "INVALID_ALERT_RULE_REQUEST",
        message: "Invalid alert rule request"
      }
    });

    const missingCollectionResponse = await app.inject({
      method: "POST",
      url: "/alerts/rules",
      headers: authHeaders,
      payload: createRulePayload(["missing_collection"])
    });
    expect(missingCollectionResponse.statusCode).toBe(404);
    expect(missingCollectionResponse.json()).toEqual({
      error: {
        code: "ALERT_COLLECTION_NOT_FOUND",
        message: 'Alert collection "missing_collection" was not found'
      }
    });

    const collection = await alertService.createCollection({ name: "Main Alerts", enabled: true });
    const rule = await alertService.createRule(createRulePayload([collection.id]));
    const missingCollectionUpdateResponse = await app.inject({
      method: "PUT",
      url: `/alerts/rules/${rule.id}`,
      headers: authHeaders,
      payload: omitRuleId({
        ...rule,
        collectionIds: ["missing_collection"]
      })
    });
    expect(missingCollectionUpdateResponse.statusCode).toBe(404);
    expect(missingCollectionUpdateResponse.json()).toEqual({
      error: {
        code: "ALERT_COLLECTION_NOT_FOUND",
        message: 'Alert collection "missing_collection" was not found'
      }
    });

    const missingResponse = await app.inject({
      method: "PATCH",
      url: "/alerts/rules/missing/enabled",
      headers: authHeaders,
      payload: {
        enabled: true
      }
    });
    expect(missingResponse.statusCode).toBe(404);
    expect(missingResponse.json()).toEqual({
      error: {
        code: "ALERT_RULE_NOT_FOUND",
        message: 'Alert rule "missing" was not found'
      }
    });
  });

  it("runs local sample test alerts through the playback coordinator", async () => {
    using database = createInMemoryStreamJamsDatabase();
    const enqueueEvent = vi.fn(async () => ({
      status: "queued" as const,
      snapshot: {
        current: null,
        queued: [],
        recent: [],
        paused: false,
        muted: false,
        doNotDisturb: false
      },
      matchedRuleIds: ["rule_1"],
      enqueuedAlertIds: ["resolved_alert_1"]
    }));
    const { app, authHeaders } = await createAppWithAlerts(database, {
      alertTestPlaybackCoordinator: {
        enqueueEvent
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/alerts/test",
      headers: authHeaders,
      payload: createSampleCheerEvent()
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: "queued",
      matchedRuleIds: ["rule_1"],
      enqueuedAlertIds: ["resolved_alert_1"]
    });
    expect(enqueueEvent).toHaveBeenCalledWith(expect.objectContaining({
      id: "test_cheer_1",
      type: "cheer",
      metadata: {
        sample: true
      }
    }));
  });

  it("rejects missing management sessions before listing alert rules", async () => {
    using database = createInMemoryStreamJamsDatabase();
    const { app } = await createAppWithAlerts(database);

    const response = await app.inject({
      method: "GET",
      url: "/alerts/rules"
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: {
        code: "MANAGEMENT_SESSION_REQUIRED"
      }
    });
  });
});

async function createAppWithAlerts(
  database: StreamJamsDatabase,
  options: {
    readonly alertTestPlaybackCoordinator?: AlertTestPlaybackCoordinator;
  } = {}
) {
  const alertService = createAlertService(database);
  const managementSessionService = new LocalManagementSessionService({
    clock: () => new Date("2026-05-30T08:30:00.000Z"),
    generateId: () => "mgmt_alert-routes-session",
    sessionTtlMs: 60_000
  });
  const session = await managementSessionService.createSession();
  const managementRateLimiter = new LocalManagementRateLimiter({
    maxRequests: 100,
    windowMs: 60_000,
    clock: () => new Date("2026-05-30T08:30:00.000Z")
  });
  const app = createServerApp({
    metadata: {
      appName: "stream-jams",
      version: "1.2.3"
    },
    alertService,
    ...(options.alertTestPlaybackCoordinator === undefined
      ? {}
      : { alertTestPlaybackCoordinator: options.alertTestPlaybackCoordinator }),
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

function createRulePayload(collectionIds: readonly string[]): CreateAlertRuleInput {
  return {
    name: "Follow Alert",
    eventType: "follow",
    enabled: true,
    collectionIds,
    conditions: [],
    variants: [
      {
        name: "Default",
        enabled: true,
        weight: 1,
        visualAssetId: null,
        audioAssetId: null,
        textTemplate: "Thanks {actor.displayName}!",
        ttsConfig: null,
        durationMs: 5000,
        layout: {
          x: 100,
          y: 200,
          width: 640,
          height: 360,
          zIndex: 1
        }
      }
    ],
    cooldownSeconds: 30,
    priority: 10
  };
}

function createSampleCheerEvent(): NormalizedStreamEvent {
  return {
    id: "test_cheer_1",
    providerId: "twitch",
    sourcePlatform: "twitch",
    ingestProvider: "twitch",
    occurredAt: "2026-06-16T12:00:00.000Z",
    actor: {
      id: "sample-viewer",
      displayName: "Sample Viewer"
    },
    message: "Local test alert",
    metadata: {
      sample: true
    },
    type: "cheer",
    amount: 500
  };
}

function omitRuleId(rule: AlertRule): Omit<AlertRule, "id"> {
  return {
    name: rule.name,
    eventType: rule.eventType,
    enabled: rule.enabled,
    collectionIds: rule.collectionIds,
    conditions: rule.conditions,
    variants: rule.variants,
    cooldownSeconds: rule.cooldownSeconds,
    priority: rule.priority
  };
}

function omitVariantId(variant: AlertVariant): Omit<AlertVariant, "id"> {
  return {
    name: variant.name,
    enabled: variant.enabled,
    weight: variant.weight,
    visualAssetId: variant.visualAssetId,
    audioAssetId: variant.audioAssetId,
    textTemplate: variant.textTemplate,
    ttsConfig: variant.ttsConfig,
    durationMs: variant.durationMs,
    layout: variant.layout
  };
}
