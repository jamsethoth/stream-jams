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

  it("represents transient event-source live status separately from registration state", () => {
    const liveStatus = schema("providerLiveStatusSchema");
    const provider = schema("registeredProviderViewSchema");

    expect(liveStatus.safeParse("healthy").success).toBe(true);
    expect(liveStatus.safeParse("not-running").success).toBe(true);
    expect(liveStatus.safeParse("connected").success).toBe(false);
    expect(provider.parse({
      id: "provider-streamerbot-main",
      name: "Main Streamer.bot",
      kind: "streamerbot",
      capability: "event-source",
      active: true,
      connectionState: "connected",
      intakeState: "active",
      liveStatus: "healthy",
      validatedAt: "2026-07-15T05:00:00.000Z",
      error: null,
      usedByAlertCount: 4
    })).toMatchObject({ liveStatus: "healthy" });
  });
});

describe("management alert contracts and rules", () => {
  it("uses stable default and variation editor identities in alert inventory", () => {
    const inventoryRow = schema("alertInventoryRowSchema");

    expect(
      inventoryRow.parse({
        id: "rule-follow",
        setId: "set-default",
        providerKind: "twitch",
        eventType: "follow",
        name: "New follower",
        kind: "default",
        enabled: true,
        reviewState: "ready",
        targetProfileIds: ["landscape"],
        previewText: "Thanks for following!"
      })
    ).toMatchObject({ id: "rule-follow", kind: "default", parentAlertId: null });

    expect(
      inventoryRow.parse({
        id: "variant-vip-follow",
        parentAlertId: "rule-follow",
        setId: "set-default",
        providerKind: "twitch",
        eventType: "follow",
        name: "VIP follower",
        kind: "variation",
        enabled: false,
        reviewState: "needs-review",
        targetProfileIds: ["landscape", "vertical"],
        previewText: "Welcome back!"
      })
    ).toMatchObject({ id: "variant-vip-follow", kind: "variation", parentAlertId: "rule-follow" });
  });

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

    expect(editorDocument.parse(document)).toEqual({
      ...document,
      variantConditions: [],
      weight: 1,
      priority: null,
      cooldownSeconds: 0,
      rulePriority: 0
    });
    expect(
      editorDocument.parse({
        ...document,
        variantConditions: [{ field: "payload.viewerCount", operator: "min", value: 25 }],
        weight: 3,
        priority: 20,
        cooldownSeconds: 15,
        rulePriority: 10
      })
    ).toMatchObject({
      variantConditions: [{ field: "payload.viewerCount", operator: "min", value: 25 }],
      weight: 3,
      priority: 20,
      cooldownSeconds: 15,
      rulePriority: 10
    });
    expect(editorDocument.safeParse({ ...document, targetProfiles: [document.targetProfiles[0]] }).success).toBe(false);
    expect(
      editorDocument.safeParse({ ...document, targetProfiles: [document.targetProfiles[0], document.targetProfiles[0]] }).success
    ).toBe(false);

    const saveInput = schema("alertEditorSaveInputSchema");
    expect(saveInput.parse({ document })).toEqual({
      document: editorDocument.parse(document),
      confirmLiveImpact: false
    });
    expect(saveInput.parse({ document, confirmLiveImpact: true })).toEqual({
      document: editorDocument.parse(document),
      confirmLiveImpact: true
    });

    const affectedProfiles = exportedFunction("getAlertEditorAffectedProfileIds");
    const liveEdit = {
      ...document,
      layers: document.layers.map((layer) => ({ ...layer, template: "Welcome, {userName}!" }))
    };
    expect(affectedProfiles(document as never, liveEdit as never)).toEqual(["landscape"]);
    const disabledProfileEdit = {
      ...document,
      targetProfiles: document.targetProfiles.map((profile) =>
        profile.id === "vertical"
          ? { ...profile, layerLayouts: profile.layerLayouts.map((layout) => ({ ...layout, x: layout.x + 20 })) }
          : profile
      )
    };
    expect(affectedProfiles(document as never, disabledProfileEdit as never)).toEqual([]);

    const testRequest = schema("alertEditorTestRequestSchema");
    const request = {
      document,
      targetProfileId: "landscape",
      samplePayload: { userName: "jamsethoth" },
      includeAudio: false,
      includeTts: false
    } as const;
    expect(testRequest.parse(request)).toEqual({ ...request, document: editorDocument.parse(document) });
    expect(testRequest.safeParse({ ...request, targetProfileId: "square" }).success).toBe(false);

    const testResult = schema("alertEditorTestResultSchema");
    expect(
      testResult.parse({
        status: "queued",
        targetProfileId: "landscape",
        referenceId: "test-alert-follow-1",
        test: true
      })
    ).toEqual({
      status: "queued",
      targetProfileId: "landscape",
      referenceId: "test-alert-follow-1",
      test: true
    });
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

  it("normalizes asset metadata updates and validates destructive change impact", () => {
    const metadata = schema("assetMetadataUpdateInputSchema");
    const impact = schema("assetChangeImpactSchema");

    expect(metadata.parse({ displayName: "Seasonal follow", tags: [" Seasonal ", "FOLLOW", "seasonal"] })).toEqual({
      displayName: "Seasonal follow",
      tags: ["seasonal", "follow"]
    });
    expect(
      impact.safeParse({
        assetId: "asset-1",
        usage: { assetId: "asset-1", totalUsageCount: 0, usages: [] },
        canDelete: true,
        requiresConfirmation: false,
        warnings: []
      }).success
    ).toBe(true);
  });

  it("validates diagnostics evidence and secret-free backup summaries", () => {
    const diagnostics = schema("diagnosticsWorkspaceViewSchema");
    const backup = schema("configurationBackupSummarySchema");

    expect(
      diagnostics.safeParse({
        problems: [
          {
            id: "problem-provider-1",
            area: "providers",
            ...actionableError
          }
        ],
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
            processingId: "processing-event-1",
            actorDisplayName: "Viewer",
            alertIds: ["alert-follow"],
            matchedRuleIds: ["rule-follow"],
            playbackStatus: "completed",
            errorMessage: null,
            sanitizedPayload: { actor: "Viewer", token: "[REDACTED]" },
            correction: { label: "Open alert", route: "/modules/alerts/editor/alert-follow?diagnostic=ref-event-1" }
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
            processingId: null,
            message: "Provider validation failed.",
            data: { token: "[REDACTED]" },
            correction: { label: "Open event sources", route: "/event-sources?diagnostic=ref-provider-1" }
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
        dataDirectory: "C:/Users/James/.stream-jams/data",
        assetDirectory: "C:/Users/James/.stream-jams/assets",
        logLevel: "INFO",
        logRetentionHours: 48,
        secretExclusions: ["Provider credentials", "Overlay route keys"],
        blockers: []
      }).success
    ).toBe(true);
  });

  it("validates complete backup archives and rejects secret-bearing fields", () => {
    const archiveSchema = schema("configurationBackupArchiveSchema");
    const archive = {
      manifest: {
        format: "stream-jams-backup",
        archiveVersion: 1,
        appVersion: "0.0.0",
        schemaVersion: 9,
        createdAt: "2026-07-15T05:00:00.000Z",
        configurationChecksum: `sha256:${"a".repeat(64)}`,
        configurationRecordCount: 2,
        assetCount: 1,
        totalAssetBytes: 4
      },
      configuration: {
        appConfig: { server: { host: "127.0.0.1", port: 39187 } },
        tables: { alert_collections: [{ id: "set-default", name: "Everyday", enabled: 1 }] },
        providerReconnectMetadata: [{ id: "provider-twitch", name: "Twitch", kind: "twitch" }],
        overlayOutputs: [{ overlayId: "alerts", scope: "module:alerts:landscape:live", moduleId: "alerts", purpose: "live", targetProfileId: "landscape" }]
      },
      assets: [
        {
          id: "asset-1",
          filename: "follow.png",
          mediaType: "image",
          mimeType: "image/png",
          sizeBytes: 4,
          checksum: `sha256:${"b".repeat(64)}`,
          dataBase64: "iVBORw=="
        }
      ]
    };

    expect(archiveSchema.safeParse(archive).success).toBe(true);
    expect(
      archiveSchema.safeParse({
        ...archive,
        assets: [{ ...archive.assets[0], id: "asset/a" }]
      }).success
    ).toBe(false);
    expect(
      archiveSchema.safeParse({
        ...archive,
        manifest: {
          ...archive.manifest,
          totalAssetBytes: (core.configurationBackupLimits.maxTotalAssetBytes as number) + 1
        }
      }).success
    ).toBe(false);
    expect(
      archiveSchema.safeParse({
        ...archive,
        configuration: {
          ...archive.configuration,
          tables: { provider_registrations: [{ id: "provider-twitch", accessToken: "do-not-export" }] }
        }
      }).success
    ).toBe(false);
  });

  it("validates restore preflight and completion results", () => {
    const preflight = schema("configurationRestorePreflightSchema");
    const result = schema("configurationRestoreResultSchema");

    expect(
      preflight.safeParse({
        state: "valid",
        archiveId: `sha256:${"c".repeat(64)}`,
        appVersion: "0.0.0",
        schemaVersion: 9,
        createdAt: "2026-07-15T05:00:00.000Z",
        impact: { configurationRecords: 12, providers: 2, alertSets: 1, assets: 4, preferences: 1, browserOutputs: 2 },
        runtime: { intakeActive: false, playbackActive: false, queuedPlaybackCount: 0 },
        blockers: [],
        warnings: [{ summary: "Providers must reconnect", cause: "Credentials are excluded", nextStep: "Reconnect providers after restore", severity: "warning", occurredAt: null, referenceId: null, correction: null }]
      }).success
    ).toBe(true);

    expect(
      result.safeParse({
        state: "completed",
        safetyBackupPath: "C:/Users/James/.stream-jams/backups/pre-restore.streamjams-backup",
        restored: { configurationRecords: 12, providers: 2, alertSets: 1, assets: 4, preferences: 1, browserOutputs: 2 },
        regeneratedOutputs: [{ label: "Landscape live", url: "http://127.0.0.1:39187/overlay/alerts/live/new-key" }],
        reconnectProviders: ["Twitch"],
        warnings: []
      }).success
    ).toBe(true);
  });
});
