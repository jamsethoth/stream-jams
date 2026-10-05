import { musicLimits, targetProfileDefinitions, clampMusicComponentRect, moveMusicComponentRect, musicComponentRoles, resizeMusicComponentRect, type MusicAppearance, type MusicAssetResolver, type MusicComponentLayout, type MusicComponentRect, type MusicComponentRole, type MusicWidgetProjection } from "@stream-jams/core";
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { MusicWidget } from "../../overlay/components/MusicWidget.js";
import { snapEditorRect } from "../editor/snapping.js";
import { MusicNumberField } from "./MusicNumberField.js";
import { resizeMusicAppearance } from "./music-widget-size.js";
import "./music-layout-editor.css";

export interface MusicLayoutEditorProps {
  readonly projection: MusicWidgetProjection | null;
  readonly resolveAsset: MusicAssetResolver;
  readonly appearance: MusicAppearance;
  readonly onChange: (appearance: MusicAppearance) => void;
  readonly onSelectComponent?: (role: MusicComponentRole) => void;
}

const labels: Record<MusicComponentRole, string> = { artwork: "Artwork", title: "Title", details: "Artists and album", progress: "Progress", time: "Time" };
const selectors: Record<MusicComponentRole, string> = { artwork: ".sj-artwork", title: ".sj-title", details: ".sj-details", progress: ".sj-progress-track", time: ".sj-time" };
type Gesture = { pointerId: number; role: MusicComponentRole; mode: "move" | "resize"; clientX: number; clientY: number; startRect: MusicComponentRect; startLayout: MusicComponentLayout };

