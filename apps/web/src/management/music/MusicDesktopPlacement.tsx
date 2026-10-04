import { applyMusicDesktopPlacement, moveMusicComponentRect, projectMusicWidget, type MusicAssetResolver, type MusicModuleConfig, type MusicSnapshot, type SurfaceSettingsView } from "@stream-jams/core";
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { MusicWidget } from "../../overlay/components/MusicWidget.js";
import { snapEditorRect } from "../editor/snapping.js";
import { actionableError } from "../assets/asset-library-utils.js";
import { ManagementErrorBanner } from "../foundation/ManagementErrorBanner.js";
import { defaultSurfaceSettingsApi, type SurfaceSettingsApi } from "../settings/overlay-surfaces-api.js";
import { MusicNumberField } from "./MusicNumberField.js";
import "./music-layout-editor.css";
import "./music-desktop-placement.css";

export interface MusicDesktopPlacementProps {
  readonly config: MusicModuleConfig;
  readonly snapshot: MusicSnapshot;
  readonly now: number;
  readonly resolveAsset: MusicAssetResolver;
  readonly onChange: (config: MusicModuleConfig) => void;
  readonly surfaceApi?: Pick<SurfaceSettingsApi, "load"> | undefined;
}
const bounds = { width: 1920, height: 1080 };
export function MusicDesktopPlacement({ config, snapshot, now, resolveAsset, onChange, surfaceApi = defaultSurfaceSettingsApi }: MusicDesktopPlacementProps) {
  const [view, setView] = useState<"full" | "compact">("full");
  const [width, setWidth] = useState(700);
  const [grid, setGrid] = useState(true);
  const [alignment, setAlignment] = useState(true);
  const [guides, setGuides] = useState<ReturnType<typeof snapEditorRect>["guides"]>([]);
  const [status, setStatus] = useState<SurfaceSettingsView | null>(null);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState<ReturnType<typeof actionableError> | null>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ pointerId: number; clientX: number; clientY: number; scale: number; rect: { x: number; y: number; width: number; height: number }; saved: MusicModuleConfig["desktopPlacement"] } | null>(null);
  const scale = Math.min(1, width / bounds.width);
  const sample = projectMusicWidget(snapshot, { state: "connected", stale: false, diagnosticReference: null }, { ...config, profiles: { ...config.profiles, landscape: { ...config.profiles.landscape, initialView: view, idleMode: "none" } } }, "landscape", now, now);
  const projection = sample === null ? null : applyMusicDesktopPlacement(sample, config);
  const rect = projection?.layout ?? null;
  const blocked = config.css.enabled && config.css.source.trim() !== "";
  useEffect(() => {
    const element = viewport.current;
    if (element === null) return;
    const measure = () => setWidth(Math.max(1, element.clientWidth - 24));
    measure();
    if (typeof ResizeObserver === "undefined") { window.addEventListener("resize", measure); return () => window.removeEventListener("resize", measure); }
    const observer = new ResizeObserver(measure); observer.observe(element); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let cancelled = false; let refreshing = false;
    const refresh = async () => {
      if (refreshing) return;
      refreshing = true;
      try { const result = await surfaceApi.load(); if (!cancelled) { setStatus(result); setError(null); } }
      catch (cause) { if (!cancelled) setError(actionableError(cause, "Unable to refresh desktop overlay status", "Open Overlay settings to check the display and Music visibility, then retry.")); }
      finally { refreshing = false; }
    };
    void refresh(); const timer = window.setInterval(() => { if (document.visibilityState !== "hidden") void refresh(); }, 5000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [surfaceApi, reload]);
  const update = (x: number, y: number) => {
    if (rect === null) return;
    const next = moveMusicComponentRect({ ...rect, x: 0, y: 0 }, x, y, bounds);
    onChange({ ...config, desktopPlacement: { ...config.desktopPlacement, [view]: { x: next.x, y: next.y } } });
  };
  const cancel = () => { const active = gesture.current; gesture.current = null; setGuides([]); if (active !== null) onChange({ ...config, desktopPlacement: active.saved }); };
  const begin = (event: PointerEvent<HTMLButtonElement>) => {
    if (blocked || rect === null) return;
    event.preventDefault(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, scale, rect, saved: config.desktopPlacement };
  };
  const move = (event: PointerEvent<HTMLButtonElement>) => {
    const active = gesture.current; if (active === null || active.pointerId !== event.pointerId) return;
    const raw = moveMusicComponentRect(active.rect, (event.clientX - active.clientX) / active.scale, (event.clientY - active.clientY) / active.scale, bounds);
    const snapped = snapEditorRect(raw, { mode: "move", bounds, peers: [], grid, alignment, scale: active.scale });
    setGuides(snapped.guides); update(snapped.rect.x, snapped.rect.y);
  };
  const keys = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Escape") { event.preventDefault(); cancel(); return; }
    if (rect === null) return;
    const step = event.shiftKey ? 10 : 1;
    const delta: Record<string, readonly [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const direction = delta[event.key]; if (direction === undefined) return;
    event.preventDefault(); update(rect.x + direction[0], rect.y + direction[1]);
  };
  const desktop = status?.surfaces.find(surface => surface.kind === "desktop");
  const visible = desktop?.layers.some(layer => layer.moduleId === "music" && layer.visible) ?? false;
  return <div className="music-desktop-placement">
    <p>Position Music independently on the desktop overlay. The 1920 × 1080 canvas scales to the selected display. Changes apply after Save Music appearance.</p>
    {status === null && error === null ? <p role="status">Loading desktop overlay status…</p> : null}
    {status === null ? null : <p role="status">Desktop overlay: {status.desktop.state}. {desktop?.kind === "desktop" ? `Display: ${desktop.displayLabel ?? "Not selected"}. ${desktop.enabled ? "Enabled" : "Disabled"}. Music ${visible ? "visible" : "hidden"}.` : "No desktop surface configured."}</p>}
    {status?.desktop.message == null ? null : <p>{status.desktop.message}</p>}
    {error === null ? null : <><ManagementErrorBanner error={error} /><button className="button button--secondary" onClick={() => setReload(current => current + 1)} type="button">Refresh desktop status</button>{status === null ? null : <p>Desktop status is stale; the last known settings are shown.</p>}</>}
    <a href="/manage/settings#overlay-surfaces">Open Overlay settings</a>
    <label>Desktop preview view<select value={view} onChange={event => { gesture.current = null; setGuides([]); setView(event.currentTarget.value as typeof view); }}><option value="full">Full</option><option value="compact">Compact</option></select></label>
    {blocked ? <p role="status">Disable custom CSS to edit native desktop placement. CSS can override the widget position.</p> : null}
    <div className="music-desktop-placement__viewport" ref={viewport}>
      {projection === null || rect === null ? <p role="status">Desktop placement preview is unavailable.</p> : <div aria-label="Desktop placement canvas" className="music-desktop-placement__stage" style={{ width: bounds.width * scale, height: bounds.height * scale }}>
        <div className="music-desktop-placement__scaled" style={{ width: bounds.width, height: bounds.height, transform: `scale(${scale})` }}><MusicWidget projection={projection} resolveAsset={resolveAsset} nowEpochMs={now} reducedMotion /></div>
        <button aria-label="Move Music widget on desktop overlay" className="music-desktop-placement__move" disabled={blocked} style={{ left: rect.x * scale, top: rect.y * scale, width: rect.width * scale, height: rect.height * scale }} onPointerDown={begin} onPointerMove={move} onPointerUp={event => { if (gesture.current?.pointerId === event.pointerId) { gesture.current = null; setGuides([]); } }} onLostPointerCapture={cancel} onPointerCancel={cancel} onKeyDown={keys} type="button" />
        {guides.map((guide, index) => <div aria-hidden="true" className={`music-desktop-placement__guide music-desktop-placement__guide--${guide.axis}`} key={`${guide.axis}:${index}`} style={guide.axis === "x" ? { left: guide.position * scale } : { top: guide.position * scale }} />)}
      </div>}
    </div>
    <fieldset disabled={blocked || rect === null}><legend>Desktop widget position</legend>
      <div className="music-layout-editor__fields"><MusicNumberField label="Desktop Music X (px)" value={rect?.x ?? 0} min={0} max={bounds.width - (rect?.width ?? 0)} onCommit={x => update(x, rect?.y ?? 0)} /><MusicNumberField label="Desktop Music Y (px)" value={rect?.y ?? 0} min={0} max={bounds.height - (rect?.height ?? 0)} onCommit={y => update(rect?.x ?? 0, y)} /></div>
      <div className="music-layout-editor__snapping"><label><input checked={grid} onChange={event => { setGrid(event.currentTarget.checked); setGuides([]); }} type="checkbox" /> Snap desktop placement to grid</label><label><input checked={alignment} onChange={event => { setAlignment(event.currentTarget.checked); setGuides([]); }} type="checkbox" /> Snap desktop placement to alignment</label></div>
      <button className="button button--secondary" disabled={config.desktopPlacement[view] === null} onClick={() => { gesture.current = null; setGuides([]); onChange({ ...config, desktopPlacement: { ...config.desktopPlacement, [view]: null } }); }} type="button">Reset desktop placement to alignment</button>
    </fieldset>
    <p>Drag the widget to position it. Arrow keys move by 1 px; Shift moves by 10 px. Escape cancels a drag. Browser-source placement is unchanged.</p>
  </div>;
}
