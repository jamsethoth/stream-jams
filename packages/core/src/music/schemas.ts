import { z } from "zod";
import { alertTextStyleSchema, rgbaColorSchema } from "../alerts/text-style.js";
import { mediaVersionSnapshotSchema } from "../assets/media-reference.js";
import { targetProfileDefinitions } from "../management/contracts.js";
import { overlayElementLayoutSchema, overlayTargetProfileIdSchema } from "../shared/schemas.js";

export const musicLimits = {
  metadataCharacters: 1024, artists: 32, identityCharacters: 512, staleAfterMs: 45000,
  widthPx: { min: 160, max: 1920 }, heightPx: { min: 48, max: 1080 }, artworkSizePx: { min: 0, max: 512 },
  spacingPx: { min: 0, max: 128 }, cornerRadiusPx: { min: 0, max: 128 }, borderWidthPx: { min: 0, max: 32 },
  contentInsetPx: { min: 0, max: 512 }, fontSizePx: { min: 8, max: 144 }, fontWeight: { min: 100, max: 900 },
  letterSpacingPx: { min: -20, max: 100 }, shadowOffsetPx: { min: -128, max: 128 }, shadowBlurPx: { min: 0, max: 128 },
  shadowSpreadPx: { min: -64, max: 64 }, idleAfterSeconds: { min: 1, max: 600 }, percentage: { min: 0, max: 100 },
  cssBytes: 32 * 1024, cssRules: 512, cssDeclarations: 4096, cssNesting: 8
} as const;

const boundedInteger = (limit: { readonly min: number; readonly max: number }) => z.number().int().min(limit.min).max(limit.max);
const milliseconds = z.number().finite().nonnegative();
const identity = z.string().min(1).max(musicLimits.identityCharacters).regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/);
const opaqueReference = z.string().min(1).max(musicLimits.identityCharacters).regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/);
const metadata = z.string().max(musicLimits.metadataCharacters);

export const musicCapabilitiesSchema = z.object({ artwork: z.boolean(), position: z.boolean(), duration: z.boolean(), sessionSelection: z.boolean() }).strict();
export const musicStatusSchema = z.object({
  state: z.enum(["disconnected", "connecting", "connected", "reconnecting", "auth-required", "error"]),
  stale: z.boolean(), diagnosticReference: opaqueReference.nullable()
}).strict();
export const musicConnectionTestResultSchema = z.object({ transport: z.enum(["ws", "poll"]), capabilities: musicCapabilitiesSchema }).strict();
export const musicAttributionSchema = z.object({
  label: metadata,
  url: z.url().refine(value => {
    if (!URL.canParse(value)) return false;
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash;
  }, "Attribution must be a public HTTPS link without credentials, query or fragment")
}).strict();
export const musicTrackSchema = z.object({
  id: identity, title: metadata, artists: z.array(metadata).max(musicLimits.artists), album: metadata.nullable(),
  artworkRef: opaqueReference.nullable(), attribution: musicAttributionSchema.optional()
}).strict();
export const musicSnapshotSchema = z.object({
  providerId: identity, generation: identity, revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  track: musicTrackSchema.nullable(), playbackState: z.enum(["playing", "paused", "stopped", "unknown"]),
  positionMs: milliseconds.nullable(), durationMs: milliseconds.nullable(), observedAtEpochMs: milliseconds,
  session: z.object({ id: opaqueReference, label: metadata }).strict().nullable()
}).strict();