/** The handles are management-only siblings of the production Shadow DOM widget. */
export function MusicLayoutEditor({ projection, resolveAsset, appearance, onChange, onSelectComponent }: MusicLayoutEditorProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const widgetGesture = useRef<{ pointerId: number; clientX: number; clientY: number; factor: number; appearance: MusicAppearance } | null>(null);
  const [availableWidth, setAvailableWidth] = useState(700);
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<MusicComponentRole>("title");
  const selectComponent = (role: MusicComponentRole) => { setSelected(role); onSelectComponent?.(role); };
  const [snapGrid, setSnapGrid] = useState(true);
  const [snapAlignment, setSnapAlignment] = useState(true);
  const [guides, setGuides] = useState<ReturnType<typeof snapEditorRect>["guides"]>([]);
  const customCssActive = projection?.css.enabled === true && projection.css.source.trim() !== "";
  const displayed = projection?.profile.views[projection.view] ?? appearance;
  const bounds = { width: displayed.widthPx, height: displayed.heightPx };
  const target = targetProfileDefinitions.find(profile => profile.id === projection?.targetProfileId);
  const maxWidth = Math.min(musicLimits.widthPx.max, target?.width ?? musicLimits.widthPx.max);
  const maxHeight = Math.min(musicLimits.heightPx.max, target?.height ?? musicLimits.heightPx.max);
  const scale = Math.min(1, Math.max(0.5, availableWidth / bounds.width));
  const preview = projection === null ? null : {
    ...projection,
    layout: { ...projection.layout, x: 0, y: 0 },
    profile: { ...projection.profile, views: { ...projection.profile.views, [projection.view]: displayed } }
  };

  useEffect(() => {
    const shell = shellRef.current;
    if (shell === null) return;
    const measure = () => setAvailableWidth(Math.max(1, shell.clientWidth - 24));
    measure();
    if (typeof ResizeObserver === "undefined") { window.addEventListener("resize", measure); return () => window.removeEventListener("resize", measure); }
    const observer = new ResizeObserver(measure);
    observer.observe(shell);
    return () => observer.disconnect();
  }, []);

  const resizeWidget = (width: number, height: number, start = appearance) => onChange(resizeMusicAppearance(start, width, height, maxWidth, maxHeight));
  const cancelWidgetResize = () => {
    const active = widgetGesture.current;
    widgetGesture.current = null;
    if (active !== null) onChange(active.appearance);
  };
  const beginWidgetResize = (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault(); event.stopPropagation(); event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    widgetGesture.current = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY,
      factor: bounds.width / Math.max(1, stageRef.current?.getBoundingClientRect().width ?? bounds.width * scale), appearance };
  };
  const moveWidgetResize = (event: PointerEvent<HTMLButtonElement>) => {
    const active = widgetGesture.current;
    if (active === null || active.pointerId !== event.pointerId) return;
    const width = active.appearance.widthPx + (event.clientX - active.clientX) * active.factor;
    const height = active.appearance.heightPx + (event.clientY - active.clientY) * active.factor;
    resizeWidget(snapGrid ? Math.round(width / 10) * 10 : width, snapGrid ? Math.round(height / 10) * 10 : height, active.appearance);
  };
  const widgetKeys = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Escape") { event.preventDefault(); cancelWidgetResize(); return; }
    const step = event.shiftKey ? 10 : 1;
    const delta: Record<string, readonly [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const direction = delta[event.key];
    if (direction === undefined) return;
    event.preventDefault(); resizeWidget(appearance.widthPx + direction[0], appearance.heightPx + direction[1]);
  };

  const updateRect = (role: MusicComponentRole, rect: MusicComponentRect) => {
    if (appearance.componentLayout === null) return;
    onChange({ ...appearance, componentLayout: { ...appearance.componentLayout, [role]: clampMusicComponentRect(rect, bounds) } });
  };
  const seedFromRenderedWidget = (): MusicComponentLayout | null => {
    const host = stageRef.current?.querySelector<HTMLElement>(".music-widget-host");
    const shadow = host?.shadowRoot;
    if (host === undefined || host === null || shadow === null || shadow === undefined) return null;
    const hostRect = host.getBoundingClientRect();
    const ratio = hostRect.width / bounds.width;
    if (ratio <= 0) return null;
    const result = {} as Record<MusicComponentRole, MusicComponentRect>;
    for (const role of musicComponentRoles) {
      const element = shadow.querySelector<HTMLElement>(selectors[role]);
      const rect = element?.getBoundingClientRect();
      const reference = result.details ?? result.title ?? { x: 0, y: 0, width: Math.min(80, bounds.width), height: Math.min(20, bounds.height) };
      const fallback = role === "artwork"
        ? { x: displayed.contentInsets.left + displayed.paddingXPx, y: displayed.contentInsets.top + displayed.paddingYPx,
          width: Math.max(1, displayed.artworkSizePx), height: Math.max(1, displayed.artworkSizePx) }
        : role === "progress" ? { x: reference.x, y: reference.y + reference.height + 8, width: reference.width, height: 5 }
          : role === "time" ? { x: reference.x, y: reference.y + reference.height + 16, width: reference.width, height: 16 }
            : reference;
      result[role] = rect === undefined || rect.width <= 0 || rect.height <= 0
        ? clampMusicComponentRect(fallback, bounds)
        : clampMusicComponentRect({ x: Math.round((rect.left - hostRect.left) / ratio), y: Math.round((rect.top - hostRect.top) / ratio), width: Math.round(rect.width / ratio), height: Math.round(rect.height / ratio) }, bounds);
    }
    return result;
  };
  const beginEditing = () => {
    if (customCssActive || projection === null) return;
    if (appearance.componentLayout === null) {
      const seeded = seedFromRenderedWidget();
      if (seeded === null) return;
      onChange({ ...appearance, componentLayout: seeded });
    }
    setEditing(true);
  };
  const beginGesture = (role: MusicComponentRole, mode: Gesture["mode"], event: PointerEvent<HTMLButtonElement>) => {
    if (!editing || customCssActive || appearance.componentLayout === null) return;
    event.preventDefault();
    event.stopPropagation();
    selectComponent(role);
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    setGuides([]);
    gesture.current = { pointerId: event.pointerId, role, mode, clientX: event.clientX, clientY: event.clientY,
      startRect: appearance.componentLayout[role], startLayout: appearance.componentLayout };
  };
  const moveGesture = (event: PointerEvent<HTMLButtonElement>) => {
    const active = gesture.current;
    if (active === null || active.pointerId !== event.pointerId) return;
    const stageWidth = stageRef.current?.getBoundingClientRect().width ?? bounds.width * scale;
    const factor = bounds.width / Math.max(1, stageWidth);
    const dx = Math.round((event.clientX - active.clientX) * factor);
    const dy = Math.round((event.clientY - active.clientY) * factor);
    const raw = active.mode === "move"
      ? moveMusicComponentRect(active.startRect, dx, dy, bounds)
      : resizeMusicComponentRect(active.startRect, dx, dy, bounds);
    const observed = projection?.snapshot;
    const visiblePeer = (role: MusicComponentRole) => {
      if (role === "artwork") return displayed.artworkSizePx > 0 && projection?.view !== "compact";
      if (role === "progress") return observed !== undefined && observed.durationMs !== null && observed.durationMs > 0 && observed.positionMs !== null;
      if (role === "time") return observed !== undefined && observed.durationMs !== null;
      return true;
    };
    const snapped = snapGrid || snapAlignment ? snapEditorRect(raw, {
      mode: active.mode, bounds, peers: musicComponentRoles.filter(role => role !== active.role && visiblePeer(role)).map(role => active.startLayout[role]),
      grid: snapGrid, alignment: snapAlignment, scale: 1 / factor
    }) : null;
    const next = snapped?.rect ?? raw;
    setGuides(snapped?.guides ?? []);
    updateRect(active.role, next);
  };
  const endGesture = (event: PointerEvent<HTMLButtonElement>) => {
    if (gesture.current?.pointerId === event.pointerId) { gesture.current = null; setGuides([]); }
  };
  const cancelGesture = () => {
    const active = gesture.current;
    setGuides([]);
    if (active === null) return;
    gesture.current = null;
    onChange({ ...appearance, componentLayout: active.startLayout });
  };
  const keyAdjust = (role: MusicComponentRole, mode: Gesture["mode"], event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      const pointerId = gesture.current?.pointerId;
      if (pointerId !== undefined && event.currentTarget.hasPointerCapture?.(pointerId)) event.currentTarget.releasePointerCapture(pointerId);
      cancelGesture();
      return;
    }
    if (appearance.componentLayout === null) return;
    const step = event.shiftKey ? 10 : 1;
    const directions: Record<string, readonly [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const delta = directions[event.key];
    if (delta === undefined) return;
    event.preventDefault();
    selectComponent(role);
    updateRect(role, mode === "move"
      ? moveMusicComponentRect(appearance.componentLayout[role], delta[0], delta[1], bounds)
      : resizeMusicComponentRect(appearance.componentLayout[role], delta[0], delta[1], bounds));
  };
  const activeRect = appearance.componentLayout?.[selected] ?? null;
  const setField = (field: keyof MusicComponentRect, value: number) => {
    if (activeRect === null) return;
    updateRect(selected, { ...activeRect, [field]: value });
  };

  return <div className="music-layout-editor">
    <div className="music-layout-editor__toolbar">
      <span>{appearance.componentLayout === null ? "Automatic component layout" : "Custom component layout"}</span>
      {editing ? <button onClick={() => { gesture.current = null; widgetGesture.current = null; setGuides([]); setEditing(false); }} type="button">Done editing</button>
        : <button disabled={customCssActive || projection === null} onClick={beginEditing} type="button">Edit layout</button>}
      {appearance.componentLayout === null ? null : <button onClick={() => { gesture.current = null; widgetGesture.current = null; setGuides([]); setEditing(false); onChange({ ...appearance, componentLayout: null }); }} type="button">Reset automatic layout</button>}
    </div>
    {customCssActive ? <p className="music-layout-editor__warning" role="status">Custom CSS can override component positions. Disable custom CSS to edit native component layout.</p> : null}
    <div className="music-layout-editor__viewport" ref={shellRef}>
      {preview === null ? <p role="status">Preview is unavailable.</p> : <div className="music-layout-editor__stage" ref={stageRef} style={{ width: bounds.width * scale, height: bounds.height * scale }}>
        <div className="music-layout-editor__scaled" style={{ width: bounds.width, height: bounds.height, transform: `scale(${scale})` }}>
          <MusicWidget projection={preview} resolveAsset={resolveAsset} nowEpochMs={preview.clockReferenceEpochMs} reducedMotion={editing} />
        </div>
        {editing && !customCssActive ? <><div aria-hidden="true" className="music-layout-editor__widget-outline" /><button aria-label="Resize overall widget" className="music-layout-editor__resize music-layout-editor__widget-resize" onPointerDown={beginWidgetResize} onPointerMove={moveWidgetResize} onPointerUp={event => { if (widgetGesture.current?.pointerId === event.pointerId) widgetGesture.current = null; }} onPointerCancel={cancelWidgetResize} onLostPointerCapture={cancelWidgetResize} onKeyDown={widgetKeys} type="button" /></> : null}
        {editing && !customCssActive && appearance.componentLayout !== null ? musicComponentRoles.map(role => {
          const rect = appearance.componentLayout![role];
          return <div className={`music-layout-editor__box${selected === role ? " is-selected" : ""}`} key={role}
            style={{ left: rect.x * scale, top: rect.y * scale, width: rect.width * scale, height: rect.height * scale }}>
            <button aria-label={`Move ${labels[role]}`} aria-pressed={selected === role} className="music-layout-editor__move" onClick={() => selectComponent(role)}
              onKeyDown={event => keyAdjust(role, "move", event)} onLostPointerCapture={cancelGesture} onPointerCancel={cancelGesture}
              onPointerDown={event => beginGesture(role, "move", event)} onPointerMove={moveGesture} onPointerUp={endGesture} type="button" />
            {selected === role ? <button aria-label={`Resize ${labels[role]}`} className="music-layout-editor__resize"
              onKeyDown={event => keyAdjust(role, "resize", event)} onLostPointerCapture={cancelGesture} onPointerCancel={cancelGesture}
              onPointerDown={event => beginGesture(role, "resize", event)} onPointerMove={moveGesture} onPointerUp={endGesture} type="button" /> : null}
          </div>;
        }) : null}
        {editing && gesture.current !== null ? guides.map((guide, index) => <div aria-hidden="true" className={`music-layout-editor__guide music-layout-editor__guide--${guide.axis}`}
          data-snap-axis={guide.axis} data-snap-position={guide.position} key={`${guide.axis}:${guide.position}:${index}`}
          style={guide.axis === "x" ? { left: guide.position * scale } : { top: guide.position * scale }} />) : null}
      </div>}
    </div>
    {editing && !customCssActive ? <div className="music-layout-editor__inspector">
      <div className="music-layout-editor__fields">
        <MusicNumberField label="Preview widget width (px)" value={appearance.widthPx} min={musicLimits.widthPx.min} max={maxWidth} onCommit={width => resizeWidget(width, appearance.heightPx)} />
        <MusicNumberField label="Preview widget height (px)" value={appearance.heightPx} min={musicLimits.heightPx.min} max={maxHeight} onCommit={height => resizeWidget(appearance.widthPx, height)} />
      </div>
      <p>Drag the outer corner to resize the widget. Arrow keys adjust by 1 px; hold Shift for 10 px. Components keep their size and position where they fit.</p>
    </div> : null}
    {editing && !customCssActive ? <div className="music-layout-editor__snapping"><label><input checked={snapGrid} onChange={event => { setSnapGrid(event.currentTarget.checked); setGuides([]); }} type="checkbox" /> Snap to grid</label>{editing ? <label><input checked={snapAlignment} onChange={event => { setSnapAlignment(event.currentTarget.checked); setGuides([]); }} type="checkbox" /> Snap to alignment</label> : null}</div> : null}
    {editing && !customCssActive && activeRect !== null ? <div className="music-layout-editor__inspector">
      <div aria-label="Music component" className="music-layout-editor__roles">{musicComponentRoles.map(role => <button aria-pressed={selected === role} key={role} onClick={() => selectComponent(role)} type="button">{labels[role]}</button>)}</div>
      <div className="music-layout-editor__fields">
        <MusicNumberField label={`${labels[selected]} X (px)`} value={activeRect.x} min={0} max={bounds.width - activeRect.width} onCommit={value => setField("x", value)} />
        <MusicNumberField label={`${labels[selected]} Y (px)`} value={activeRect.y} min={0} max={bounds.height - activeRect.height} onCommit={value => setField("y", value)} />
        <MusicNumberField label={`${labels[selected]} width (px)`} value={activeRect.width} min={1} max={bounds.width - activeRect.x} onCommit={value => setField("width", value)} />
        <MusicNumberField label={`${labels[selected]} height (px)`} value={activeRect.height} min={1} max={bounds.height - activeRect.y} onCommit={value => setField("height", value)} />
      </div>
      <p>Arrow keys move or resize by 1 px; hold Shift for 10 px. Drag a box to move it or its corner to resize. Text box size does not change font size.</p>
    </div> : null}
  </div>;
}
