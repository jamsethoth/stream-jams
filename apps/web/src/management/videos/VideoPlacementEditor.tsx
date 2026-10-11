import { Button, Checkbox, TextInput } from "@mantine/core";
import { createDefaultVideosLayout, videosCanvas, videosLayoutLimits, type VideosLayout } from "@stream-jams/core";
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { VideoBox, VideoCaption, videoFrameStyle } from "../../overlay/components/OverlaySurface.js";
import { snapEditorRect, type SnapGuide } from "../editor/snapping.js";
import "./video-placement.css";

export interface VideoPlacementEditorProps {
  readonly value: VideosLayout;
  readonly onChange: (layout: VideosLayout) => void;
  readonly disabled?: boolean | undefined;
}

type Gesture = { readonly pointerId: number; readonly mode: "move" | "resize"; readonly clientX: number; readonly clientY: number; readonly factor: number; readonly start: VideosLayout };

const bounds = videosCanvas;
const { minWidth, minHeight } = videosLayoutLimits;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function moveLayout(layout: VideosLayout, x: number, y: number): VideosLayout {
  return { ...layout, x: clamp(Math.round(x), 0, bounds.width - layout.width), y: clamp(Math.round(y), 0, bounds.height - layout.height) };
}

function sizeLayout(layout: VideosLayout, width: number, height: number): VideosLayout {
  return { ...layout, width: clamp(Math.round(width), minWidth, bounds.width - layout.x), height: clamp(Math.round(height), minHeight, bounds.height - layout.y) };
}

/** Pointer resizing keeps the box's proportions, so the picture grows with it; fields and arrow keys stay independent. */
function scaleLayout(start: VideosLayout, factor: number): VideosLayout {
  const lower = Math.max(minWidth / start.width, minHeight / start.height);
  const upper = Math.min((bounds.width - start.x) / start.width, (bounds.height - start.y) / start.height);
  const scale = clamp(factor, Math.min(lower, upper), upper);
  return sizeLayout(start, start.width * scale, start.height * scale);
}

/**
 * Places the Videos box on the 1920 x 1080 canvas with the shared editor snapping. Edits change the
 * page draft only; Save Videos settings applies them to browser sources, the desktop overlay and the mirror.
 */
