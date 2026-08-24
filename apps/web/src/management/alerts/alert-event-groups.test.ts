import {
  alertStarterTemplates,
  type AlertInventoryRow,
  type AlertValidationIssue
} from "@stream-jams/core";
import { describe, expect, it } from "vitest";
import {
  buildAlertEventGroups,
  filterAlertEventGroups,
  summarizeAlertInventoryRow
} from "./alert-event-groups.js";

describe("buildAlertEventGroups", () => {
  it("keeps canonical order, multiple defaults, attached variations, and empty events", () => {
    const rows = [
      row("follow-one", "follow", "First follow"),
      row("follow-vip", "follow", "VIP follow", { kind: "variation", parentAlertId: "follow-one" }),
      row("follow-two", "follow", "Second follow"),
      row("raid-one", "raid", "Raid")
    ];

    const groups = buildAlertEventGroups(rows, []);

    expect(groups.map(({ eventType }) => eventType)).toEqual(alertStarterTemplates.map(({ eventType }) => eventType));
    expect(groups).toHaveLength(alertStarterTemplates.length);
    expect(groups[0]).toMatchObject({
      eventType: "follow",
      label: "Follow",
      catalogGroup: "Core",
      known: true,
      defaultCount: 2,
      variationCount: 1,
      enabledCount: 3,
      status: "valid"
    });
    expect(groups[0]?.defaults.map(({ alert }) => alert.id)).toEqual(["follow-one", "follow-two"]);
    expect(groups[0]?.defaults[0]?.variations.map(({ id }) => id)).toEqual(["follow-vip"]);
    expect(groups.find(({ eventType }) => eventType === "subscription")).toMatchObject({
      defaults: [],
      orphanVariations: [],
      defaultCount: 0,
      variationCount: 0,
      enabledCount: 0,
      status: "valid"
    });
  });

  it("appends unknown events under Other and visibly retains orphan variations", () => {
    const groups = buildAlertEventGroups([
      row("future-default", "future_provider_event", "Future default"),
      row("future-child", "future_provider_event", "Future child", { kind: "variation", parentAlertId: "future-default" }),
      row("orphan", "follow", "Lost variation", { kind: "variation", parentAlertId: "missing-default" })
    ], []);

    expect(groups.at(-1)).toMatchObject({
      key: "event:future_provider_event",
      eventType: "future_provider_event",
      label: "future_provider_event",
      catalogGroup: "Other",
      known: false,
      defaultCount: 1,
      variationCount: 1
    });
    expect(groups.at(-1)?.defaults[0]?.variations.map(({ id }) => id)).toEqual(["future-child"]);
    expect(groups[0]?.orphanVariations.map(({ id }) => id)).toEqual(["orphan"]);
  });

  it("uses alert and event issues but excludes set-wide issues from worst status", () => {
    const rows = [
      row("follow-default", "follow", "Follow", { reviewState: "needs-review" }),
      row("follow-warning", "follow", "Warning child", { kind: "variation", parentAlertId: "follow-default" }),
      row("raid-default", "raid", "Raid")
    ];
    const issues = [
      issue("set-blocker", "blocker"),
      issue("follow-warning", "warning", { alertId: "follow-warning" }),
      issue("raid-blocker", "blocker", { eventType: "raid" })
    ];

    const groups = buildAlertEventGroups(rows, issues);

    expect(groups.find(({ eventType }) => eventType === "follow")?.status).toBe("warning");
    expect(groups.find(({ eventType }) => eventType === "raid")?.status).toBe("blocker");
    expect(groups.find(({ eventType }) => eventType === "subscription")?.status).toBe("valid");
  });

  it("reuses saved condition and priority data without calculating a probability", () => {
    const defaultAlert = row("cheer-default", "cheer", "Cheer");
    const high = row("cheer-high", "cheer", "High cheer", {
      kind: "variation",
      parentAlertId: defaultAlert.id,
      conditions: [{ field: "cheerAmount", operator: "min", value: 500 }],
      weight: 4,
      priority: 10
    });
    const peer = row("cheer-peer", "cheer", "Peer cheer", {
      kind: "variation",
      parentAlertId: defaultAlert.id,
      weight: 2,
      priority: 10
    });
    const low = row("cheer-low", "cheer", "Low cheer", {
      kind: "variation",
      parentAlertId: defaultAlert.id,
      priority: 1
    });

    expect(summarizeAlertInventoryRow(high, [high, peer, low], true)).toEqual({
      conditionSummaries: ["Cheer amount is at least 500"],
      prioritySummary: "Priority group 1 of 2",
      weightSummary: "Relative weight 4; the selected sample's result depends on eligible alerts."
    });
    expect(summarizeAlertInventoryRow(
      row("unknown", "future_provider_event", "Unknown", {
        conditions: [{ field: "future.value", operator: "equals", value: "x" }]
      }),
      [],
      false
    ).conditionSummaries).toEqual(["Saved condition: future.value equals x"]);
  });
});

