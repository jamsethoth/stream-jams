import { describe, expect, it, vi } from "vitest";
import { createHttpAlertConfigurationApi, type CreateAlertRuleInput } from "./alert-api.js";

describe("createHttpAlertConfigurationApi", () => {
  it("creates collections and rules with management headers", async () => {
    const ruleInput: CreateAlertRuleInput = {
      name: "Raid Welcome",
      eventType: "raid",
      enabled: true,
      collectionIds: ["collection_1"],
      conditions: [],
      variants: [
        {
          name: "Default",
          enabled: true,
          weight: 1,
          visualAssetId: null,
          audioAssetId: null,
          textTemplate: "E2E test alert for {actorDisplayName}",
          ttsConfig: null,
          durationMs: 4000,
          layout: {
            x: 40,
            y: 32,
            width: 420,
            height: 96,
            zIndex: 10
          }
        }
      ],
      cooldownSeconds: 0,
      priority: 10
    };
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/auth/management/sessions") {
        return jsonResponse(managementSession());
      }

      if (url === "/alert-collections") {
        expect(init).toMatchObject({
          method: "POST",
          body: JSON.stringify({ name: "Raid Alerts", enabled: true })
        });
        expect(init?.headers).toMatchObject({
          authorization: "Bearer mgmt_session",
          "content-type": "application/json",
          "x-stream-jams-csrf": "csrf_session"
        });
        return jsonResponse({ id: "collection_1", name: "Raid Alerts", enabled: true }, { status: 201 });
      }

      if (url === "/alerts/rules") {
        expect(init).toMatchObject({
          method: "POST",
          body: JSON.stringify(ruleInput)
        });
        expect(init?.headers).toMatchObject({
          authorization: "Bearer mgmt_session",
          "content-type": "application/json",
          "x-stream-jams-csrf": "csrf_session"
        });
        return jsonResponse({
          id: "rule_1",
          ...ruleInput,
          variants: [
            {
              id: "variant_1",
              ...ruleInput.variants[0]!
            }
          ]
        }, { status: 201 });
      }

      throw new Error("Unexpected request " + url);
    });
    const api = createHttpAlertConfigurationApi({ fetch: fetcher });

    await expect(api.createCollection({ name: "Raid Alerts", enabled: true })).resolves.toMatchObject({
      id: "collection_1",
      name: "Raid Alerts"
    });
    await expect(api.createRule(ruleInput)).resolves.toMatchObject({
      id: "rule_1",
      name: "Raid Welcome",
      variants: [expect.objectContaining({ id: "variant_1" })]
    });
    expect(fetcher.mock.calls.filter(([url]) => String(url) === "/auth/management/sessions")).toHaveLength(1);
  });

  it("updates, deletes, and tests alert configuration through management routes", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/auth/management/sessions") {
        return jsonResponse({ id: "mgmt_session" });
      }

      expect(init?.headers).toMatchObject({
        authorization: "Bearer mgmt_session"
      });

      if (url === "/alert-collections/collection_1") {
        if (init?.method === "PUT") {
          expect(init.body).toBe(JSON.stringify({ name: "Main", enabled: false }));
          return jsonResponse({ id: "collection_1", name: "Main", enabled: false });
        }

        expect(init?.method).toBe("DELETE");
        return new Response(null, { status: 204 });
      }

      if (url === "/alerts/rules/rule_1") {
        if (init?.method === "PUT") {
          expect(init.body).toContain("\"name\":\"Cheer\"");
          return jsonResponse(createRuleResponse());
        }

        expect(init?.method).toBe("DELETE");
        return new Response(null, { status: 204 });
      }

      if (url === "/alerts/rules/rule_1/variants/variant_1") {
        expect(init?.method).toBe("DELETE");
        return jsonResponse(createRuleResponse({ variants: [] }));
      }

      if (url === "/alerts/test") {
        expect(init).toMatchObject({
          method: "POST"
        });
        expect(init?.body).toContain("\"type\":\"cheer\"");
        return jsonResponse({
          status: "queued",
          matchedRuleIds: ["rule_1"],
          enqueuedAlertIds: ["resolved_alert_1"]
        });
      }

      throw new Error("Unexpected request " + url);
    });
    const api = createHttpAlertConfigurationApi({ fetch: fetcher });

    await expect(api.updateCollection("collection_1", { name: "Main", enabled: false })).resolves.toMatchObject({
      enabled: false
    });
    await expect(api.updateRule("rule_1", omitRuleId(createRuleResponse()))).resolves.toMatchObject({
      id: "rule_1"
    });
    await expect(api.deleteVariant("rule_1", "variant_1")).resolves.toMatchObject({
      id: "rule_1"
    });
    await expect(api.testAlert(createSampleCheerEvent())).resolves.toEqual({
      status: "queued",
      matchedRuleIds: ["rule_1"],
      enqueuedAlertIds: ["resolved_alert_1"]
    });
    await expect(api.deleteRule("rule_1")).resolves.toBeUndefined();
    await expect(api.deleteCollection("collection_1")).resolves.toBeUndefined();
  });
});

function createRuleResponse(overrides: Partial<ReturnType<typeof createRuleResponseBase>> = {}) {
  return {
    ...createRuleResponseBase(),
    ...overrides
  };
}

function createRuleResponseBase() {
  return {
    id: "rule_1",
    name: "Cheer",
    eventType: "cheer" as const,
    enabled: true,
    collectionIds: ["collection_1"],
    conditions: [{ field: "amount" as const, operator: "min" as const, value: 100 }],
    variants: [
      {
        id: "variant_1",
        name: "Default",
        enabled: true,
        weight: 1,
        visualAssetId: null,
        audioAssetId: null,
        textTemplate: "Thanks!",
        ttsConfig: null,
        durationMs: 4000,
        layout: {
          x: 40,
          y: 32,
          width: 420,
          height: 96,
          zIndex: 10
        }
      }
    ],
    cooldownSeconds: 0,
    priority: 10
  };
}

function omitRuleId(rule: ReturnType<typeof createRuleResponseBase>) {
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

function createSampleCheerEvent() {
  return {
    id: "test_cheer_1",
    providerId: "twitch" as const,
    sourcePlatform: "twitch" as const,
    ingestProvider: "twitch" as const,
    occurredAt: "2026-06-16T12:00:00.000Z",
    actor: {
      id: "sample-viewer",
      displayName: "Sample Viewer"
    },
    message: "Local test alert",
    metadata: {
      sample: true
    },
    type: "cheer" as const,
    amount: 500
  };
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json"
    },
    ...init
  });
}

function managementSession(): { readonly id: string; readonly csrfToken: string } {
  return {
    id: "mgmt_session",
    csrfToken: "csrf_session"
  };
}
