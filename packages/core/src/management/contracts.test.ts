import { describe, expect, it } from "vitest";
import * as core from "../index.js";

interface RuntimeSchema {
  parse(input: unknown): unknown;
  safeParse(input: unknown): { readonly success: boolean };
}

function schema(name: string): RuntimeSchema {
  const value = (core as Record<string, unknown>)[name];
  expect(value, `${name} must be exported by @stream-jams/core`).toBeDefined();
  return value as RuntimeSchema;
}

function exportedFunction(name: string): (...args: never[]) => unknown {
  const value = (core as Record<string, unknown>)[name];
  expect(value, `${name} must be exported by @stream-jams/core`).toBeTypeOf("function");
  return value as (...args: never[]) => unknown;
}

const actionableError = {
  summary: "Twitch validation failed",
  cause: "OAuth token expired",
  nextStep: "Reconnect Twitch",
  severity: "error",
  occurredAt: "2026-07-15T05:00:00.000Z",
  referenceId: "ref-provider-1",
  correction: {
    label: "Reconnect Twitch",
    route: "/manage/event-sources/provider-twitch"
  }
} as const;

const validationIssue = {
  id: "issue-1",
  severity: "warning",
  code: "text-may-overflow",
  message: "Follower name may overflow",
  nextStep: "Review the landscape text layer",
  targetProfileId: "landscape",
  providerKind: "twitch",
  eventType: "follow",
  alertId: "alert-follow",
  referenceId: null
} as const;

const alertSet = {
  id: "set-default",
  name: "Default",
  active: true,
  starter: true,
  starterReviewState: "pending",
  enabledAlertCount: 1,
  targetProfiles: [
    {
      id: "landscape",
      enabled: true,
      reviewState: "ready",
      blockerCount: 0,
      warningCount: 1
    },
    {
      id: "vertical",
      enabled: false,
      reviewState: "needs-review",
      blockerCount: 0,
      warningCount: 0
    }
  ],
  validationIssues: [validationIssue],
  outputs: [
    {
      targetProfileId: "landscape",
      purpose: "live",
      connectionState: "connected",
      lastConnectedAt: "2026-07-15T05:00:00.000Z",
      copyableUrlStatus: "available"
    }
  ]
} as const;

describe("management target and provider contracts", () => {
  it("accepts only the two fixed MVP target profiles", () => {
    const profile = schema("targetProfileDefinitionSchema");

    expect(profile.parse({ id: "landscape", label: "Landscape 16:9", width: 1920, height: 1080 })).toEqual({
      id: "landscape",
      label: "Landscape 16:9",
      width: 1920,
      height: 1080
    });
    expect(profile.safeParse({ id: "vertical", label: "Vertical 9:16", width: 1080, height: 1920 }).success).toBe(true);
    expect(profile.safeParse({ id: "custom", label: "Square", width: 1080, height: 1080 }).success).toBe(false);
  });

  it("keeps registered provider identity separate from provider kind", () => {
    const provider = schema("registeredProviderViewSchema");
    const first = provider.parse({
      id: "provider-twitch-main",
      name: "Main Twitch",
      kind: "twitch",
      capability: "event-source",
      active: true,
      connectionState: "connected",
      intakeState: "active",
      validatedAt: "2026-07-15T05:00:00.000Z",
      error: null,
      usedByAlertCount: 4
    });
    const second = provider.parse({
      id: "provider-twitch-alt",
      name: "Alt Twitch",
      kind: "twitch",
      capability: "event-source",
      active: false,
      connectionState: "disconnected",
      intakeState: "inactive",
      validatedAt: null,
      error: actionableError,
      usedByAlertCount: 0
    });

    expect(first).toMatchObject({ id: "provider-twitch-main", kind: "twitch", active: true });
    expect(second).toMatchObject({ id: "provider-twitch-alt", kind: "twitch", active: false });
  });
});

