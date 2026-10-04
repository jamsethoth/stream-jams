import { defaultAssetValidationPolicy, mediaVersionSnapshotSchema, desktopVisualBatchSchema, overlayModulePresentationSchema, type DesktopModuleSync, type DesktopVisualBatch, type OverlayModulePresentation } from "@stream-jams/core";
import type { LocalMediaService } from "../assets/local-media-service.js";

export interface DesktopVisualAssetResolverDependencies {
  readonly media: Pick<LocalMediaService, "records" | "verifyGroup" | "issueTrustedGrant" | "hasOwner" | "shareVersion">;
  readonly now?: () => number;
}

export class DesktopVisualAssetResolver {
  readonly #now: () => number;
  constructor(private readonly dependencies: DesktopVisualAssetResolverDependencies) { this.#now = dependencies.now ?? Date.now; }

  async resolve(candidate: Omit<DesktopVisualBatch, "assets">): Promise<DesktopVisualBatch> {
    if (candidate === null || typeof candidate !== "object" || Object.keys(candidate).some(key => !["key", "timing", "instructions", "deferredStart"].includes(key))) throw unavailable();
    const input = {
      ...(candidate.deferredStart === undefined ? {} : { deferredStart: desktopVisualBatchSchema.shape.deferredStart.parse(candidate.deferredStart) }),
      key: desktopVisualBatchSchema.shape.key.parse(candidate.key),
      timing: desktopVisualBatchSchema.shape.timing.parse(candidate.timing),
      instructions: desktopVisualBatchSchema.shape.instructions.parse(candidate.instructions)
    };
    const ids = new Set<string>();
    const referenced = new Map<string, "image" | "gif" | "video" | "font">();
    for (const instruction of input.instructions) {
      if (ids.has(instruction.id) || instruction.moduleId !== input.key.moduleId || instruction.durationMs !== input.timing.endsAtEpochMs - input.timing.startsAtEpochMs) throw unavailable();
      ids.add(instruction.id);
      const fontId = instruction.text?.textStyle?.fontAssetId;
      if (fontId) {
        if (referenced.has(fontId) && referenced.get(fontId) !== "font") throw unavailable();
        referenced.set(fontId, "font");
      }
      if (instruction.visual === null) continue;
      const { assetId, mediaType } = instruction.visual;
      if (referenced.has(assetId) && referenced.get(assetId) !== mediaType) throw unavailable();
      referenced.set(assetId, mediaType);
    }
    if (referenced.size === 0) return desktopVisualBatchSchema.parse({ ...input, assets: [] });
    const owner = this.dependencies.media.hasOwner(input.key.occurrenceId) ? input.key.occurrenceId : JSON.stringify([input.key.moduleId, input.key.occurrenceId]);
    const records = this.dependencies.media.records(owner, [...referenced.keys()]);
    for (const [id, kind] of referenced) {
      const record = records.get(id);
      if (record === undefined || record.id !== id || record.mediaType !== kind || record.mimeType !== ({ image: ["image/png", "image/jpeg", "image/webp"], gif: ["image/gif"], video: ["video/mp4", "video/webm"], font: ["font/ttf", "font/otf", "font/woff", "font/woff2"] }[kind]).find(mime => mime === record.mimeType) ||
          !mediaVersionSnapshotSchema.shape.mimeType.safeParse(record.mimeType).success || !Number.isSafeInteger(record.sizeBytes) || record.sizeBytes <= 0 ||
          record.sizeBytes > defaultAssetValidationPolicy[kind].maxSizeBytes || !/^(?:sha256:)?[a-f0-9]{64}$/i.test(record.checksum)) throw unavailable();
    }
    await this.dependencies.media.verifyGroup(owner, [...referenced.keys()], AbortSignal.timeout(5000));
    const assets = [...referenced.keys()].map(assetId => ({ assetId, grant: this.dependencies.media.issueTrustedGrant(owner, assetId,
      `desktop-visual:${JSON.stringify(input.key)}`, Math.min(this.#now() + 3600000, Math.max(this.#now() + 20000, input.timing.endsAtEpochMs + 5000))) }));
    return desktopVisualBatchSchema.parse({ ...input, assets });
  }

  async resolveTimerModule(candidate: OverlayModulePresentation): Promise<{
    presentation: Extract<OverlayModulePresentation, { kind: "timer-stack" }>; assets: DesktopModuleSync["assets"]; missingAssetIds: readonly string[];
  }> {
    const presentation = overlayModulePresentationSchema.parse(candidate);
    if (presentation.kind !== "timer-stack" || presentation.stack.targetProfileId !== "landscape") throw unavailable();
    const assets: DesktopModuleSync["assets"][number][] = [];
    const missing = new Set<string>();
    const failedVersions = new Set<string>();
    const seen = new Set<string>();
    for (const card of presentation.stack.cards) {
      if (card.iconAssetId === null) continue;
      const id = card.iconAssetId;
      const identity = JSON.stringify([id, card.iconVersion]);
      try {
        if (card.iconVersion === undefined) throw unavailable();
        const owner = JSON.stringify(["timers", `desktop-icon:${identity}`]);
        this.dependencies.media.shareVersion(owner, JSON.stringify(["timers", card.generation]), id, card.iconVersion);
        if (seen.has(identity)) continue;
        seen.add(identity);
        // Run admission verifies icons once; transport revisions and refreshes only renew access.
        assets.push({ assetId: id, grant: this.dependencies.media.issueTrustedGrant(owner, id, "desktop-timers", this.#now() + 3600000) });
      }
      // error-provenance: allow expected -- unavailable icon references use the existing missing-icon fallback
      catch { missing.add(id); failedVersions.add(identity); }
    }
    return { presentation: { ...presentation, stack: { ...presentation.stack, cards: presentation.stack.cards.map(card =>
      card.iconAssetId !== null && failedVersions.has(JSON.stringify([card.iconAssetId, card.iconVersion])) ? { ...card, iconAssetId: null } : card) } }, assets, missingAssetIds: [...missing] };
  }
}
function unavailable(): Error { return new Error("Desktop visual asset is unavailable or invalid"); }
