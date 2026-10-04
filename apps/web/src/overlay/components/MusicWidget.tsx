import { createPortal } from "react-dom";
import { useCallback, useEffect, useId, useState, type CSSProperties } from "react";
import { alertFontPresets, getMusicPositionMs, musicLimits, musicWidgetProjectionSchema } from "@stream-jams/core";
import type { MusicAssetResolver, MusicPublicAssetReference, MusicTypography, MusicWidgetProjection } from "@stream-jams/core";
import nativeCss from "./music-widget.css?inline";

export interface MusicWidgetProps {
  readonly projection: MusicWidgetProjection | null;
  readonly resolveAsset: MusicAssetResolver;
  readonly nowEpochMs?: number;
  readonly reducedMotion?: boolean;
}

const nativeFont = (font: MusicTypography) => alertFontPresets.find(candidate => candidate.id === font.fontPreset)?.fontFamily ?? "system-ui, sans-serif";
const asPixels = (value: number) => `${value}px`;
const clockTime = (milliseconds: number) => `${Math.floor(milliseconds / 60000)}:${String(Math.floor(milliseconds / 1000) % 60).padStart(2, "0")}`;

/** The host owns visibility, clipping and placement. User CSS only reaches documented shadow parts. */
export function MusicWidget({ projection, resolveAsset, nowEpochMs, reducedMotion = false }: MusicWidgetProps) {
  const [shadow, setShadow] = useState<ShadowRoot | null>(null);
  const attachHost = useCallback((node: HTMLDivElement | null) => {
    setShadow(node === null ? null : node.shadowRoot ?? node.attachShadow({ mode: "open" }));
  }, []);
  const [clock, setClock] = useState(() => Date.now());
  const parsed = musicWidgetProjectionSchema.safeParse(projection);
  const widget = parsed.success ? parsed.data : null;
  const playing = widget?.snapshot.playbackState === "playing";
  useEffect(() => {
    if (nowEpochMs !== undefined) return;
    setClock(Date.now());
    const interval = window.setInterval(() => setClock(Date.now()), playing ? 250 : 1000);
    return () => window.clearInterval(interval);
  }, [playing, nowEpochMs]);
  const now = nowEpochMs ?? clock;
  const fresh = widget !== null && widget.snapshot.track !== null && Number.isFinite(now) && now >= 0 &&
    now - widget.snapshot.observedAtEpochMs <= musicLimits.staleAfterMs;
  const frame = fresh ? widget : null;
  if (frame === null) return null;
  return <div className="music-widget-host" data-testid="music-widget" style={{
    position: "absolute", left: frame.layout.x, top: frame.layout.y,
    width: frame.layout.width, height: frame.layout.height,
    zIndex: frame.layout.zIndex, overflow: "hidden", contain: "layout paint style",
    isolation: "isolate", pointerEvents: "none", visibility: "visible"
  }} ref={attachHost}>
    {shadow === null ? null : createPortal(<MusicContents key={`${frame.snapshot.providerId}:${frame.snapshot.generation}`} projection={frame}
      resolveAsset={resolveAsset} nowEpochMs={now} reducedMotion={reducedMotion} />, shadow)}
  </div>;
}