export function VideoPlacementEditor({ value, onChange, disabled = false }: VideoPlacementEditorProps) {
  const viewport = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const [availableWidth, setAvailableWidth] = useState(800);
  const [grid, setGrid] = useState(true);
  const [alignment, setAlignment] = useState(true);
  const [guides, setGuides] = useState<readonly SnapGuide[]>([]);
  const scale = Math.min(1, availableWidth / bounds.width);

  useEffect(() => {
    const element = viewport.current;
    if (element === null) return;
    const measure = () => setAvailableWidth(Math.max(1, element.clientWidth - 24));
    measure();
    if (typeof ResizeObserver === "undefined") { window.addEventListener("resize", measure); return () => window.removeEventListener("resize", measure); }
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const begin = (mode: Gesture["mode"], event: PointerEvent<HTMLButtonElement>) => {
    if (disabled) return;
    event.preventDefault(); event.stopPropagation(); event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    setGuides([]);
    gesture.current = { pointerId: event.pointerId, mode, clientX: event.clientX, clientY: event.clientY, factor: 1 / scale, start: value };
  };
  const move = (event: PointerEvent<HTMLButtonElement>) => {
    const active = gesture.current;
    if (active === null || active.pointerId !== event.pointerId) return;
    const dx = (event.clientX - active.clientX) * active.factor;
    const dy = (event.clientY - active.clientY) * active.factor;
    const { start } = active;
    if (active.mode === "move") {
      const raw = moveLayout(start, start.x + dx, start.y + dy);
      const snapped = grid || alignment ? snapEditorRect(raw, { mode: "move", bounds, peers: [], grid, alignment, scale: 1 / active.factor, minSize: minHeight }) : null;
      setGuides(snapped?.guides ?? []);
      onChange(snapped === null ? raw : moveLayout(start, snapped.rect.x, snapped.rect.y));
      return;
    }
    // Project the pointer onto the box diagonal so both directions scale the box evenly.
    const raw = scaleLayout(start, 1 + (dx * start.width + dy * start.height) / (start.width ** 2 + start.height ** 2));
    const snapped = grid || alignment ? snapEditorRect(raw, { mode: "resize", bounds, peers: [], grid, alignment, scale: 1 / active.factor, minSize: minHeight }) : null;
    setGuides(snapped?.guides ?? []);
    if (snapped === null) { onChange(raw); return; }
    const byHeight = snapped.guides.some(guide => guide.axis === "y") && !snapped.guides.some(guide => guide.axis === "x");
    onChange(scaleLayout(start, byHeight ? snapped.rect.height / start.height : snapped.rect.width / start.width));
  };
  const end = (event: PointerEvent<HTMLButtonElement>) => {
    if (gesture.current?.pointerId === event.pointerId) { gesture.current = null; setGuides([]); }
  };
  const cancel = () => {
    const active = gesture.current;
    gesture.current = null;
    setGuides([]);
    if (active !== null) onChange(active.start);
  };
  const keys = (mode: Gesture["mode"], event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Escape") {
      if (gesture.current === null) return;
      event.preventDefault();
      const pointerId = gesture.current.pointerId;
      if (event.currentTarget.hasPointerCapture?.(pointerId)) event.currentTarget.releasePointerCapture(pointerId);
      cancel();
      return;
    }
    const step = event.shiftKey ? 10 : 1;
    const directions: Record<string, readonly [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const delta = directions[event.key];
    if (delta === undefined || disabled) return;
    event.preventDefault();
    onChange(mode === "move" ? moveLayout(value, value.x + delta[0], value.y + delta[1]) : sizeLayout(value, value.width + delta[0], value.height + delta[1]));
  };
  const handleProps = (mode: Gesture["mode"]) => ({
    disabled,
    onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => keys(mode, event),
    onLostPointerCapture: cancel,
    onPointerCancel: cancel,
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => begin(mode, event),
    onPointerMove: move,
    onPointerUp: end,
    type: "button" as const
  });

  return <div className="video-placement">
    <p className="module-section-description">Drag the box to move the video, or its corner to resize it. The picture keeps 16:9 inside the box with the title and requester below it.
      Arrow keys move or resize by 1 px; hold Shift for 10 px. Escape cancels a drag.</p>
    <div className="video-placement__viewport" ref={viewport}>
      <div aria-label="Video placement canvas" className="video-placement__stage" role="group" style={{ width: bounds.width * scale, height: bounds.height * scale }}>
        <div aria-hidden="true" className="video-placement__scaled" style={{ width: bounds.width, height: bounds.height, transform: `scale(${scale})` }}>
          <VideoBox data-testid="video-placement-preview" layout={value}>
            <div className="video-overlay__frame video-placement__picture" data-state="playing" style={videoFrameStyle(value)}><span>Video</span></div>
            <VideoCaption layout={value} requester="Viewer" title="Example video title" />
          </VideoBox>
        </div>
        <button aria-label="Move video box" className="video-placement__move" style={{ left: value.x * scale, top: value.y * scale, width: value.width * scale, height: value.height * scale }} {...handleProps("move")} />
        <button aria-label="Resize video box" className="video-placement__resize" style={{ left: (value.x + value.width) * scale - 7, top: (value.y + value.height) * scale - 7 }} {...handleProps("resize")} />
        {guides.map((guide, index) => <div aria-hidden="true" className={`video-placement__guide video-placement__guide--${guide.axis}`} data-snap-axis={guide.axis} data-snap-position={guide.position}
          key={`${guide.axis}:${guide.position}:${index}`} style={guide.axis === "x" ? { left: guide.position * scale } : { top: guide.position * scale }} />)}
      </div>
    </div>
    <fieldset className="video-placement__fields" disabled={disabled}>
      <legend>Video box (px on a 1920 x 1080 canvas)</legend>
      <PlacementNumberField label="Video X (px)" value={value.x} min={0} max={bounds.width - value.width} onCommit={x => onChange(moveLayout(value, x, value.y))} />
      <PlacementNumberField label="Video Y (px)" value={value.y} min={0} max={bounds.height - value.height} onCommit={y => onChange(moveLayout(value, value.x, y))} />
      <PlacementNumberField label="Video width (px)" value={value.width} min={minWidth} max={bounds.width - value.x} onCommit={width => onChange(sizeLayout(value, width, value.height))} />
      <PlacementNumberField label="Video height (px)" value={value.height} min={minHeight} max={bounds.height - value.y} onCommit={height => onChange(sizeLayout(value, value.width, height))} />
    </fieldset>
    <div className="video-placement__actions">
      <Checkbox label="Snap to grid" checked={grid} onChange={event => { setGrid(event.currentTarget.checked); setGuides([]); }} />
      <Checkbox label="Snap to alignment" checked={alignment} onChange={event => { setAlignment(event.currentTarget.checked); setGuides([]); }} />
      <Button variant="default" disabled={disabled} onClick={() => { gesture.current = null; setGuides([]); onChange(createDefaultVideosLayout()); }}>Reset to default placement</Button>
    </div>
  </div>;
}

/**
 * Whole-pixel field that commits on blur or Enter, as the Music placement fields do; an out-of-range
 * draft shows its correction and is never applied. Kept local so this lazy page adds no shared chunk.
 */
function PlacementNumberField({ label, value, min, max, onCommit }: { readonly label: string; readonly value: number; readonly min: number; readonly max: number; readonly onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  const [error, setError] = useState(false);
  useEffect(() => { setDraft(String(value)); setError(false); }, [value]);
  const commit = () => {
    const next = Number(draft);
    if (draft.trim() === "" || !Number.isInteger(next) || next < min || next > max) { setError(true); return; }
    setError(false); onCommit(next);
  };
  return <TextInput label={label} error={error ? `Enter a whole number from ${min} to ${max}.` : false} errorProps={{ role: "alert" }} max={max} min={min} step={1} type="number" value={draft}
    onBlur={commit} onChange={event => { setDraft(event.currentTarget.value); setError(false); }} onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }} />;
}
