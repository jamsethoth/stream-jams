import { describe, expect, it } from "vitest";
import {
  alertCreateInputSchema,
  alertSetActivationImpactSchema,
  alertBrowserSourceViewSchema,
  alertSetDetailSchema,
  alertSetMutationInputSchema,
  alertSetOverviewSchema
} from "./contracts.js";

const overview = {
  id: "set-default",
  name: "Default",
  active: true,
  starter: true,
  starterReviewState: "pending",
  enabledAlertCount: 0,
  targetProfiles: [
    { id: "landscape", enabled: true, reviewState: "ready", blockerCount: 1, warningCount: 0 },
    { id: "vertical", enabled: false, reviewState: "needs-review", blockerCount: 0, warningCount: 1 }
  ],
  validationIssues: [
    {
      id: "issue-no-enabled-alerts",
      severity: "blocker",
      code: "NO_ENABLED_ALERTS",
      message: "Enable at least one valid alert.",
      nextStep: "Review a starter alert and enable it.",
      targetProfileId: "landscape",
      providerKind: null,
      eventType: null,
      alertId: null,
      referenceId: null
    }
  ],
  outputs: [
    {
      targetProfileId: "landscape",
      purpose: "live",
      connectionState: "never-connected",
      lastConnectedAt: null,
      copyableUrlStatus: "create-required"
    }
  ]
} as const;

describe("alert set management contracts", () => {
  it("parses a selected set with inventory previews and profile-scoped browser sources", () => {
    const parsed = alertSetDetailSchema.parse({
      overview,
      inventory: [
        {
          id: "alert-follow",
          setId: "set-default",
          providerKind: "twitch",
          eventType: "follow",
          name: "New follower",
          kind: "default",
          enabled: false,
          reviewState: "needs-review",
          targetProfileIds: ["landscape", "vertical"],
          previewText: "Thanks {actor.displayName}!"
        }
      ],
      browserSources: [
        {
          id: "module:alerts:landscape:live",
          targetProfileId: "landscape",
          purpose: "live",
          connectionState: "never-connected",
          lastConnectedAt: null,
          keyId: null,
          url: null,
          copyableUrlStatus: "create-required"
        }
      ]
    });

    expect(parsed.inventory[0]?.previewText).toBe("Thanks {actor.displayName}!");
    expect(parsed.browserSources[0]?.targetProfileId).toBe("landscape");
  });

  it("rejects separate test-purpose browser sources from alert management", () => {
    expect(alertBrowserSourceViewSchema.safeParse({
      id: "module:alerts:landscape:test",
      targetProfileId: "landscape",
      purpose: "test",
      connectionState: "never-connected",
      lastConnectedAt: null,
      keyId: null,
      url: null,
      copyableUrlStatus: "create-required"
    }).success).toBe(false);
  });

  it("parses activation impact separately from saved set state", () => {
    expect(
      alertSetActivationImpactSchema.parse({
        currentActiveSetId: "set-default",
        replacingActiveSetName: "Default",
        enabledAlertCount: 4,
        affectedTargetProfileIds: ["landscape"],
        affectedEventTypes: ["follow", "raid"],
        blockers: [],
        warnings: overview.validationIssues.map((issue) => ({ ...issue, severity: "warning" }))
      }).warnings
    ).toHaveLength(1);
  });

  it("requires a non-empty set name for create and rename commands", () => {
    expect(alertSetMutationInputSchema.parse({ name: "  Seasonal  " }).name).toBe("Seasonal");
    expect(() => alertSetMutationInputSchema.parse({ name: "   " })).toThrow();
  });

  it("accepts canonical event types for alert creation and trims the alert name", () => {
    expect(alertCreateInputSchema.parse({ eventType: "cheer", name: "  New cheer  " })).toEqual({
      eventType: "cheer",
      name: "New cheer"
    });
    expect(alertCreateInputSchema.safeParse({ eventType: "twitch.raid", name: "Raid" }).success).toBe(false);
  });

  it("retains the original overview validation behavior", () => {
    expect(alertSetOverviewSchema.parse(overview).active).toBe(true);
  });
});
