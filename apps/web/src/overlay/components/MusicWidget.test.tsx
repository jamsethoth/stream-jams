import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { createDefaultMusicModuleConfig, projectMusicWidget, type MusicAssetResolver, type MusicSnapshot, type MusicWidgetProjection } from "@stream-jams/core";
import { describe, expect, it, vi } from "vitest";
import { MusicWidget } from "./MusicWidget.js";
import { StrictMode } from "react";

const now = 1_000_000;
const snapshot: MusicSnapshot = {
  providerId: "pear", generation: "gen", revision: 1, playbackState: "playing", positionMs: 30_000,
  durationMs: 120_000, observedAtEpochMs: now, session: null,
  track: { id: "track", title: "Title", artists: ["Artist"], album: "Album", artworkRef: "art_123" }
};
const resolver: MusicAssetResolver = {
  resolveAsset: asset => `/assets/${asset.assetId}?version=${asset.version}`,
  resolveArtwork: ref => `/artwork/${ref}`
};
const fixture = (observation: MusicSnapshot = snapshot): MusicWidgetProjection => projectMusicWidget(observation,
  { state: "connected", stale: false, diagnosticReference: null }, createDefaultMusicModuleConfig(), "landscape", now, now)!;
const shadowOf = (container: HTMLElement) => container.querySelector(".music-widget-host")?.shadowRoot;

