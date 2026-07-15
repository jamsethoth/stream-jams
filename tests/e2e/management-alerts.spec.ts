import { expect, test } from "@playwright/test";
import { mockManagementShell } from "./e2e-helpers.js";

test("management alerts creates a collection, default variant, and test alert text", async ({ page }) => {
  await mockManagementShell(page);

  const collectionRequests: unknown[] = [];
  const ruleRequests: unknown[] = [];
  const ruleUpdateRequests: unknown[] = [];
  const testAlertRequests: unknown[] = [];
  const collections: Array<{ readonly id: string; readonly name: string; readonly enabled: boolean }> = [];
  const rules: Array<{
    readonly id: string;
    readonly name: string;
    readonly eventType: string;
    readonly enabled: boolean;
    readonly collectionIds: readonly string[];
    readonly conditions: readonly unknown[];
    readonly variants: readonly {
      readonly id: string;
      readonly name: string;
      readonly enabled: boolean;
      readonly weight: number;
      readonly visualAssetId: string | null;
      readonly audioAssetId: string | null;
      readonly textTemplate: string;
      readonly ttsConfig: null;
      readonly durationMs: number;
      readonly layout: {
        readonly x: number;
        readonly y: number;
        readonly width: number;
        readonly height: number;
        readonly zIndex: number;
      };
    }[];
    readonly cooldownSeconds: number;
    readonly priority: number;
  }> = [];

  await page.route("**/assets", async (route) => {
    expect(route.request().headers()["authorization"]).toBe("Bearer mgmt_e2e");
    await route.fulfill({
      contentType: "application/json",
      json: [
        {
          id: "asset_visual",
          originalFileName: "celebration.gif",
          mediaType: "gif",
          mimeType: "image/gif",
          sizeBytes: 1024,
          checksum: "sha256:visual",
          storagePath: "gif/asset_visual.gif"
        },
        {
          id: "asset_audio",
          originalFileName: "sting.mp3",
          mediaType: "audio",
          mimeType: "audio/mpeg",
          sizeBytes: 2048,
          checksum: "sha256:audio",
          storagePath: "audio/asset_audio.mp3"
        }
      ]
    });
  });

  await page.route("**/alert-collections", async (route) => {
    expect(route.request().headers()["authorization"]).toBe("Bearer mgmt_e2e");
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON() as { readonly name: string; readonly enabled?: boolean };
      collectionRequests.push(body);
      const collection = {
        id: "collection_" + String(collections.length + 1),
        name: body.name,
        enabled: body.enabled ?? true
      };
      collections.push(collection);
      await route.fulfill({ contentType: "application/json", json: collection, status: 201 });
      return;
    }

    await route.fulfill({ contentType: "application/json", json: collections });
  });

  await page.route("**/alerts/rules**", async (route) => {
    expect(route.request().headers()["authorization"]).toBe("Bearer mgmt_e2e");
    const path = new URL(route.request().url()).pathname;
    if (path === "/alerts/rules" && route.request().method() === "POST") {
      const body = route.request().postDataJSON() as {
        readonly name: string;
        readonly eventType: string;
        readonly enabled: boolean;
        readonly collectionIds: readonly string[];
        readonly conditions: readonly unknown[];
        readonly variants: readonly {
          readonly name: string;
          readonly enabled: boolean;
          readonly weight: number;
          readonly visualAssetId: string | null;
          readonly audioAssetId: string | null;
          readonly textTemplate: string;
          readonly ttsConfig: null;
          readonly durationMs: number;
          readonly layout: {
            readonly x: number;
            readonly y: number;
            readonly width: number;
            readonly height: number;
            readonly zIndex: number;
          };
        }[];
        readonly cooldownSeconds: number;
        readonly priority: number;
      };
      ruleRequests.push(body);
      const rule = {
        id: "rule_" + String(rules.length + 1),
        name: body.name,
        eventType: body.eventType,
        enabled: body.enabled,
        collectionIds: body.collectionIds,
        conditions: body.conditions,
        variants: body.variants.map((variant, index) => ({
          id: "variant_" + String(index + 1),
          ...variant
        })),
        cooldownSeconds: body.cooldownSeconds,
        priority: body.priority
      };
      rules.push(rule);
      await route.fulfill({ contentType: "application/json", json: rule, status: 201 });
      return;
    }

    if (path === "/alerts/rules/rule_1" && route.request().method() === "PUT") {
      const body = route.request().postDataJSON() as (typeof rules)[number];
      ruleUpdateRequests.push(body);
      rules[0] = {
        ...body,
        id: "rule_1"
      };
      await route.fulfill({ contentType: "application/json", json: rules[0] });
      return;
    }

    await route.fulfill({ contentType: "application/json", json: rules });
  });

  await page.route("**/alerts/test", async (route) => {
    expect(route.request().headers()["authorization"]).toBe("Bearer mgmt_e2e");
    testAlertRequests.push(route.request().postDataJSON());
    await route.fulfill({
      contentType: "application/json",
      json: {
        status: "queued",
        matchedRuleIds: ["rule_1"],
        enqueuedAlertIds: ["resolved_alert_1"]
      }
    });
  });

  await page.goto("/manage");
  await page.getByRole("link", { name: "Alerts" }).click();

  await expect(page.getByText("No alert collections configured.")).toBeVisible();
  await page.getByLabel("Collection name").fill("Raid Alerts");
  await page.getByRole("button", { name: "Create collection" }).click();

  await expect(page.getByText("Alert collection created.")).toBeVisible();
  await expect(page.getByRole("cell", { name: "Raid Alerts" })).toBeVisible();

  await page.getByLabel("Rule name").fill("Raid Welcome");
  await page.getByLabel("Event type").selectOption("raid");
  await page.getByLabel("Alert text").fill("E2E test alert for {actorDisplayName}");
  await page.getByRole("button", { name: "Create alert rule" }).click();

  await expect(page.getByText("Alert rule created.")).toBeVisible();
  await expect(page.getByRole("cell", { name: "Raid Welcome" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "raid", exact: true })).toBeVisible();

  const editor = page.getByRole("region", { name: "Edit rule" });
  await editor.getByLabel("Event type").selectOption("cheer");
  await editor.getByRole("button", { name: "Add condition" }).click();
  await editor.getByLabel("Condition 1 value").fill("500");
  await editor.getByLabel("Visual asset").selectOption("asset_visual");
  await editor.getByLabel("Audio asset").selectOption("asset_audio");
  await editor.getByLabel("x", { exact: true }).fill("120");
  await expect(editor.getByLabel("Static layout preview")).toBeVisible();
  await editor.getByRole("button", { name: "Save rule" }).click();
  await expect(page.getByText("Alert rule saved.")).toBeVisible();

  await editor.getByRole("button", { name: "Run saved test alert" }).click();
  await expect(page.getByText("Test alert queued from local sample data.")).toBeVisible();

  expect(collectionRequests).toEqual([{ name: "Raid Alerts", enabled: true }]);
  expect(ruleRequests).toEqual([
    expect.objectContaining({
      name: "Raid Welcome",
      eventType: "raid",
      collectionIds: ["collection_1"],
      variants: [
        expect.objectContaining({
          name: "Default",
          enabled: true,
          textTemplate: "E2E test alert for {actorDisplayName}",
          durationMs: 4000
        })
      ]
    })
  ]);
  expect(ruleUpdateRequests).toEqual([
    expect.objectContaining({
      eventType: "cheer",
      conditions: [{ field: "amount", operator: "equals", value: 500 }],
      variants: [
        expect.objectContaining({
          visualAssetId: "asset_visual",
          audioAssetId: "asset_audio",
          layout: expect.objectContaining({
            x: 120
          })
        })
      ]
    })
  ]);
  expect(testAlertRequests).toEqual([
    expect.objectContaining({
      providerId: "twitch",
      type: "cheer",
      amount: 500,
      metadata: expect.objectContaining({
        sample: true,
        ruleId: "rule_1"
      })
    })
  ]);
});
