import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  createDefaultMusicModuleConfig, createMusicViewAppearance, musicAlignmentSchema,
  musicAppearanceSchema, musicBrandingSchema, musicCapabilitiesSchema, musicConnectionTestResultSchema,
  musicCssConfigSchema, musicInsetsSchema, musicModuleConfigSchema, musicProfileConfigSchema, musicBackgroundOpacitySchema, musicIdleAfterSecondsSchema,
  musicSnapshotSchema, musicStatusSchema, musicTypographySchema, musicWidgetProjectionSchema
} from "./schemas.js";
import { musicModuleDefinition } from "./module-definition.js";

export const observation = {
  providerId: "provider-1", generation: "generation-1", revision: 1,
  track: { id: "track-1", title: "Title", artists: ["First", "Second"], album: null, artworkRef: null },
  playbackState: "playing" as const, positionMs: 1000, durationMs: null,
  observedAtEpochMs: 10000, session: null
};

function boundaries(schema: z.ZodType, min: number, max: number, step = 1): void {
  for (const [value, valid] of [[min - step, false], [min, true], [max, true], [max + step, false]] as const) {
    expect(schema.safeParse(value).success, `value ${value}`).toBe(valid);
  }
  for (const value of [NaN, Infinity, -Infinity, "1", null]) expect(schema.safeParse(value).success).toBe(false);
}

describe("Music normalized boundaries", () => {
  it("preserves nullable unknowns and ordered artists", () => {
    expect(musicSnapshotSchema.parse(observation)).toEqual(observation);
    expect(musicSnapshotSchema.parse({ ...observation, positionMs: null, track: null }).positionMs).toBeNull();
  });
  it.each(["title", "album"])("bounds track %s at 1024 characters", field => {
    for (const length of [0, 1024, 1025]) {
      expect(musicSnapshotSchema.safeParse({ ...observation, track: { ...observation.track, [field]: "x".repeat(length) } }).success).toBe(length <= 1024);
    }
  });
  it("bounds artists and every identity", () => {
    for (const length of [0, 32, 33]) expect(musicSnapshotSchema.safeParse({ ...observation, track: { ...observation.track, artists: Array.from({ length }, () => "a") } }).success).toBe(length <= 32);
    expect(musicSnapshotSchema.safeParse({ ...observation, track: { ...observation.track, artists: ["a".repeat(1024)] } }).success).toBe(true);
    expect(musicSnapshotSchema.safeParse({ ...observation, track: { ...observation.track, artists: ["a".repeat(1025)] } }).success).toBe(false);
    for (const length of [0, 1, 512, 513]) {
      const id = "x".repeat(length);
      for (const value of [{ ...observation, providerId: id }, { ...observation, generation: id }, { ...observation, track: { ...observation.track, id } }]) {
        expect(musicSnapshotSchema.safeParse(value).success).toBe(length >= 1 && length <= 512);
      }
    }
  });
  it("rejects malformed clocks, progress and revision without coercion", () => {
    for (const field of ["positionMs", "durationMs", "observedAtEpochMs", "revision"] as const) {
      for (const value of [-1, NaN, Infinity, -Infinity, "100"]) expect(musicSnapshotSchema.safeParse({ ...observation, [field]: value }).success).toBe(false);
      expect(musicSnapshotSchema.safeParse({ ...observation, [field]: 0 }).success).toBe(true);
    }
    expect(musicSnapshotSchema.safeParse({ ...observation, revision: 0.5 }).success).toBe(false);
    expect(musicSnapshotSchema.safeParse({ ...observation, positionMs: 0.5 }).success).toBe(true);
  });
  it("rejects extra transport fields and non-opaque artwork/session references", () => {
    for (const extra of [{ token: "secret" }, { url: "https://example.test" }, { credentialRef: "secret" }]) {
      expect(musicSnapshotSchema.safeParse({ ...observation, ...extra }).success).toBe(false);
      expect(musicSnapshotSchema.safeParse({ ...observation, track: { ...observation.track, ...extra } }).success).toBe(false);
    }
    for (const artworkRef of ["https://example.test/art", "/art", ""]) expect(musicSnapshotSchema.safeParse({ ...observation, track: { ...observation.track, artworkRef } }).success).toBe(false);
    expect(musicSnapshotSchema.safeParse({ ...observation, session: { id: "session-1", label: "Player" } }).success).toBe(true);
    expect(musicSnapshotSchema.safeParse({ ...observation, session: { id: "session-1", label: "x".repeat(1025) } }).success).toBe(false);
  });
  it("permits only public HTTPS attribution without credentials or query material", () => {
    for (const url of ["https://music.example/track/1", "not a url", "", "javascript:alert(1)", "https://user:secret@example.test", "https://example.test/?token=x", "http://example.test"]) {
      expect(musicSnapshotSchema.safeParse({ ...observation, track: { ...observation.track, attribution: { label: "Source", url } } }).success).toBe(url === "https://music.example/track/1");
    }
  });
  it("validates status, capabilities and selected-transport results strictly", () => {
    const capabilities = { artwork: true, position: true, duration: false, sessionSelection: false };
    expect(musicCapabilitiesSchema.parse(capabilities)).toEqual(capabilities);
    expect(musicCapabilitiesSchema.safeParse({ ...capabilities, token: "x" }).success).toBe(false);
    for (const state of ["disconnected", "connecting", "connected", "reconnecting", "auth-required", "error"]) expect(musicStatusSchema.safeParse({ state, stale: false, diagnosticReference: null }).success).toBe(true);
    expect(musicStatusSchema.safeParse({ state: "connected", stale: false, diagnosticReference: "https://example.test/?token=x" }).success).toBe(false);
    for (const transport of ["ws", "poll"]) expect(musicConnectionTestResultSchema.safeParse({ transport, capabilities }).success).toBe(true);
    expect(musicConnectionTestResultSchema.safeParse({ transport: "auto", capabilities }).success).toBe(false);
  });
});