export const musicViewSchema = z.enum(["full", "compact"]);
export const musicThemeSchema = z.enum(["dark", "light"]);
export const musicAlignmentSchema = z.enum(["top-left", "top-center", "top-right", "center-left", "center-right", "bottom-left", "bottom-center", "bottom-right"]);
export const musicBackgroundOpacitySchema = boundedInteger(musicLimits.percentage);
export const musicIdleAfterSecondsSchema = boundedInteger(musicLimits.idleAfterSeconds);
export const musicTypographySchema = alertTextStyleSchema.pick({ fontPreset: true, italic: true, underline: true, letterSpacingPx: true }).extend({
  fontAssetId: opaqueReference.nullable().default(null),
  fontSizePx: boundedInteger(musicLimits.fontSizePx),
  fontWeight: boundedInteger(musicLimits.fontWeight).multipleOf(100),
  italic: z.boolean().default(false), underline: z.boolean().default(false),
  letterSpacingPx: z.number().finite().min(musicLimits.letterSpacingPx.min).max(musicLimits.letterSpacingPx.max).default(0)
}).strict();
export const musicColorsSchema = z.object({
  backgroundStart: rgbaColorSchema, backgroundEnd: rgbaColorSchema, title: rgbaColorSchema, details: rgbaColorSchema,
  artworkPlaceholder: rgbaColorSchema, border: rgbaColorSchema, progressFill: rgbaColorSchema, progressTrack: rgbaColorSchema
}).strict();
export const musicShadowSchema = z.object({
  offsetX: boundedInteger(musicLimits.shadowOffsetPx), offsetY: boundedInteger(musicLimits.shadowOffsetPx),
  blur: boundedInteger(musicLimits.shadowBlurPx), spread: boundedInteger(musicLimits.shadowSpreadPx), color: rgbaColorSchema
}).strict();
export const musicInsetsSchema = z.object({
  top: boundedInteger(musicLimits.contentInsetPx), right: boundedInteger(musicLimits.contentInsetPx),
  bottom: boundedInteger(musicLimits.contentInsetPx), left: boundedInteger(musicLimits.contentInsetPx)
}).strict();
export const musicBrandingSchema = z.object({
  assetId: opaqueReference.nullable(), fit: z.enum(["contain", "cover", "fill"]),
  xPercent: boundedInteger(musicLimits.percentage), yPercent: boundedInteger(musicLimits.percentage), opacity: boundedInteger(musicLimits.percentage)
}).strict();
export const musicComponentRectSchema = z.object({
  x: z.number().int().min(0).max(musicLimits.widthPx.max - 1),
  y: z.number().int().min(0).max(musicLimits.heightPx.max - 1),
  width: z.number().int().min(1).max(musicLimits.widthPx.max),
  height: z.number().int().min(1).max(musicLimits.heightPx.max)
}).strict();
export const musicComponentLayoutSchema = z.object({
  artwork: musicComponentRectSchema, title: musicComponentRectSchema, details: musicComponentRectSchema,
  progress: musicComponentRectSchema, time: musicComponentRectSchema
}).strict();
export const musicAppearanceSchema = z.object({
  widthPx: boundedInteger(musicLimits.widthPx), heightPx: boundedInteger(musicLimits.heightPx), artworkSizePx: boundedInteger(musicLimits.artworkSizePx),
  paddingXPx: boundedInteger(musicLimits.spacingPx), paddingYPx: boundedInteger(musicLimits.spacingPx), gapPx: boundedInteger(musicLimits.spacingPx),
  cornerRadiusPx: boundedInteger(musicLimits.cornerRadiusPx), borderWidthPx: boundedInteger(musicLimits.borderWidthPx),
  colors: musicColorsSchema, shadow: musicShadowSchema, titleFont: musicTypographySchema, detailsFont: musicTypographySchema,
  contentInsets: musicInsetsSchema.default({ top: 0, right: 0, bottom: 0, left: 0 }),
  branding: musicBrandingSchema.default({ assetId: null, fit: "contain", xPercent: 50, yPercent: 50, opacity: 100 }),
  componentLayout: musicComponentLayoutSchema.nullable().default(null)
}).strict().superRefine((view, context) => {
  if (view.contentInsets.left + view.contentInsets.right >= view.widthPx || view.contentInsets.top + view.contentInsets.bottom >= view.heightPx) {
    context.addIssue({ code: "custom", path: ["contentInsets"], message: "Content insets must leave a positive content area" });
  }
  if (view.componentLayout !== null) for (const [role, rect] of Object.entries(view.componentLayout)) {
    if (rect.x + rect.width > view.widthPx || rect.y + rect.height > view.heightPx) {
      context.addIssue({ code: "custom", path: ["componentLayout", role], message: "Component must remain inside the widget" });
    }
  }
});