function MusicContents({ projection, resolveAsset, nowEpochMs, reducedMotion }: Required<Omit<MusicWidgetProps, "projection">> & { readonly projection: MusicWidgetProjection }) {
  const instanceId = useId().replace(/[^A-Za-z0-9_-]/g, "_");
  const [compiled, setCompiled] = useState<{ key: string; css: string } | null>(null);
  const css = projection.css;
  const cssKey = `${css.styleContractVersion}:${css.enabled}:${css.source}:${instanceId}`;
  useEffect(() => {
    let active = true;
    setCompiled(null);
    if (css.enabled && css.source.trim() !== "") {
      // Keep the AST compiler outside the normal overlay route graph.
      void import("@stream-jams/core/music-style-policy").then(({ compileMusicCss }) => {
        const result = compileMusicCss(css.source, css.styleContractVersion, instanceId);
        if (active) setCompiled({ key: cssKey, css: result.valid ? result.css : "" });
      }, () => { if (active) setCompiled({ key: cssKey, css: "" }); });
    }
    return () => { active = false; };
  }, [css.enabled, css.source, css.styleContractVersion, cssKey, instanceId]);
  const appearance = projection.profile.views[projection.view];
  const colors = appearance.colors;
  const track = projection.snapshot.track!;
  const asset = (id: string | null): MusicPublicAssetReference | null => id === null ? null : projection.assets.find(value => value.assetId === id) ?? null;
  const assetUrl = (id: string | null): string => {
    const reference = asset(id);
    return reference === null ? "" : resolveAsset.resolveAsset(reference) ?? "";
  };
  const brandUrl = assetUrl(appearance.branding.assetId);
  const artworkUrl = track.artworkRef === null ? "" : resolveAsset.resolveArtwork(track.artworkRef, projection.snapshot) ?? "";
  const [failedImages, setFailedImages] = useState<ReadonlySet<string>>(() => new Set());
  const showBrand = brandUrl !== "" && !failedImages.has(brandUrl);
  const showArtwork = artworkUrl !== "" && !failedImages.has(artworkUrl);
  const titleFont = useMusicFont(assetUrl(appearance.titleFont.fontAssetId), nativeFont(appearance.titleFont));
  const detailsFont = useMusicFont(assetUrl(appearance.detailsFont.fontAssetId), nativeFont(appearance.detailsFont));
  const position = getMusicPositionMs(projection.snapshot, nowEpochMs);
  const duration = projection.snapshot.durationMs;
  const progress = position === null || duration === null || duration <= 0 ? null : Math.min(100, position / duration * 100);
  const contentStyle = {
    "--sj-title-color": colors.title, "--sj-details-color": colors.details,
    "--sj-progress-fill-color": colors.progressFill, "--sj-progress-track-color": colors.progressTrack,
    "--sj-artwork-placeholder-color": colors.artworkPlaceholder, "--sj-border-color": colors.border
  } as CSSProperties;
  const savedStyle = `.sj-content {
    --sj-title-font: ${titleFont}; --sj-details-font: ${detailsFont};
    --sj-title-size: ${asPixels(appearance.titleFont.fontSizePx)}; --sj-details-size: ${asPixels(appearance.detailsFont.fontSizePx)};
    --sj-title-weight: ${appearance.titleFont.fontWeight}; --sj-details-weight: ${appearance.detailsFont.fontWeight};
    --sj-title-spacing: ${asPixels(appearance.titleFont.letterSpacingPx)}; --sj-details-spacing: ${asPixels(appearance.detailsFont.letterSpacingPx)};
    --sj-title-style: ${appearance.titleFont.italic ? "italic" : "normal"}; --sj-details-style: ${appearance.detailsFont.italic ? "italic" : "normal"};
    --sj-title-decoration: ${appearance.titleFont.underline ? "underline" : "none"}; --sj-details-decoration: ${appearance.detailsFont.underline ? "underline" : "none"};
    --sj-art-size: ${asPixels(appearance.artworkSizePx)}; --sj-gap: ${asPixels(appearance.gapPx)};
    padding: ${appearance.paddingYPx}px ${appearance.paddingXPx}px;
    inset: ${appearance.contentInsets.top}px ${appearance.contentInsets.right}px ${appearance.contentInsets.bottom}px ${appearance.contentInsets.left}px;
  }`;
  const markFailed = (url: string) => setFailedImages(current => new Set(current).add(url));
  const reducedMotionCss = `@layer sj-motion, sj-native, sj-custom; @layer sj-motion { @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; } } ${reducedMotion ? "*, *::before, *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; }" : ""} }`;
  return <>
    <style>{reducedMotionCss}</style><style>{`@layer sj-native { ${nativeCss} ${savedStyle} }`}</style>
    {compiled?.key !== cssKey || compiled.css === "" ? null : <style>{`@layer sj-custom { ${compiled.css} }`}</style>}
    <div className="sj-frame" style={{
      borderRadius: appearance.cornerRadiusPx, border: `${appearance.borderWidthPx}px solid ${colors.border}`,
      boxShadow: `${appearance.shadow.offsetX}px ${appearance.shadow.offsetY}px ${appearance.shadow.blur}px ${appearance.shadow.spread}px ${appearance.shadow.color}`,
      background: `linear-gradient(135deg, ${colors.backgroundStart}, ${colors.backgroundEnd})`,
      opacity: projection.profile.backgroundOpacity / 100
    }} />
    {showBrand ? <div className="sj-brand-layer"><img className="sj-brand-image" alt="" src={brandUrl} onError={() => markFailed(brandUrl)}
      style={{ objectFit: appearance.branding.fit, objectPosition: `${appearance.branding.xPercent}% ${appearance.branding.yPercent}%`, opacity: appearance.branding.opacity / 100 }} /></div> : null}
    <div className="sj-content" data-view={projection.view} data-theme={projection.profile.theme}
      data-playback-state={projection.snapshot.playbackState} style={contentStyle}>
      {appearance.artworkSizePx > 0 ? <div className="sj-artwork" role="img" aria-label="Album artwork">
        {showArtwork ? <img src={artworkUrl} alt="" onError={() => markFailed(artworkUrl)} /> : null}
      </div> : null}
      <div className="sj-copy">
        <div className="sj-title" dir="auto" title={track.title}>{track.title || "Unknown title"}</div>
        <div className="sj-artists" dir="auto" title={track.artists.join(", ")}>{track.artists.filter(Boolean).join(", ") || "Unknown artist"}</div>
        {track.album ? <div className="sj-album" dir="auto" title={track.album}>{track.album}</div> : null}
        {track.attribution ? <a className="sj-attribution" href={track.attribution.url} rel="noopener noreferrer" target="_blank">{track.attribution.label}</a> : null}
        {progress === null ? null : <div className="sj-progress-track" role="progressbar" aria-label="Playback progress" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}>
          <div className="sj-progress-fill" style={{ width: `${progress}%` }} />
        </div>}
        {duration === null ? null : <div className="sj-time">{position === null ? "–" : clockTime(position)} / {clockTime(duration)}</div>}
      </div>
    </div>
  </>;
}

function useMusicFont(url: string, fallback: string): string {
  const [loaded, setLoaded] = useState<{ url: string; family: string } | null>(null);
  useEffect(() => {
    if (!url || typeof FontFace === "undefined") return;
    let active = true;
    const family = `sj-music-${crypto.randomUUID()}`;
    const face = new FontFace(family, `url(${JSON.stringify(url)})`);
    void face.load().then(() => {
      if (!active) return;
      document.fonts.add(face);
      setLoaded({ url, family });
    }, () => undefined);
    return () => { active = false; document.fonts.delete(face); };
  }, [url]);
  return loaded?.url === url ? `${loaded.family}, ${fallback}` : fallback;
}