describe("Music appearance configuration", () => {
  it("defaults disabled with the reference geometry and backward-compatible empty CSS/branding", () => {
    expect(musicModuleDefinition.defaultEnabled).toBe(false);
    const config = createDefaultMusicModuleConfig();
    expect(musicModuleDefinition.configSchema.parse(musicModuleDefinition.defaultConfig)).toEqual(config);
    expect(config.profiles.landscape).toMatchObject({ initialView: "full", theme: "dark", alignment: "bottom-left", backgroundOpacity: 84, idleMode: "none", idleAfterSeconds: 30 });
    expect(config.profiles.landscape.views.full).toMatchObject({ widthPx: 640, heightPx: 178, artworkSizePx: 144, paddingXPx: 16, paddingYPx: 16, gapPx: 22, cornerRadiusPx: 8 });
    expect(config.profiles.landscape.views.compact).toMatchObject({ widthPx: 480, heightPx: 118, artworkSizePx: 0, paddingXPx: 18, paddingYPx: 14, titleFont: { fontSizePx: 22 }, detailsFont: { fontSizePx: 14 } });
    const full = { ...config.profiles.landscape.views.full } as Record<string, unknown>;
    delete full.branding; delete full.contentInsets;
    expect(musicModuleConfigSchema.parse({ profiles: { landscape: { views: { full, compact: config.profiles.landscape.views.compact } }, vertical: {} } })).toMatchObject({ version: 1, css: { source: "", enabled: false, styleContractVersion: 1 }, profiles: { landscape: { views: { full: { branding: { assetId: null, fit: "contain", xPercent: 50, yPercent: 50, opacity: 100 }, contentInsets: { top: 0, right: 0, bottom: 0, left: 0 } } } } } });
  });
  it("accepts every view/theme/alignment/idle combination", () => {
    for (const initialView of ["full", "compact"]) for (const theme of ["dark", "light"]) for (const alignment of musicAlignmentSchema.options) for (const idleMode of ["none", "hide", "compact"]) {
      expect(musicProfileConfigSchema.safeParse({ initialView, theme, alignment, idleMode }).success).toBe(true);
    }
    expect(musicAlignmentSchema.options).toEqual(["top-left", "top-center", "top-right", "center-left", "center-right", "bottom-left", "bottom-center", "bottom-right"]);
    for (const value of [{ theme: "blue" }, { alignment: "center" }, { initialView: "tiny" }, { idleMode: "pause" }]) expect(musicProfileConfigSchema.safeParse(value).success).toBe(false);
  });
  it("checks every numeric geometry and typography boundary", () => {
    const appearance = musicAppearanceSchema.shape;
    for (const [schema, min, max] of [
      [appearance.widthPx, 160, 1920], [appearance.heightPx, 48, 1080], [appearance.artworkSizePx, 0, 512],
      [appearance.paddingXPx, 0, 128], [appearance.paddingYPx, 0, 128], [appearance.gapPx, 0, 128],
      [appearance.cornerRadiusPx, 0, 128], [appearance.borderWidthPx, 0, 32],
      [musicTypographySchema.shape.fontSizePx, 8, 144], [musicTypographySchema.shape.letterSpacingPx, -20, 100],
      [appearance.shadow.shape.offsetX, -128, 128], [appearance.shadow.shape.offsetY, -128, 128],
      [appearance.shadow.shape.blur, 0, 128], [appearance.shadow.shape.spread, -64, 64],
      [musicBackgroundOpacitySchema, 0, 100], [musicIdleAfterSecondsSchema, 1, 600],
      [musicBrandingSchema.shape.xPercent, 0, 100], [musicBrandingSchema.shape.yPercent, 0, 100], [musicBrandingSchema.shape.opacity, 0, 100]
    ] as const) boundaries(schema, min, max);
    boundaries(musicTypographySchema.shape.fontWeight, 100, 900, 100);
    expect(musicTypographySchema.shape.fontWeight.safeParse(650).success).toBe(false);
    for (const schema of Object.values(musicInsetsSchema.shape)) boundaries(schema, 0, 512);
    for (const field of ["widthPx", "heightPx", "artworkSizePx", "paddingXPx", "paddingYPx", "gapPx", "cornerRadiusPx", "borderWidthPx"] as const) expect(appearance[field].safeParse(160.5).success).toBe(false);
  });
  it("rejects consumed content, invalid RGBA and resource URLs in native config", () => {
    const view = createMusicViewAppearance("dark", "full");
    expect(musicAppearanceSchema.safeParse({ ...view, widthPx: 159 }).success).toBe(false);
    for (const contentInsets of [{ top: 89, bottom: 89, left: 0, right: 0 }, { top: 0, bottom: 0, left: 320, right: 320 }]) expect(musicAppearanceSchema.safeParse({ ...view, contentInsets }).success).toBe(false);
    expect(musicAppearanceSchema.safeParse({ ...view, contentInsets: { top: 88, bottom: 89, left: 0, right: 0 } }).success).toBe(true);
    for (const color of ["#00000000", "#FFFFFFFF", "#abcdef80"]) expect(musicAppearanceSchema.safeParse({ ...view, colors: { ...view.colors, title: color } }).success).toBe(true);
    for (const color of ["red", "#ffffff", "rgba(1,2,3,1.1)", "#FFFFFFFFF"]) expect(musicAppearanceSchema.safeParse({ ...view, colors: { ...view.colors, title: color } }).success).toBe(false);
    expect(musicTypographySchema.safeParse({ ...view.titleFont, fontAssetId: "https://example.test/font" }).success).toBe(false);
    expect(musicBrandingSchema.safeParse({ ...view.branding, assetId: "https://example.test/brand" }).success).toBe(false);
    expect(musicModuleConfigSchema.safeParse({ ...createDefaultMusicModuleConfig(), endpoint: "http://127.0.0.1:26538" }).success).toBe(false);
    expect(musicAppearanceSchema.safeParse({ ...view, surprise: true }).success).toBe(false);
  });
  it("bounds UTF-8 CSS storage and contract version without applying the later AST policy", () => {
    expect(musicCssConfigSchema.safeParse({ source: "a".repeat(32768), enabled: true, styleContractVersion: 1 }).success).toBe(true);
    for (const source of ["a".repeat(32769), "é".repeat(16385)]) expect(musicCssConfigSchema.safeParse({ source, enabled: true, styleContractVersion: 1 }).success).toBe(false);
    expect(musicCssConfigSchema.safeParse({ source: "é".repeat(16384), enabled: false, styleContractVersion: 1 }).success).toBe(true);
    expect(musicCssConfigSchema.safeParse({ source: "", enabled: false, styleContractVersion: 2 }).success).toBe(false);
  });
  it("strictly validates versioned public references without transport URLs", () => {
    const config = createDefaultMusicModuleConfig();
    const projection = { targetProfileId: "landscape", snapshot: observation, appearanceStartedAtEpochMs: 10000, clockReferenceEpochMs: 11000, profile: config.profiles.landscape, view: "full", layout: { x: 0, y: 902, width: 640, height: 178, zIndex: 0 }, css: config.css, assets: [] };
    expect(musicWidgetProjectionSchema.safeParse(projection).success).toBe(true);
    expect(musicWidgetProjectionSchema.safeParse({ ...projection, clockReferenceEpochMs: undefined }).success).toBe(false);
    expect(musicWidgetProjectionSchema.safeParse({ ...projection, clockReferenceEpochMs: Number.MAX_SAFE_INTEGER + 1 }).success).toBe(false);
    expect(musicWidgetProjectionSchema.safeParse({ ...projection, assets: [{ assetId: "brand", version: "a".repeat(64), mimeType: "image/png", sizeBytes: 10, durationMs: null }] }).success).toBe(true);
    expect(musicWidgetProjectionSchema.safeParse({ ...projection, assets: [{ url: "https://example.test" }] }).success).toBe(false);
  });
});
