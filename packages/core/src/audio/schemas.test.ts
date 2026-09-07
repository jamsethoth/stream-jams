import { describe, expect, it } from "vitest";
import * as core from "../index.js";

interface Schema {
  parse(value: unknown): unknown;
  safeParse(value: unknown): { success: boolean };
}
function audioSchema(name: string): Schema {
  const value = (core as unknown as Record<string, unknown>)[name];
  expect(value, `Public contract ${name}`).toBeDefined();
  return value as Schema;
}
const legacyDocument = {
  id: "alert-a", setId: "set-a", providerKind: "twitch", eventType: "follow",
  kind: "default", parentAlertId: null, name: "Follow", enabled: false,
  conditions: [], durationMs: 1000, layers: [],
  targetProfiles: ["landscape", "vertical"].map(id => ({ id, enabled: false, reviewState: "needs-review", layerLayouts: [] })),
  samplePayloads: [{ id: "normal", label: "Normal", kind: "built-in", payload: { userName: "Viewer" } }]
};

describe("alert-wide audio outputs", () => {
  it("defaults legacy documents to browser audio while retaining explicit silence", () => {
    expect(core.alertEditorDocumentSchema.parse(legacyDocument)).toMatchObject({
      outputs: { browserSource: true, deviceRouteIds: [] }
    });
    expect(core.alertEditorDocumentSchema.parse({ ...legacyDocument, outputs: { browserSource: false, deviceRouteIds: [] } }))
      .toMatchObject({ outputs: { browserSource: false, deviceRouteIds: [] } });
  });

  it("retains multiple route selections through parsing and rejects duplicate or blank references", () => {
    const outputs = { browserSource: true, deviceRouteIds: ["private", "stream"] };
    expect(core.alertEditorDocumentSchema.parse({ ...legacyDocument, outputs })).toMatchObject({ outputs });
    for (const deviceRouteIds of [["private", "private"], [""], ["   "]]) {
      expect(core.alertEditorDocumentSchema.safeParse({ ...legacyDocument, outputs: { ...outputs, deviceRouteIds } }).success).toBe(false);
    }
  });

  it("normalizes absent outputs independently and rejects per-layer/combined mode fields", () => {
    const schema = audioSchema("alertAudioOutputsSchema");
    const first = schema.parse(undefined) as { deviceRouteIds: string[] };
    first.deviceRouteIds.push("changed");
    expect(schema.parse(undefined)).toEqual({ browserSource: true, deviceRouteIds: [] });
    for (const value of [null, { browserSource: "both", deviceRouteIds: [] }, { browserSource: true, deviceRouteIds: [], layerOverrides: {} }]) {
      expect(schema.safeParse(value).success).toBe(false);
    }
  });

  it("preserves outputs and existing disabled/review safeguards when re-theming", () => {
    const document = core.alertEditorDocumentSchema.parse({ ...legacyDocument, outputs: { browserSource: false, deviceRouteIds: ["private"] } });
    const themed = core.applyAlertStarterTheme(document, "bold-pop");
    expect(themed).toMatchObject({ enabled: false, outputs: { browserSource: false, deviceRouteIds: ["private"] } });
    expect(themed.targetProfiles.every(profile => !profile.enabled && profile.reviewState === "needs-review")).toBe(true);
  });
});

describe("named audio route contracts", () => {
  it("validates runtime playback contracts without allowing implicit devices or invalid volume", () => {
    const schema = audioSchema("deviceAudioBatchSchema");
    const batch = {
      playbackId: "occurrence-a", documentId: "alert-a", durationMs: 1000, muted: false,
      layers: [{ layerId: "sound", assetId: "asset-a", volume: 0.5 }],
      destinations: [{ deviceId: "device-a", routeIds: ["route-a"] }]
    };
    expect(schema.parse(batch)).toEqual(batch);
    for (const invalid of [
      { durationMs: 0 }, { muted: "false" },
      { layers: [{ layerId: "sound", assetId: "asset-a", volume: 2 }] },
      { destinations: [{ deviceId: "default", routeIds: ["route-a"] }] },
      { destinations: [{ deviceId: "device-a", routeIds: [] }] }
    ]) expect(schema.safeParse({ ...batch, ...invalid }).success).toBe(false);
  });

  it("trims names but accepts only paired explicit device bindings", () => {
    const schema = audioSchema("audioOutputRouteSchema");
    const route = { id: "route-a", name: " Private ", deviceId: "sink-a", deviceLabel: "Headphones" };
    expect(schema.parse(route)).toEqual({ ...route, name: "Private" });
    expect(schema.parse({ ...route, deviceId: null, deviceLabel: null })).toMatchObject({ deviceId: null, deviceLabel: null });
    for (const invalid of [
      { name: " " }, { id: " " }, { deviceId: "default" }, { deviceId: "communications" },
      { deviceId: "" }, { deviceId: null }, { deviceLabel: null }, { deviceLabel: " " }
    ]) expect(schema.safeParse({ ...route, ...invalid }).success).toBe(false);
  });

  it("only accepts intended route mutation fields and explicit binding intent", () => {
    const create = audioSchema("audioOutputRouteCreateSchema");
    const patch = audioSchema("audioOutputRoutePatchSchema");
    expect(create.parse({ name: " Monitor " })).toEqual({ name: "Monitor", deviceId: null });
    expect(patch.parse({ deviceId: null })).toMatchObject({ deviceId: null });
    for (const invalid of [{}, { name: " " }, { deviceId: "default" }, { deviceLabel: "Pretend device" }, { arbitrary: true }]) {
      expect(patch.safeParse(invalid).success).toBe(false);
    }
  });
});