describe("management alert contracts and rules", () => {
  it("validates a focused editor document with both target-profile layouts", () => {
    const editorDocument = schema("alertEditorDocumentSchema");
    const document = {
      id: "alert-follow",
      setId: "set-default",
      providerKind: "twitch",
      eventType: "follow",
      kind: "default",
      parentAlertId: null,
      name: "New follower",
      enabled: true,
      conditions: [],
      durationMs: 5000,
      layers: [
        {
          id: "layer-text",
          name: "Follower name",
          type: "text",
          visible: true,
          order: 0,
          template: "{userName}",
          animation: {
            mode: "preset",
            entrance: "fade",
            exit: "fade",
            durationMs: 300,
            delayMs: 0,
            easing: "ease-out"
          }
        }
      ],
      targetProfiles: [
        {
          id: "landscape",
          enabled: true,
          reviewState: "ready",
          layerLayouts: [{ layerId: "layer-text", x: 710, y: 420, width: 500, height: 120, zIndex: 1 }]
        },
        {
          id: "vertical",
          enabled: false,
          reviewState: "needs-review",
          layerLayouts: [{ layerId: "layer-text", x: 290, y: 800, width: 500, height: 120, zIndex: 1 }]
        }
      ],
      samplePayloads: [
        {
          id: "sample-normal",
          label: "Normal follower",
          kind: "built-in",
          payload: { userName: "jamsethoth" }
        }
      ]
    } as const;

    expect(editorDocument.parse(document)).toEqual(document);
    expect(editorDocument.safeParse({ ...document, targetProfiles: [document.targetProfiles[0]] }).success).toBe(false);
    expect(
      editorDocument.safeParse({ ...document, targetProfiles: [document.targetProfiles[0], document.targetProfiles[0]] }).success
    ).toBe(false);
  });

  it("permits activation with warnings but blocks invalid enabled profiles", () => {
    const evaluate = exportedFunction("evaluateAlertSetActivation");

    expect(evaluate(alertSet as never)).toEqual({
      allowed: true,
      requiresConfirmation: true,
      blockerIds: [],
      warningIds: ["issue-1"]
    });

    const blocked = {
      ...alertSet,
      targetProfiles: alertSet.targetProfiles.map((profile) =>
        profile.id === "landscape" ? { ...profile, blockerCount: 1 } : profile
      ),
      validationIssues: [{ ...validationIssue, id: "issue-blocker", severity: "blocker" }]
    };

    expect(evaluate(blocked as never)).toEqual({
      allowed: false,
      requiresConfirmation: false,
      blockerIds: ["issue-blocker"],
      warningIds: []
    });
  });
});

describe("management asset diagnostics home and backup contracts", () => {
  it("normalizes freeform asset tags case-insensitively", () => {
    const normalize = exportedFunction("normalizeAssetTags");

    expect(normalize([" Seasonal ", "ALERT", "seasonal", "", "Alert"] as never)).toEqual(["seasonal", "alert"]);
  });

  it("validates asset usage and the setup Home summary", () => {
    const assetUsage = schema("assetUsageSummarySchema");
    const home = schema("homeSetupSummarySchema");

    expect(
      assetUsage.safeParse({
        assetId: "asset-1",
        totalUsageCount: 1,
        usages: [
          {
            setId: "set-default",
            setName: "Default",
            eventType: "follow",
            alertId: "alert-follow",
            alertName: "New follower",
            targetProfileIds: ["landscape"]
          }
        ]
      }).success
    ).toBe(true);

    expect(
      home.safeParse({
        readiness: [
          {
            id: "event-sources",
            label: "Connect an event source",
            state: "action-required",
            actionLabel: "Set up Twitch",
            actionRoute: "/manage/event-sources/new"
          }
        ],
        activeAlertSet: alertSet,
        actionableProblems: [actionableError]
      }).success
    ).toBe(true);
  });

  it("validates diagnostics evidence and secret-free backup summaries", () => {
    const diagnostics = schema("diagnosticsWorkspaceViewSchema");
    const backup = schema("configurationBackupSummarySchema");

    expect(
      diagnostics.safeParse({
        problems: [actionableError],
        events: [
          {
            id: "event-1",
            providerId: "provider-twitch-main",
            providerKind: "twitch",
            eventType: "follow",
            occurredAt: "2026-07-15T05:00:00.000Z",
            outcome: "processed",
            test: false,
            referenceId: "ref-event-1",
            alertIds: ["alert-follow"]
          }
        ],
        rawLogs: [
          {
            id: "log-1",
            timestamp: "2026-07-15T05:00:00.000Z",
            level: "ERROR",
            component: "twitch",
            event: "provider.validation.failed",
            referenceId: "ref-provider-1",
            data: { token: "[REDACTED]" }
          }
        ]
      }).success
    ).toBe(true);

    expect(
      backup.safeParse({
        state: "ready",
        appVersion: "0.0.0",
        schemaVersion: 4,
        configurationRecordCount: 12,
        assetCount: 3,
        totalAssetBytes: 2048,
        secretExclusions: ["Provider credentials", "Overlay route keys"],
        blockers: []
      }).success
    ).toBe(true);
  });
});
