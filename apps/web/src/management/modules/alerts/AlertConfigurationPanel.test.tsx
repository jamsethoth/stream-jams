import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { AlertConfigurationPanel, type AlertConfigurationApi } from "./AlertConfigurationPanel.js";
import type { AlertCollection, AlertRule } from "./alert-api.js";

describe("AlertConfigurationPanel", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders loaded alert collections and rules", async () => {
    render(
      <AlertConfigurationPanel
        alertApi={createAlertApi({
          collections: [[createCollection()]],
          rules: [[createRule()]]
        })}
      />
    );

    expect(await screen.findByRole("cell", { name: "Main Alerts" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Follow Alert" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "follow" })).toBeInTheDocument();
  });

  it("shows empty states when no alert configuration exists", async () => {
    render(
      <AlertConfigurationPanel
        alertApi={createAlertApi({
          collections: [[]],
          rules: [[]]
        })}
      />
    );

    expect(await screen.findByText("No alert collections configured.")).toBeInTheDocument();
    expect(screen.getByText("No alert rules configured.")).toBeInTheDocument();
  });

  it("toggles collection active state and refreshes configuration", async () => {
    const user = userEvent.setup();
    const api = createAlertApi({
      collections: [[createCollection({ enabled: true })], [createCollection({ enabled: false })]],
      rules: [[createRule()], [createRule()]]
    });
    render(<AlertConfigurationPanel alertApi={api} />);

    const row = (await screen.findByRole("cell", { name: "Main Alerts" })).closest("tr");
    if (row === null) {
      throw new Error("Missing collection row");
    }

    await user.click(within(row).getByRole("checkbox", { name: "Active" }));

    await waitFor(() => expect(api.collectionToggles).toEqual([{ collectionId: "collection_1", enabled: false }]));
    expect(await screen.findByText("Collection updated.")).toBeInTheDocument();
  });

  it("toggles individual alert enabled state independently from collection state", async () => {
    const user = userEvent.setup();
    const api = createAlertApi({
      collections: [[createCollection()], [createCollection()]],
      rules: [[createRule({ enabled: true })], [createRule({ enabled: false })]]
    });
    render(<AlertConfigurationPanel alertApi={api} />);

    const row = (await screen.findByRole("cell", { name: "Follow Alert" })).closest("tr");
    if (row === null) {
      throw new Error("Missing rule row");
    }

    await user.click(within(row).getByRole("checkbox", { name: "Enabled" }));

    await waitFor(() => expect(api.ruleToggles).toEqual([{ ruleId: "rule_1", enabled: false }]));
    expect(await screen.findByText("Rule updated.")).toBeInTheDocument();
  });

  it("shows diagnostics when alert configuration actions fail", async () => {
    const user = userEvent.setup();
    const api = createAlertApi({
      collections: [[createCollection()]],
      rules: [[createRule()]],
      toggleError: new Error("Alert rule unavailable")
    });
    render(<AlertConfigurationPanel alertApi={api} />);

    const row = (await screen.findByRole("cell", { name: "Follow Alert" })).closest("tr");
    if (row === null) {
      throw new Error("Missing rule row");
    }

    await user.click(within(row).getByRole("checkbox", { name: "Enabled" }));

    expect(await screen.findByText("Alert rule unavailable")).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Follow Alert" })).toBeInTheDocument();
  });
});

function createCollection(overrides: Partial<AlertCollection> = {}): AlertCollection {
  return {
    id: "collection_1",
    name: "Main Alerts",
    enabled: true,
    ...overrides
  };
}

function createRule(overrides: Partial<AlertRule> = {}): AlertRule {
  return {
    id: "rule_1",
    name: "Follow Alert",
    eventType: "follow",
    enabled: true,
    collectionIds: ["collection_1"],
    variants: [
      {
        id: "variant_1",
        name: "Default",
        enabled: true
      }
    ],
    priority: 10,
    ...overrides
  };
}

function createAlertApi(options: {
  readonly collections: readonly (readonly AlertCollection[])[];
  readonly rules: readonly (readonly AlertRule[])[];
  readonly toggleError?: Error;
}): AlertConfigurationApi & {
  readonly collectionToggles: Array<{ readonly collectionId: string; readonly enabled: boolean }>;
  readonly ruleToggles: Array<{ readonly ruleId: string; readonly enabled: boolean }>;
} {
  let collectionIndex = 0;
  let ruleIndex = 0;
  const collectionToggles: Array<{ readonly collectionId: string; readonly enabled: boolean }> = [];
  const ruleToggles: Array<{ readonly ruleId: string; readonly enabled: boolean }> = [];

  return {
    collectionToggles,
    ruleToggles,
    async listCollections() {
      const collections = options.collections[Math.min(collectionIndex, options.collections.length - 1)] ?? [];
      collectionIndex += 1;
      return collections;
    },
    async listRules() {
      const rules = options.rules[Math.min(ruleIndex, options.rules.length - 1)] ?? [];
      ruleIndex += 1;
      return rules;
    },
    async setCollectionEnabled(collectionId: string, enabled: boolean) {
      collectionToggles.push({ collectionId, enabled });
      if (options.toggleError !== undefined) {
        throw options.toggleError;
      }

      return createCollection({ id: collectionId, enabled });
    },
    async setRuleEnabled(ruleId: string, enabled: boolean) {
      ruleToggles.push({ ruleId, enabled });
      if (options.toggleError !== undefined) {
        throw options.toggleError;
      }

      return createRule({ id: ruleId, enabled });
    }
  };
}
