import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { AlertConfigurationPanel, type AlertConfigurationApi } from "./AlertConfigurationPanel.js";
import type { AlertCollection, AlertRule, CreateAlertCollectionInput, CreateAlertRuleInput } from "./alert-api.js";

describe("AlertConfigurationPanel", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders loaded alert collections and rules", async () => {
    render(<AlertConfigurationPanel alertApi={createAlertApi({ collections: [createCollection()], rules: [createRule()] })} />);

    expect(await screen.findByRole("cell", { name: "Main Alerts" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Follow Alert" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "follow" })).toBeInTheDocument();
  });

  it("shows empty states when no alert configuration exists", async () => {
    render(<AlertConfigurationPanel alertApi={createAlertApi()} />);

    expect(await screen.findByText("No alert collections configured.")).toBeInTheDocument();
    expect(screen.getByText("No alert rules configured.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create alert rule" })).toBeDisabled();
  });

  it("creates a collection and default alert rule from the browser form", async () => {
    const user = userEvent.setup();
    const api = createAlertApi();
    render(<AlertConfigurationPanel alertApi={api} />);

    await user.type(await screen.findByLabelText("Collection name"), "Raid Alerts");
    await user.click(screen.getByRole("button", { name: "Create collection" }));

    await waitFor(() => expect(api.collectionCreations).toEqual([{ name: "Raid Alerts", enabled: true }]));
    expect(await screen.findByRole("cell", { name: "Raid Alerts" })).toBeInTheDocument();
    expect(await screen.findByText("Alert collection created.")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Rule name"), "Raid Welcome");
    await user.selectOptions(screen.getByLabelText("Event type"), "raid");
    await user.type(screen.getByLabelText("Alert text"), "E2E test alert");
    await user.click(screen.getByRole("button", { name: "Create alert rule" }));

    await waitFor(() => expect(api.ruleCreations).toHaveLength(1));
    expect(api.ruleCreations[0]).toMatchObject({
      name: "Raid Welcome",
      eventType: "raid",
      enabled: true,
      collectionIds: ["collection_1"],
      cooldownSeconds: 0,
      priority: 10,
      variants: [
        expect.objectContaining({
          name: "Default",
          enabled: true,
          weight: 1,
          textTemplate: "E2E test alert",
          durationMs: 4000
        })
      ]
    });
    expect(await screen.findByRole("cell", { name: "Raid Welcome" })).toBeInTheDocument();
    expect(await screen.findByText("Alert rule created.")).toBeInTheDocument();
  });

  it("toggles collection active state and refreshes configuration", async () => {
    const user = userEvent.setup();
    const api = createAlertApi({
      collections: [createCollection({ enabled: true })],
      rules: [createRule()]
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
      collections: [createCollection()],
      rules: [createRule({ enabled: true })]
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
      collections: [createCollection()],
      rules: [createRule()],
      actionError: new Error("Alert rule unavailable")
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
  readonly collections?: readonly AlertCollection[];
  readonly rules?: readonly AlertRule[];
  readonly actionError?: Error;
} = {}): AlertConfigurationApi & {
  readonly collectionCreations: CreateAlertCollectionInput[];
  readonly ruleCreations: CreateAlertRuleInput[];
  readonly collectionToggles: Array<{ readonly collectionId: string; readonly enabled: boolean }>;
  readonly ruleToggles: Array<{ readonly ruleId: string; readonly enabled: boolean }>;
} {
  let collections = [...(options.collections ?? [])];
  let rules = [...(options.rules ?? [])];
  const collectionCreations: CreateAlertCollectionInput[] = [];
  const ruleCreations: CreateAlertRuleInput[] = [];
  const collectionToggles: Array<{ readonly collectionId: string; readonly enabled: boolean }> = [];
  const ruleToggles: Array<{ readonly ruleId: string; readonly enabled: boolean }> = [];

  function maybeThrow() {
    if (options.actionError !== undefined) {
      throw options.actionError;
    }
  }

  return {
    collectionCreations,
    ruleCreations,
    collectionToggles,
    ruleToggles,
    async listCollections() {
      return collections;
    },
    async listRules() {
      return rules;
    },
    async createCollection(input: CreateAlertCollectionInput) {
      maybeThrow();
      collectionCreations.push(input);
      const collection = createCollection({
        id: "collection_" + String(collections.length + 1),
        name: input.name,
        enabled: input.enabled ?? true
      });
      collections = [...collections, collection];
      return collection;
    },
    async createRule(input: CreateAlertRuleInput) {
      maybeThrow();
      ruleCreations.push(input);
      const rule = createRule({
        id: "rule_" + String(rules.length + 1),
        name: input.name,
        eventType: input.eventType,
        enabled: input.enabled,
        collectionIds: input.collectionIds,
        variants: input.variants.map((variant, index) => ({
          id: "variant_" + String(index + 1),
          name: variant.name,
          enabled: variant.enabled
        })),
        priority: input.priority
      });
      rules = [...rules, rule];
      return rule;
    },
    async setCollectionEnabled(collectionId: string, enabled: boolean) {
      collectionToggles.push({ collectionId, enabled });
      maybeThrow();
      collections = collections.map((collection) =>
        collection.id === collectionId ? { ...collection, enabled } : collection
      );
      return createCollection({ id: collectionId, enabled });
    },
    async setRuleEnabled(ruleId: string, enabled: boolean) {
      ruleToggles.push({ ruleId, enabled });
      maybeThrow();
      rules = rules.map((rule) => (rule.id === ruleId ? { ...rule, enabled } : rule));
      return createRule({ id: ruleId, enabled });
    }
  };
}
