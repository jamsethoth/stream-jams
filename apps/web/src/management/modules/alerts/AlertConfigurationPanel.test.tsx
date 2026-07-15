import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AlertConfigurationPanel, type AlertConfigurationApi } from "./AlertConfigurationPanel.js";
import type { AssetApi, AssetRecord } from "../../assets/asset-api.js";
import type {
  AlertCollection,
  AlertRule,
  CreateAlertCollectionInput,
  CreateAlertRuleInput,
  UpdateAlertRuleInput,
  AlertTestEventInput
} from "./alert-api.js";

describe("AlertConfigurationPanel", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders loaded alert collections and rules", async () => {
    render(
      <AlertConfigurationPanel
        alertApi={createAlertApi({ collections: [createCollection()], rules: [createRule()] })}
        assetApi={createAssetApi()}
      />
    );

    expect(await screen.findByRole("cell", { name: "Main Alerts" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Follow Alert" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "follow" })).toBeInTheDocument();
  });

  it("shows empty states when no alert configuration exists", async () => {
    render(<AlertConfigurationPanel alertApi={createAlertApi()} assetApi={createAssetApi()} />);

    expect(await screen.findByText("No alert collections configured.")).toBeInTheDocument();
    expect(screen.getByText("No alert rules configured.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create alert rule" })).toBeDisabled();
  });

  it("creates a collection and default alert rule from the browser form", async () => {
    const user = userEvent.setup();
    const api = createAlertApi();
    render(<AlertConfigurationPanel alertApi={api} assetApi={createAssetApi()} />);

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
    render(<AlertConfigurationPanel alertApi={api} assetApi={createAssetApi()} />);

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
    render(<AlertConfigurationPanel alertApi={api} assetApi={createAssetApi()} />);

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
    render(<AlertConfigurationPanel alertApi={api} assetApi={createAssetApi()} />);

    const row = (await screen.findByRole("cell", { name: "Follow Alert" })).closest("tr");
    if (row === null) {
      throw new Error("Missing rule row");
    }

    await user.click(within(row).getByRole("checkbox", { name: "Enabled" }));

    expect(await screen.findByText("Alert rule unavailable")).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Follow Alert" })).toBeInTheDocument();
  });

  it("saves full rule drafts with minimal conditions, filtered assets, layout, and static preview", async () => {
    const user = userEvent.setup();
    const api = createAlertApi({
      collections: [createCollection()],
      rules: [createRule({ eventType: "cheer" })]
    });
    render(
      <AlertConfigurationPanel
        alertApi={api}
        assetApi={createAssetApi([
          createAsset({ id: "asset_image", originalFileName: "celebration.gif", mediaType: "gif" }),
          createAsset({ id: "asset_audio", originalFileName: "sting.mp3", mediaType: "audio" })
        ])}
      />
    );

    expect(await screen.findByLabelText("Static layout preview")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add condition" }));
    await user.clear(screen.getByLabelText("Condition 1 value"));
    await user.type(screen.getByLabelText("Condition 1 value"), "500");
    await user.selectOptions(screen.getByLabelText("Visual asset"), "asset_image");
    await user.selectOptions(screen.getByLabelText("Audio asset"), "asset_audio");
    await user.clear(screen.getByLabelText("x"));
    await user.type(screen.getByLabelText("x"), "120");
    await user.click(screen.getByRole("button", { name: "Save rule" }));

    await waitFor(() => expect(api.ruleUpdates).toHaveLength(1));
    expect(api.ruleUpdates[0]).toMatchObject({
      ruleId: "rule_1",
      input: {
        conditions: [{ field: "amount", operator: "equals", value: 500 }],
        variants: [
          expect.objectContaining({
            visualAssetId: "asset_image",
            audioAssetId: "asset_audio",
            layout: expect.objectContaining({ x: 120 })
          })
        ]
      }
    });
  });

  it("confirms hard deletes with impact summaries before calling delete APIs", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(globalThis, "confirm").mockReturnValue(true);
    const api = createAlertApi({
      collections: [createCollection()],
      rules: [createRule()]
    });
    render(<AlertConfigurationPanel alertApi={api} assetApi={createAssetApi()} />);

    await user.click(await screen.findByRole("button", { name: "Delete rule" }));

    await waitFor(() => expect(api.ruleDeletes).toEqual(["rule_1"]));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("deletes 0 conditions and 1 variants"));
  });

  it("runs saved rule test alerts as local sample data", async () => {
    const user = userEvent.setup();
    const api = createAlertApi({
      collections: [createCollection()],
      rules: [createRule({ eventType: "cheer" })]
    });
    render(<AlertConfigurationPanel alertApi={api} assetApi={createAssetApi()} />);

    await user.click(await screen.findByRole("button", { name: "Run saved test alert" }));

    await waitFor(() => expect(api.testEvents).toHaveLength(1));
    expect(api.testEvents[0]).toMatchObject({
      providerId: "twitch",
      type: "cheer",
      metadata: {
        sample: true,
        ruleId: "rule_1",
        generatedBy: "management-rule-editor"
      }
    });
    expect(await screen.findByText("Test alert queued from local sample data.")).toBeInTheDocument();
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
    conditions: [],
    variants: [
      {
        id: "variant_1",
        name: "Default",
        enabled: true,
        weight: 1,
        visualAssetId: null,
        audioAssetId: null,
        textTemplate: "Thanks {actor.displayName}!",
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
  readonly ruleUpdates: Array<{ readonly ruleId: string; readonly input: UpdateAlertRuleInput }>;
  readonly ruleDeletes: string[];
  readonly testEvents: AlertTestEventInput[];
  readonly collectionToggles: Array<{ readonly collectionId: string; readonly enabled: boolean }>;
  readonly ruleToggles: Array<{ readonly ruleId: string; readonly enabled: boolean }>;
} {
  let collections = [...(options.collections ?? [])];
  let rules = [...(options.rules ?? [])];
  const collectionCreations: CreateAlertCollectionInput[] = [];
  const ruleCreations: CreateAlertRuleInput[] = [];
  const ruleUpdates: Array<{ readonly ruleId: string; readonly input: UpdateAlertRuleInput }> = [];
  const ruleDeletes: string[] = [];
  const testEvents: AlertTestEventInput[] = [];
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
    ruleUpdates,
    ruleDeletes,
    testEvents,
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
    async updateCollection(collectionId: string, input) {
      maybeThrow();
      const collection = createCollection({ id: collectionId, ...input });
      collections = collections.map((candidate) => (candidate.id === collectionId ? collection : candidate));
      return collection;
    },
    async deleteCollection(collectionId: string) {
      maybeThrow();
      collections = collections.filter((collection) => collection.id !== collectionId);
      rules = rules.map((rule) => ({
        ...rule,
        collectionIds: rule.collectionIds.filter((candidate) => candidate !== collectionId)
      }));
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
        conditions: input.conditions,
        variants: input.variants.map((variant, index) => ({
          id: "variant_" + String(index + 1),
          ...variant
        })),
        cooldownSeconds: input.cooldownSeconds,
        priority: input.priority
      });
      rules = [...rules, rule];
      return rule;
    },
    async updateRule(ruleId: string, input: UpdateAlertRuleInput) {
      maybeThrow();
      ruleUpdates.push({ ruleId, input });
      const rule = createRule({ id: ruleId, ...input });
      rules = rules.map((candidate) => (candidate.id === ruleId ? rule : candidate));
      return rule;
    },
    async deleteRule(ruleId: string) {
      maybeThrow();
      ruleDeletes.push(ruleId);
      rules = rules.filter((rule) => rule.id !== ruleId);
    },
    async deleteVariant(ruleId: string, variantId: string) {
      maybeThrow();
      const rule = rules.find((candidate) => candidate.id === ruleId);
      if (rule === undefined) {
        throw new Error("Rule missing");
      }
      const updated = createRule({
        ...rule,
        variants: rule.variants.filter((variant) => variant.id !== variantId)
      });
      rules = rules.map((candidate) => (candidate.id === ruleId ? updated : candidate));
      return updated;
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
    },
    async testAlert(input: AlertTestEventInput) {
      maybeThrow();
      testEvents.push(input);
      return {
        status: "queued",
        matchedRuleIds: ["rule_1"],
        enqueuedAlertIds: ["resolved_alert_1"]
      };
    }
  };
}

function createAsset(overrides: Partial<AssetRecord> = {}): AssetRecord {
  return {
    id: "asset_1",
    originalFileName: "celebration.png",
    mediaType: "image",
    mimeType: "image/png",
    sizeBytes: 1024,
    checksum: "sha256:asset",
    storagePath: "image/asset_1.png",
    ...overrides
  };
}

function createAssetApi(assets: readonly AssetRecord[] = []): AssetApi {
  return {
    async listAssets() {
      return assets;
    },
    async importAsset() {
      throw new Error("not called");
    },
    async getAssetFile() {
      throw new Error("not called");
    },
    async replaceAsset() {
      throw new Error("not called");
    }
  };
}
