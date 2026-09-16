import { describe, expect, it } from "vitest";
import { alertEditorDocumentSchema, type AlertEditorDocument } from "./contracts.js";
import { assessAlertConfiguration } from "./alert-configuration-assessment.js";

const animation = { mode: "preset", entrance: "none", exit: "none", durationMs: 0, delayMs: 0, easing: "linear" } as const;

function document(overrides: Partial<AlertEditorDocument> = {}): AlertEditorDocument {
  const base = alertEditorDocumentSchema.parse({
    schemaVersion: 1, id: "alert", setId: "set", providerKind: "twitch", eventType: "follow", kind: "default", parentAlertId: null,
    name: "Follow", enabled: true, conditions: [], durationMs: 5000,
    outputs: { browserSource: true, deviceRouteIds: [] },
    layers: [{ id: "message", name: "Message", type: "text", visible: true, order: 0, animation, template: "Hello" }],
    targetProfiles: [
      { id: "landscape", enabled: true, reviewState: "ready", layerLayouts: [] },
      { id: "vertical", enabled: false, reviewState: "needs-review", layerLayouts: [] }
    ],
    samplePayloads: [{ id: "normal", label: "Normal", kind: "built-in", payload: {} }]
  });
  return { ...base, ...overrides };
}

describe("assessAlertConfiguration", () => {
  it("requires review when enabled browser output has no visible or audible content", () => {
    expect(assessAlertConfiguration(document({ layers: [] }))).toEqual({
      hasBrowserContent: false,
      hasDeviceAudio: false,
      issue: "empty-content",
      profileId: null
    });
  });

  it("accepts device-only audio without a visual profile or retained visible video", () => {
    const audioOnly = document({
      outputs: { browserSource: false, deviceRouteIds: ["headphones"] },
      targetProfiles: document().targetProfiles.map((profile) => ({ ...profile, enabled: false, reviewState: "needs-review" })),
      layers: [
        { id: "visual", name: "Visual", type: "video", visible: true, order: 0, animation, assetId: "art", playEmbeddedAudio: true, audioVolume: 0.5 },
        { id: "sound", name: "Sound", type: "audio", visible: true, order: 1, animation, assetId: "tone", volume: 0.5 }
      ]
    });

    expect(assessAlertConfiguration(audioOnly, { art: "gif" })).toEqual({
      hasBrowserContent: false,
      hasDeviceAudio: true,
      issue: null,
      profileId: null
    });
  });

  it("keeps profile review for mixed browser and device audio", () => {
    const mixed = document({
      outputs: { browserSource: true, deviceRouteIds: ["headphones"] },
      layers: [{ id: "sound", name: "Sound", type: "audio", visible: true, order: 0, animation, assetId: "tone", volume: 0.5 }],
      targetProfiles: document().targetProfiles.map((profile) => ({ ...profile, enabled: profile.id === "vertical", reviewState: "needs-review" }))
    });

    expect(assessAlertConfiguration(mixed)).toEqual({
      hasBrowserContent: true,
      hasDeviceAudio: true,
      issue: "profile-review",
      profileId: "vertical"
    });
  });

  it("accepts reviewed visual content when Browser Source audio is disabled", () => {
    const visual = document({ outputs: { browserSource: false, deviceRouteIds: [] } });

    expect(assessAlertConfiguration(visual)).toEqual({
      hasBrowserContent: true,
      hasDeviceAudio: false,
      issue: null,
      profileId: "landscape"
    });
  });

  it("keeps visual profile review when device audio is also configured", () => {
    const visualAndDevice = document({
      outputs: { browserSource: false, deviceRouteIds: ["headphones"] },
      layers: [
        ...document().layers,
        { id: "sound", name: "Sound", type: "audio", visible: true, order: 1, animation, assetId: "tone", volume: 0.5 } as const
      ],
      targetProfiles: document().targetProfiles.map((profile) => ({ ...profile, enabled: profile.id === "landscape", reviewState: "needs-review" }))
    });

    expect(assessAlertConfiguration(visualAndDevice)).toEqual({
      hasBrowserContent: true,
      hasDeviceAudio: true,
      issue: "profile-review",
      profileId: "landscape"
    });
  });

  it("does not treat a GIF as a device-routable video soundtrack", () => {
    const soundtrack = document({
      outputs: { browserSource: false, deviceRouteIds: ["headphones"] },
      targetProfiles: document().targetProfiles.map((profile) => ({ ...profile, enabled: false })),
      layers: [{ id: "visual", name: "Visual", type: "video", visible: true, order: 0, animation, assetId: "art", playEmbeddedAudio: true, audioVolume: 0.5 }]
    });

    expect(assessAlertConfiguration(soundtrack, { art: "gif" }).issue).toBe("missing-profile");
    expect(assessAlertConfiguration(soundtrack, { art: "video" }).issue).toBeNull();
  });
});