/** Native presets ported from the standalone overlay.css; controls retain exact per-view geometry. */
export function createMusicViewAppearance(theme: z.infer<typeof musicThemeSchema>, view: z.infer<typeof musicViewSchema>): z.infer<typeof musicAppearanceSchema> {
  const light = theme === "light";
  const compact = view === "compact";
  return musicAppearanceSchema.parse({
    widthPx: compact ? 480 : 640, heightPx: compact ? 118 : 178, artworkSizePx: compact ? 0 : 144,
    paddingXPx: compact ? 18 : 16, paddingYPx: compact ? 14 : 16, gapPx: 22, cornerRadiusPx: 8, borderWidthPx: 1,
    colors: {
      backgroundStart: light ? "#F7F8F6FF" : "#0C0D10FF", backgroundEnd: light ? "#FFFFFFFF" : "#16181DFF",
      title: light ? "#16181DFF" : "#F7F7F5FF", details: light ? "#4D5562FF" : "#B7B8BDFF",
      artworkPlaceholder: "#FFFFFF14", border: light ? "#16181D1F" : "#FFFFFF24",
      progressFill: light ? "#5D6673FF" : "#AEB4BFFF", progressTrack: light ? "#16181D29" : "#FFFFFF2E"
    },
    shadow: { offsetX: 0, offsetY: 18, blur: 50, spread: 0, color: light ? "#0A141C24" : "#00000047" },
    titleFont: { fontPreset: "system-sans", fontSizePx: compact ? 22 : 30, fontWeight: 800 },
    detailsFont: { fontPreset: "system-sans", fontSizePx: compact ? 14 : 17, fontWeight: 600 }
  });
}

export const musicProfileConfigSchema = z.object({
  initialView: musicViewSchema.default("full"), theme: musicThemeSchema.default("dark"), alignment: musicAlignmentSchema.default("bottom-left"),
  backgroundOpacity: musicBackgroundOpacitySchema.default(84), idleMode: z.enum(["none", "hide", "compact"]).default("none"),
  idleAfterSeconds: musicIdleAfterSecondsSchema.default(30),
  views: z.object({ full: musicAppearanceSchema, compact: musicAppearanceSchema }).strict().optional()
}).strict().transform(profile => ({ ...profile, views: profile.views ?? { full: createMusicViewAppearance(profile.theme, "full"), compact: createMusicViewAppearance(profile.theme, "compact") } }));

export const musicCssConfigSchema = z.object({
  source: z.string().refine(source => new TextEncoder().encode(source).byteLength <= musicLimits.cssBytes, "CSS exceeds the 32 KiB UTF-8 limit").default(""),
  enabled: z.boolean().default(false), styleContractVersion: z.literal(1).default(1)
}).strict();
export const musicDesktopPositionSchema = z.object({ x: z.number().int().min(0).max(1920), y: z.number().int().min(0).max(1080) }).strict();
export const musicDesktopPlacementSchema = z.object({ full: musicDesktopPositionSchema.nullable().default(null), compact: musicDesktopPositionSchema.nullable().default(null) }).strict();

export const musicModuleConfigSchema = z.object({
  version: z.literal(1).default(1),
  desktopPlacement: musicDesktopPlacementSchema.default({ full: null, compact: null }),
  profiles: z.object({ landscape: musicProfileConfigSchema, vertical: musicProfileConfigSchema }).strict(),
  css: musicCssConfigSchema.default({ source: "", enabled: false, styleContractVersion: 1 })
}).strict();
export function createDefaultMusicModuleConfig(): z.infer<typeof musicModuleConfigSchema> {
  return musicModuleConfigSchema.parse({ profiles: { landscape: {}, vertical: {} } });
}

export const musicPublicAssetReferenceSchema = mediaVersionSnapshotSchema.extend({
  assetId: opaqueReference,
  mimeType: z.enum(["image/png", "image/jpeg", "image/webp", "font/ttf", "font/otf", "font/woff", "font/woff2"])
}).strict();
export const musicWidgetProjectionSchema = z.object({
  targetProfileId: overlayTargetProfileIdSchema, snapshot: musicSnapshotSchema,
  appearanceStartedAtEpochMs: milliseconds, clockReferenceEpochMs: milliseconds.max(Number.MAX_SAFE_INTEGER),
  profile: musicProfileConfigSchema, view: musicViewSchema,
  layout: overlayElementLayoutSchema.strict(), css: musicCssConfigSchema, assets: z.array(musicPublicAssetReferenceSchema)
}).strict().superRefine((projection, context) => {
  const bounds = targetProfileDefinitions.find(profile => profile.id === projection.targetProfileId)!;
  const { layout } = projection;
  if (!projection.snapshot.track || layout.x < 0 || layout.y < 0 || layout.x + layout.width > bounds.width || layout.y + layout.height > bounds.height) {
    context.addIssue({ code: "custom", message: "Music projection must have a track and remain inside its target profile" });
  }
});
