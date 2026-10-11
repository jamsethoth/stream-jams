import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fireEvent, waitFor } from "storybook/test";
import { applyMusicContentGeometry, createDefaultMusicModuleConfig, projectMusicWidget, resolveMusicOutputGeometry, type MusicAssetResolver, type MusicModuleConfig, type MusicSnapshot } from "@stream-jams/core";
import { MusicWidget } from "./MusicWidget.js";

const now = Date.now();
const track = { id: "sample-track", title: "Morning Light", artists: ["The Glass Arcade"], album: "Northern Lines", artworkRef: null };
const observation: MusicSnapshot = { providerId: "story", generation: "sample", revision: 1, track, playbackState: "playing",
  positionMs: 48_000, durationMs: 205_000, observedAtEpochMs: now, session: null };
const localAsset: MusicAssetResolver = {
  resolveAsset: () => "/storybook-assets/tiny-image.png",
  resolveArtwork: () => "/storybook-assets/tiny-image.png"
};
function projection(config: MusicModuleConfig = createDefaultMusicModuleConfig(), snapshot = observation) {
  return applyMusicContentGeometry(projectMusicWidget(snapshot, { state: "connected", stale: false, diagnosticReference: null }, config, "landscape", now, now)!, resolveMusicOutputGeometry(config, "landscape"));
}
const meta = { title: "Overlay/Music widget", component: MusicWidget, tags: ["music-widget", "music-content-canvas"], parameters: { layout: "fullscreen" },
  decorators: [(Story) => <div style={{ width: 1920, height: 1080, background: "#343b4a" }}><Story /></div>]
} satisfies Meta<typeof MusicWidget>;
export default meta;
type Story = StoryObj<typeof meta>;

export const PlayingFull: Story = { args: { projection: projection(), resolveAsset: localAsset, nowEpochMs: now }, play: async ({ canvasElement }) => {
  const canvas = canvasElement.querySelector<HTMLElement>('[data-testid="music-content-canvas"]')!;
  const host = canvasElement.querySelector<HTMLElement>(".music-widget-host")!;
  await expect(canvas.style.width).toBe("840px"); await expect(canvas.style.height).toBe("378px");
  await expect(host.style.left).toBe("100px"); await expect(host.style.top).toBe("82px");
  await expect(getComputedStyle(host).overflow).toBe("visible");
} };

export const ArtworkRecoversAfterTemporaryFailure: Story = {
  args: { projection: projection(createDefaultMusicModuleConfig(), { ...observation, track: { ...track, artworkRef: "story-artwork" } }), resolveAsset: localAsset, nowEpochMs: now },
  play: async ({ canvasElement }) => {
    const shadow = canvasElement.querySelector(".music-widget-host")!.shadowRoot!;
    const image = shadow.querySelector(".sj-artwork img") as HTMLImageElement;
    await waitFor(() => expect(image.naturalWidth).toBeGreaterThan(0));
    fireEvent.error(image);
    await waitFor(() => expect(image.isConnected).toBe(false));
    await expect(shadow.querySelector(".sj-title")?.textContent).toBe("Morning Light");
    await waitFor(() => {
      const recovered = shadow.querySelector(".sj-artwork img") as HTMLImageElement | null;
      expect(recovered).not.toBeNull();
      expect(recovered?.naturalWidth).toBeGreaterThan(0);
    }, { timeout: 3_000 });
  }
};

const compactConfig = createDefaultMusicModuleConfig();
compactConfig.profiles.landscape.initialView = "compact";
export const CompactText: Story = { args: { projection: projection(compactConfig), resolveAsset: localAsset, nowEpochMs: now } };

const branded = projection();
branded.profile.views.full.branding.assetId = "brand";
branded.profile.views.full.branding.fit = "cover";
branded.profile.views.full.branding.opacity = 55;
branded.assets.push({ assetId: "brand", version: "a".repeat(64), mimeType: "image/png", sizeBytes: 68, durationMs: null });
export const BrandBehindContent: Story = { args: { projection: branded, resolveAsset: localAsset, nowEpochMs: now } };

const authored = projection();
authored.css = { source: `@keyframes rise { from { transform: translateY(12px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
@container (min-width: 300px) { .sj-content { display: grid; grid-template-columns: 144px 1fr; } .sj-content .sj-title { animation: rise 400ms ease-out !important; } .sj-title::before { content: ""; animation: rise 400ms infinite !important; } }`, enabled: true, styleContractVersion: 1 };
export const CustomGridAndAnimation: Story = { args: { projection: authored, resolveAsset: localAsset, nowEpochMs: now } };

const long = projection(createDefaultMusicModuleConfig(), { ...observation, track: { ...track, title: "A Very Long Track Name Across the Broadcast Canvas That Must Stay Within Its Bounds", artists: ["First Artist", "Second Artist", "Third Artist"], album: null } });
export const LongTextScrolls: Story = { args: { projection: long, resolveAsset: localAsset, nowEpochMs: now } };
export const LongTextReducedMotion: Story = { args: { projection: long, resolveAsset: localAsset, nowEpochMs: now, reducedMotion: true } };

const missing = projection();
missing.profile.views.full.branding.assetId = "gone";
missing.profile.views.full.titleFont.fontAssetId = "missing-font";
missing.assets.push({ assetId: "gone", version: "b".repeat(64), mimeType: "image/png", sizeBytes: 68, durationMs: null });
missing.assets.push({ assetId: "missing-font", version: "c".repeat(64), mimeType: "font/woff2", sizeBytes: 100, durationMs: null });
export const MissingBrandAndFont: Story = { args: { projection: missing, resolveAsset: { resolveAsset: () => null, resolveArtwork: () => null }, nowEpochMs: now } };

const corrupt = projection();
corrupt.css = { source: ".sj-title{background:url(https://example.invalid/image)}", enabled: true, styleContractVersion: 1 };
export const InvalidSavedCssFallsBack: Story = { args: { projection: corrupt, resolveAsset: localAsset, nowEpochMs: now } };
export const ClearedOutput: Story = { args: { projection: null, resolveAsset: localAsset, nowEpochMs: now } };

const overflowing = projection();
overflowing.css = { enabled: true, styleContractVersion: 1, source: ".sj-content { width: 1900px; transform: translate(-100px, -82px); overflow: visible; }" };
export const CustomOverflowStaysInsideCanvas: Story = { args: { projection: overflowing, resolveAsset: localAsset, nowEpochMs: now }, play: async ({ canvasElement }) => {
  const host = canvasElement.querySelector<HTMLElement>(".music-widget-host")!;
  await waitFor(() => expect(host.shadowRoot?.textContent).toContain("translate(-100px,-82px)"));
  const canvas = canvasElement.querySelector<HTMLElement>('[data-testid="music-content-canvas"]')!;
  await expect(getComputedStyle(canvas).overflow).toBe("hidden");
  await expect(canvas.getBoundingClientRect().width).toBe(overflowing.contentCanvas!.width);
  await expect(host.style.left).toBe("100px");
} };
