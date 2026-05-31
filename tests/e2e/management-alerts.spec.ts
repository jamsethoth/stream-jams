import { expect, test } from "@playwright/test";
import { mockManagementShell } from "./e2e-helpers.js";

test("management alerts creates a collection, default variant, and test alert text", async ({ page }) => {
  await mockManagementShell(page);

  const collectionRequests: unknown[] = [];
  const ruleRequests: unknown[] = [];
  const collections: Array<{ readonly id: string; readonly name: string; readonly enabled: boolean }> = [];
  const rules: Array<{
    readonly id: string;
    readonly name: string;
    readonly eventType: string;
    readonly enabled: boolean;
    readonly collectionIds: readonly string[];
    readonly variants: readonly { readonly id: string; readonly name: string; readonly enabled: boolean }[];
    readonly priority: number;
  }> = [];

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

  await page.route("**/alerts/rules", async (route) => {
    expect(route.request().headers()["authorization"]).toBe("Bearer mgmt_e2e");
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON() as {
        readonly name: string;
        readonly eventType: string;
        readonly enabled: boolean;
        readonly collectionIds: readonly string[];
        readonly variants: readonly { readonly name: string; readonly enabled: boolean; readonly textTemplate: string }[];
        readonly priority: number;
      };
      ruleRequests.push(body);
      const rule = {
        id: "rule_" + String(rules.length + 1),
        name: body.name,
        eventType: body.eventType,
        enabled: body.enabled,
        collectionIds: body.collectionIds,
        variants: body.variants.map((variant, index) => ({
          id: "variant_" + String(index + 1),
          name: variant.name,
          enabled: variant.enabled
        })),
        priority: body.priority
      };
      rules.push(rule);
      await route.fulfill({ contentType: "application/json", json: rule, status: 201 });
      return;
    }

    await route.fulfill({ contentType: "application/json", json: rules });
  });

  await page.goto("/manage");
  await page.getByRole("tab", { name: "Alerts" }).click();

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
});