describe("filterAlertEventGroups", () => {
  const defaultAlert = row("raid-default", "raid", "Raid welcome", { targetProfileIds: ["landscape"] });
  const large = row("raid-large", "raid", "Large community", {
    kind: "variation",
    parentAlertId: defaultAlert.id,
    reviewState: "needs-review",
    targetProfileIds: ["vertical"]
  });
  const small = row("raid-small", "raid", "Small crew", {
    kind: "variation",
    parentAlertId: defaultAlert.id,
    targetProfileIds: ["landscape"]
  });
  const groups = buildAlertEventGroups([
    row("follow-default", "follow", "Friendly hello"),
    defaultAlert,
    large,
    small
  ], [issue("large-warning", "warning", { alertId: large.id })]);

  it("keeps owning defaults and only matching variations when a variation matches", () => {
    const result = filterAlertEventGroups(groups, { query: "Large community" });

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]).toMatchObject({
      eventType: "raid",
      matchingDefaultCount: 0,
      matchingVariationCount: 1,
      defaultCount: 1,
      variationCount: 2
    });
    expect(result.groups[0]?.defaults[0]?.alert.id).toBe("raid-default");
    expect(result.groups[0]?.defaults[0]?.variations.map(({ id }) => id)).toEqual(["raid-large"]);
    expect(result.forcedOpenKeys).toEqual(new Set(["event:raid"]));
  });

  it("shows a matching default with its children and an event-label match with all rows", () => {
    const defaultResult = filterAlertEventGroups(groups, { query: "Raid welcome" });
    const eventResult = filterAlertEventGroups(groups, { query: "Raid" });

    expect(defaultResult.groups[0]?.defaults[0]?.variations).toHaveLength(2);
    expect(defaultResult.groups[0]).toMatchObject({ matchingDefaultCount: 1, matchingVariationCount: 0 });
    expect(eventResult.groups[0]).toMatchObject({ matchingDefaultCount: 1, matchingVariationCount: 2 });
  });

  it("preserves ancestry for status and profile filters and combines filters", () => {
    const result = filterAlertEventGroups(groups, {
      status: "warning",
      profileId: "vertical",
      query: "large"
    });

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]?.defaults[0]?.alert.id).toBe("raid-default");
    expect(result.groups[0]?.defaults[0]?.variations.map(({ id }) => id)).toEqual(["raid-large"]);
    expect(result.matchingAlertCount).toBe(1);
    expect(result.totalAlertCount).toBe(4);
  });

  it("reports no matches and keeps forced expansion separate from manual state", () => {
    const result = filterAlertEventGroups(groups, { query: "does-not-exist" });
    const unfiltered = filterAlertEventGroups(groups, {});

    expect(result.groups).toEqual([]);
    expect(result.matchingAlertCount).toBe(0);
    expect(result.forcedOpenKeys).toEqual(new Set());
    expect(result.hasActiveFilters).toBe(true);
    expect(unfiltered.forcedOpenKeys).toEqual(new Set());
    expect(unfiltered.hasActiveFilters).toBe(false);
    expect(unfiltered.groups).toHaveLength(alertStarterTemplates.length);
  });
});

function row(
  id: string,
  eventType: string,
  name: string,
  overrides: Partial<AlertInventoryRow> = {}
): AlertInventoryRow {
  return {
    id,
    parentAlertId: null,
    setId: "set-default",
    providerKind: "twitch",
    eventType,
    name,
    kind: "default",
    enabled: true,
    conditions: [],
    weight: 1,
    priority: null,
    reviewState: "ready",
    targetProfileIds: ["landscape"],
    previewText: `${name} preview`,
    ...overrides
  };
}

function issue(
  id: string,
  severity: "blocker" | "warning",
  overrides: Partial<AlertValidationIssue> = {}
): AlertValidationIssue {
  return {
    id,
    severity,
    code: id.toUpperCase(),
    message: id,
    nextStep: "Review the affected alert.",
    targetProfileId: null,
    providerKind: null,
    eventType: null,
    alertId: null,
    referenceId: null,
    ...overrides
  };
}