describe("MusicWidget", () => {
  it("renders full native layout and advances a known position from the observation clock", () => {
    const { container } = render(<MusicWidget projection={fixture()} resolveAsset={resolver} nowEpochMs={now + 2_000} />);
    const shadow = shadowOf(container)!;
    expect(shadow.querySelector('.sj-content[data-view="full"]')).not.toBeNull();
    expect(shadow.querySelector(".sj-title")?.textContent).toBe("Title");
    expect(shadow.querySelector(".sj-time")?.textContent).toBe("0:32 / 2:00");
    expect(shadow.querySelector(".sj-progress-fill")?.getAttribute("style")).toContain("26.666");
    expect(shadow.querySelector(".sj-artwork img")?.getAttribute("src")).toBe("/artwork/art_123");
  });

  it.each([-300_000, 300_000])("uses server time with a recipient wall-clock offset of %i ms", offset => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    let monotonic = 100;
    vi.spyOn(performance, "now").mockImplementation(() => monotonic);
    vi.spyOn(Date, "now").mockReturnValue(now + offset);
    try {
      const value = { ...fixture(), clockReferenceEpochMs: now + 1_000 };
      const view = render(<MusicWidget projection={value} resolveAsset={resolver} />);
      expect(shadowOf(view.container)?.querySelector(".sj-time")?.textContent).toBe("0:31 / 2:00");
      monotonic += 2_000;
      act(() => vi.advanceTimersByTime(2_000));
      expect(shadowOf(view.container)?.querySelector(".sj-time")?.textContent).toBe("0:33 / 2:00");
      for (const [revision, playbackState] of [[2, "paused"], [3, "unknown"]] as const) {
        view.rerender(<MusicWidget projection={{ ...value, snapshot: { ...snapshot, revision, playbackState }, clockReferenceEpochMs: now + 3_000 }} resolveAsset={resolver} />);
        expect(shadowOf(view.container)?.querySelector(".sj-time")?.textContent).toBe("0:30 / 2:00");
        monotonic += 1_000;
        act(() => vi.advanceTimersByTime(1_000));
        expect(shadowOf(view.container)?.querySelector(".sj-time")?.textContent).toBe("0:30 / 2:00");
      }
      // A new recipient gets the already-aged observation, rather than 45 fresh seconds.
      view.rerender(<MusicWidget projection={{ ...value, snapshot: { ...snapshot, revision: 4 }, clockReferenceEpochMs: now + 44_000 }} resolveAsset={resolver} />);
      expect(shadowOf(view.container)?.querySelector(".sj-title")?.textContent).toBe("Title");
      monotonic += 1_001;
      act(() => vi.advanceTimersByTime(1_001));
      expect(view.container).toBeEmptyDOMElement();
      view.unmount();
    } finally {
      vi.restoreAllMocks();
      vi.useRealTimers();
    }
  });

  it("renders compact appearance, safe fallbacks and long text without markup", () => {
    const config = createDefaultMusicModuleConfig();
    config.profiles.landscape.initialView = "compact";
    const value = projectMusicWidget({ ...snapshot, track: { ...snapshot.track!, title: `<img onerror=alert(1)>${"a".repeat(800)}`, artists: [], album: null, artworkRef: null } },
      { state: "connected", stale: false, diagnosticReference: null }, config, "landscape", now, now)!;
    const { container } = render(<MusicWidget projection={value} resolveAsset={resolver} nowEpochMs={now} />);
    const shadow = shadowOf(container)!;
    expect(shadow.querySelector('.sj-content[data-view="compact"]')).not.toBeNull();
    expect(shadow.querySelector(".sj-artwork")).toBeNull();
    expect(shadow.querySelector(".sj-title")?.textContent).toContain("<img");
    expect(shadow.querySelector(".sj-title img")).toBeNull();
    expect(shadow.querySelector(".sj-artists")?.textContent).toBe("Unknown artist");
    expect(shadow.querySelector(".sj-album")).toBeNull();
  });

  it("keeps unknown timing unknown and pauses the progress clock", () => {
    const unknown = { ...snapshot, durationMs: null, positionMs: null, playbackState: "paused" as const };
    const view = render(<MusicWidget projection={fixture(unknown)} resolveAsset={resolver} nowEpochMs={now + 5_000} />);
    expect(shadowOf(view.container)?.querySelector(".sj-progress-track")).toBeNull();
    expect(shadowOf(view.container)?.querySelector(".sj-time")).toBeNull();
    view.rerender(<MusicWidget projection={fixture({ ...snapshot, playbackState: "paused" })} resolveAsset={resolver} nowEpochMs={now + 5_000} />);
    expect(shadowOf(view.container)?.querySelector(".sj-time")?.textContent).toBe("0:30 / 2:00");
  });

  it("is fully transparent for null, invalid and stale projections", () => {
    const view = render(<MusicWidget projection={null} resolveAsset={resolver} nowEpochMs={now} />);
    expect(view.container).toBeEmptyDOMElement();
    view.rerender(<MusicWidget projection={{ ...fixture(), layout: { ...fixture().layout, x: -1 } }} resolveAsset={resolver} nowEpochMs={now} />);
    expect(view.container).toBeEmptyDOMElement();
    view.rerender(<MusicWidget projection={fixture()} resolveAsset={resolver} nowEpochMs={now + 45_001} />);
    expect(view.container).toBeEmptyDOMElement();
    view.rerender(<MusicWidget projection={{ ...fixture(), snapshot: { ...snapshot, track: null } }} resolveAsset={resolver} nowEpochMs={now} />);
    expect(view.container).toBeEmptyDOMElement();
  });

  it("attaches one shadow root in StrictMode and removes it when the projection clears", () => {
    const view = render(<StrictMode><MusicWidget projection={fixture()} resolveAsset={resolver} nowEpochMs={now} /></StrictMode>);
    const root = shadowOf(view.container);
    expect(root?.querySelectorAll(".sj-title")).toHaveLength(1);
    view.rerender(<StrictMode><MusicWidget projection={null} resolveAsset={resolver} nowEpochMs={now} /></StrictMode>);
    expect(view.container).toBeEmptyDOMElement();
  });

  it("separates brand opacity, image fit and content insets; removes a failed image", () => {
    const projection = fixture();
    const brand = { assetId: "brand", version: "a".repeat(64), mimeType: "image/png" as const, sizeBytes: 100, durationMs: null };
    projection.assets.push(brand);
    projection.profile.views.full.branding = { assetId: "brand", fit: "cover", xPercent: 20, yPercent: 80, opacity: 35 };
    projection.profile.views.full.contentInsets = { top: 2, right: 4, bottom: 6, left: 8 };
    const { container } = render(<MusicWidget projection={projection} resolveAsset={resolver} nowEpochMs={now} />);
    const shadow = shadowOf(container)!;
    const image = shadow.querySelector(".sj-brand-image") as HTMLImageElement;
    expect(image.style.objectFit).toBe("cover");
    expect(image.style.opacity).toBe("0.35");
    expect((shadow.querySelector(".sj-frame") as HTMLElement).style.opacity).toBe("0.84");
    expect([...shadow.querySelectorAll("style")].some(style => style.textContent?.includes("inset: 2px 4px 6px 8px"))).toBe(true);
    fireEvent.error(image);
    expect(shadow.querySelector(".sj-brand-image")).toBeNull();
    expect(shadow.querySelector(".sj-frame")).not.toBeNull();
  });

  it("validates enabled CSS at runtime, clears it on disable and falls back on invalid source", async () => {
    const projection = fixture();
    projection.css = { source: ".sj-title{color:red}", enabled: true, styleContractVersion: 1 };
    const view = render(<MusicWidget projection={projection} resolveAsset={resolver} nowEpochMs={now} />);
    await waitFor(() => expect([...shadowOf(view.container)!.querySelectorAll("style")].some(style => style.textContent?.includes("color:red"))).toBe(true));
    view.rerender(<MusicWidget projection={{ ...projection, css: { ...projection.css, enabled: false } }} resolveAsset={resolver} nowEpochMs={now} />);
    await waitFor(() => expect([...shadowOf(view.container)!.querySelectorAll("style")].some(style => style.textContent?.includes("color:red"))).toBe(false));
    view.rerender(<MusicWidget projection={{ ...projection, css: { ...projection.css, source: ".sj-title{background:url(https://bad.example/a)}" } }} resolveAsset={resolver} nowEpochMs={now} />);
    await waitFor(() => expect([...shadowOf(view.container)!.querySelectorAll("style")].some(style => style.textContent?.includes("bad.example"))).toBe(false));
  });

  it("installs a reduced-motion guard before author styles", () => {
    const { container } = render(<MusicWidget projection={fixture()} resolveAsset={resolver} nowEpochMs={now} reducedMotion />);
    const styles = shadowOf(container)!.querySelectorAll("style");
    expect(styles[0]?.textContent).toContain("*::before, *::after { animation: none !important");
    expect(styles[0]?.textContent).toContain("@layer sj-motion, sj-native, sj-custom");
  });
});
