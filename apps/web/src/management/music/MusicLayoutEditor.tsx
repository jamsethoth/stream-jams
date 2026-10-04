import { clampMusicComponentRect, moveMusicComponentRect, musicComponentRoles, resizeMusicComponentRect, type MusicAppearance, type MusicAssetResolver, type MusicComponentLayout, type MusicComponentRect, type MusicComponentRole, type MusicWidgetProjection } from "@stream-jams/core";
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { MusicWidget } from "../../overlay/components/MusicWidget.js";
import { MusicNumberField } from "./MusicNumberField.js";
import "./music-layout-editor.css";

export interface MusicLayoutEditorProps {
  readonly projection: MusicWidgetProjection | null;
  readonly resolveAsset: MusicAssetResolver;
  readonly appearance: MusicAppearance;
  readonly onChange: (appearance: MusicAppearance) => void;
}

const labels: Record<MusicComponentRole, string> = { artwork: "Artwork", title: "Title", details: "Artists and album", progress: "Progress", time: "Time" };
const selectors: Record<MusicComponentRole, string> = { artwork: ".sj-artwork", title: ".sj-title", details: ".sj-details", progress: ".sj-progress-track", time: ".sj-time" };
type Gesture = { pointerId: number; role: MusicComponentRole; mode: "move" | "resize"; clientX: number; clientY: number; startRect: MusicComponentRect; startLayout: MusicComponentLayout };

/** The handles are management-only siblings of the production Shadow DOM widget. */
export function MusicLayoutEditor({ projection, resolveAsset, appearance, onChange }: MusicLayoutEditorProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const [availableWidth, setAvailableWidth] = useState(700);
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<MusicComponentRole>("title");
  const customCssActive = projection?.css.enabled === true && projection.css.source.trim() !== "";
  const displayed = projection?.profile.views[projection.view] ?? appearance;
  const bounds = { width: displayed.widthPx, height: displayed.heightPx };
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
    setSelected(role);
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
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
    const next = active.mode === "move"
      ? moveMusicComponentRect(active.startRect, dx, dy, bounds)
      : resizeMusicComponentRect(active.startRect, dx, dy, bounds);
    updateRect(active.role, next);
  };
  const endGesture = (event: PointerEvent<HTMLButtonElement>) => {
    if (gesture.current?.pointerId === event.pointerId) gesture.current = null;
  };
  const cancelGesture = () => {
    const active = gesture.current;
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
    setSelected(role);
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
      {editing ? <button onClick={() => { gesture.current = null; setEditing(false); }} type="button">Done editing</button>
        : <button disabled={customCssActive || projection === null} onClick={beginEditing} type="button">Edit component layout</button>}
      {appearance.componentLayout === null ? null : <button onClick={() => { gesture.current = null; setEditing(false); onChange({ ...appearance, componentLayout: null }); }} type="button">Reset automatic layout</button>}
    </div>
    {customCssActive ? <p className="music-layout-editor__warning" role="status">Custom CSS can override component positions. Disable custom CSS to edit native component layout.</p> : null}
    <div className="music-layout-editor__viewport" ref={shellRef}>
      {preview === null ? <p role="status">Preview is unavailable.</p> : <div className="music-layout-editor__stage" ref={stageRef} style={{ width: bounds.width * scale, height: bounds.height * scale }}>
        <div className="music-layout-editor__scaled" style={{ width: bounds.width, height: bounds.height, transform: `scale(${scale})` }}>
          <MusicWidget projection={preview} resolveAsset={resolveAsset} nowEpochMs={preview.clockReferenceEpochMs} reducedMotion={editing} />
        </div>
        {editing && !customCssActive && appearance.componentLayout !== null ? musicComponentRoles.map(role => {
          const rect = appearance.componentLayout![role];
          return <div className={`music-layout-editor__box${selected === role ? " is-selected" : ""}`} key={role}
            style={{ left: rect.x * scale, top: rect.y * scale, width: rect.width * scale, height: rect.height * scale }}>
            <button aria-label={`Move ${labels[role]}`} aria-pressed={selected === role} className="music-layout-editor__move" onClick={() => setSelected(role)}
              onKeyDown={event => keyAdjust(role, "move", event)} onLostPointerCapture={cancelGesture} onPointerCancel={cancelGesture}
              onPointerDown={event => beginGesture(role, "move", event)} onPointerMove={moveGesture} onPointerUp={endGesture} type="button" />
            {selected === role ? <button aria-label={`Resize ${labels[role]}`} className="music-layout-editor__resize"
              onKeyDown={event => keyAdjust(role, "resize", event)} onLostPointerCapture={cancelGesture} onPointerCancel={cancelGesture}
              onPointerDown={event => beginGesture(role, "resize", event)} onPointerMove={moveGesture} onPointerUp={endGesture} type="button" /> : null}
          </div>;
        }) : null}
      </div>}
    </div>
    {editing && !customCssActive && activeRect !== null ? <div className="music-layout-editor__inspector">
      <div aria-label="Music component" className="music-layout-editor__roles">{musicComponentRoles.map(role => <button aria-pressed={selected === role} key={role} onClick={() => setSelected(role)} type="button">{labels[role]}</button>)}</div>
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
