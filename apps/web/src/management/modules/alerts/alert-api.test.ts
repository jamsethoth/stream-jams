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
});

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
