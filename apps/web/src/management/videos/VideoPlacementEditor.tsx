import { Button, Checkbox, TextInput } from "@mantine/core";
import { createDefaultVideosLayout, isValidVideosLayout, videosCanvas, videosLayoutLimits, type VideosLayout } from "@stream-jams/core";
import { useCallback, useEffect, useImperativeHandle, useRef, useState, type KeyboardEvent, type PointerEvent, type Ref } from "react";
import { VideoBox, VideoCaption, videoFrameStyle } from "../../overlay/components/OverlaySurface.js";
import { snapEditorRect, type SnapGuide } from "../editor/snapping.js";
import "./video-placement.css";

export interface VideoPlacementEditorHandle {
  /** Moves focus to the first number field whose visible draft is invalid and shows its correction. */
  focusFirstInvalid(): void;
}

export interface VideoPlacementEditorProps {
  readonly value: VideosLayout;
  readonly onChange: (layout: VideosLayout) => void;
  readonly disabled?: boolean | undefined;
  /** Reports whether any number field holds an invalid draft that was not committed into `value`. */
  readonly onInvalidDraftChange?: ((invalid: boolean) => void) | undefined;
  readonly ref?: Ref<VideoPlacementEditorHandle> | undefined;
}

type FieldId = "width" | "height" | "x" | "y" | "scale";
const fieldOrder: readonly FieldId[] = ["width", "height", "x", "y", "scale"];
interface FieldRegistration { readonly invalid: boolean; readonly reveal: () => void }

type Gesture = { readonly pointerId: number; readonly mode: "move" | "resize"; readonly clientX: number; readonly clientY: number; readonly factor: number; readonly start: VideosLayout };

const bounds = videosCanvas;
const { minWidth, minHeight } = videosLayoutLimits;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const rect = (layout: VideosLayout) => ({ x: layout.desktopPlacement.x, y: layout.desktopPlacement.y,
  width: layout.content.width * layout.desktopPlacement.scale, height: layout.content.height * layout.desktopPlacement.scale });

function moveLayout(layout: VideosLayout, x: number, y: number): VideosLayout {
  const box = rect(layout);
  return { ...layout, desktopPlacement: { ...layout.desktopPlacement,
    x: clamp(x, 0, Math.max(0, bounds.width - box.width)), y: clamp(y, 0, Math.max(0, bounds.height - box.height)) } };
}

/** Pointer resizing keeps the box's proportions, so the picture grows with it; fields and arrow keys stay independent. */
function scaleLayout(start: VideosLayout, scale: number): VideosLayout {
  const upper = Math.min((bounds.width - start.desktopPlacement.x) / start.content.width, (bounds.height - start.desktopPlacement.y) / start.content.height);
  return { ...start, desktopPlacement: { ...start.desktopPlacement, scale: clamp(scale, Math.min(0.01, upper), upper) } };
}

/**
 * Places the Videos box on the 1920 x 1080 canvas with the shared editor snapping. Edits change the
 * page draft only; Save Videos settings applies them to browser sources, the desktop overlay and the mirror.
 */
export function VideoPlacementEditor({ value, onChange, disabled = false, onInvalidDraftChange, ref }: VideoPlacementEditorProps) {
  const viewport = useRef<HTMLDivElement>(null);
  const fields = useRef(new Map<FieldId, FieldRegistration>());
  const reportedInvalid = useRef(false);
  const invalidListener = useRef(onInvalidDraftChange);
  useEffect(() => { invalidListener.current = onInvalidDraftChange; }, [onInvalidDraftChange]);
  const register = useCallback((id: FieldId, registration: FieldRegistration | null) => {
    if (registration === null) fields.current.delete(id); else fields.current.set(id, registration);
    const invalid = [...fields.current.values()].some(field => field.invalid);
    if (invalid !== reportedInvalid.current) { reportedInvalid.current = invalid; invalidListener.current?.(invalid); }
  }, []);
  useImperativeHandle(ref, () => ({
    focusFirstInvalid() { fieldOrder.map(id => fields.current.get(id)).find(field => field?.invalid)?.reveal(); }
  }), []);
  const gesture = useRef<Gesture | null>(null);
  const [availableWidth, setAvailableWidth] = useState(800);
  const [grid, setGrid] = useState(true);
  const [alignment, setAlignment] = useState(true);
  const [guides, setGuides] = useState<readonly SnapGuide[]>([]);
  const scale = Math.min(1, availableWidth / bounds.width);
  const box = rect(value);

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
    const startBox = rect(start);
    if (active.mode === "move") {
      const raw = moveLayout(start, startBox.x + dx, startBox.y + dy);
      const snapped = grid || alignment ? snapEditorRect(rect(raw), { mode: "move", bounds, peers: [], grid, alignment, scale: 1 / active.factor }) : null;
      setGuides(snapped?.guides ?? []);
      onChange(snapped === null ? raw : moveLayout(start, snapped.rect.x, snapped.rect.y));
      return;
    }
    // Project the pointer onto the box diagonal so both directions scale the box evenly.
    const raw = scaleLayout(start, start.desktopPlacement.scale * (1 + (dx * startBox.width + dy * startBox.height) / (startBox.width ** 2 + startBox.height ** 2)));
    const snapped = grid || alignment ? snapEditorRect(rect(raw), { mode: "resize", bounds, peers: [], grid, alignment, scale: 1 / active.factor }) : null;
    setGuides(snapped?.guides ?? []);
    if (snapped === null) { onChange(raw); return; }
    const byHeight = snapped.guides.some(guide => guide.axis === "y") && !snapped.guides.some(guide => guide.axis === "x");
    onChange(scaleLayout(start, byHeight ? snapped.rect.height / start.content.height : snapped.rect.width / start.content.width));
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
    onChange(mode === "move" ? moveLayout(value, box.x + delta[0], box.y + delta[1])
      : scaleLayout(value, value.desktopPlacement.scale + (delta[0] || delta[1]) / value.content.width));
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
    <p className="module-section-description">Content size sets the browser canvas and the video-and-caption appearance. OBS positions the browser source.
      Drag the desktop box or its corner to move or scale only the desktop presentation. Arrow keys move or scale its width by 1 px; hold Shift for 10 px. Escape cancels a drag.</p>
    <div className="video-placement__viewport" ref={viewport}>
      <div aria-label="Video placement canvas" className="video-placement__stage" role="group" style={{ width: bounds.width * scale, height: bounds.height * scale }}>
        <div aria-hidden="true" className="video-placement__scaled" style={{ width: bounds.width, height: bounds.height, transform: `scale(${scale})` }}>
          <VideoBox data-testid="video-placement-preview" layout={value}>
            <div className="video-overlay__frame video-placement__picture" data-state="playing" style={videoFrameStyle(value)}><span>Video</span></div>
            <VideoCaption layout={value} requester="Viewer" title="Example video title" />
          </VideoBox>
        </div>
        <button aria-label="Move video box" className="video-placement__move" style={{ left: box.x * scale, top: box.y * scale, width: box.width * scale, height: box.height * scale }} {...handleProps("move")} />
        <button aria-label="Scale desktop video box" className="video-placement__resize" style={{ left: (box.x + box.width) * scale - 7, top: (box.y + box.height) * scale - 7 }} {...handleProps("resize")} />
        {guides.map((guide, index) => <div aria-hidden="true" className={`video-placement__guide video-placement__guide--${guide.axis}`} data-snap-axis={guide.axis} data-snap-position={guide.position}
          key={`${guide.axis}:${guide.position}:${index}`} style={guide.axis === "x" ? { left: guide.position * scale } : { top: guide.position * scale }} />)}
      </div>
    </div>
    <fieldset className="video-placement__fields" disabled={disabled}>
      <legend>Browser content size (CSS pixels)</legend>
      <PlacementNumberField id="width" register={register} label="Video content width (px)" value={value.content.width} min={minWidth} max={bounds.width} whole onCommit={width => onChange({ ...value, content: { ...value.content, width } })} />
      <PlacementNumberField id="height" register={register} label="Video content height (px)" value={value.content.height} min={minHeight} max={bounds.height} whole onCommit={height => onChange({ ...value, content: { ...value.content, height } })} />
    </fieldset>
    <fieldset className="video-placement__fields" disabled={disabled}>
      <legend>Desktop placement (1920 x 1080 scene)</legend>
      <PlacementNumberField id="x" register={register} label="Desktop Video X (px)" value={value.desktopPlacement.x} min={0} max={Math.max(0, bounds.width - box.width)} onCommit={x => onChange(moveLayout(value, x, box.y))} />
      <PlacementNumberField id="y" register={register} label="Desktop Video Y (px)" value={value.desktopPlacement.y} min={0} max={Math.max(0, bounds.height - box.height)} onCommit={y => onChange(moveLayout(value, box.x, y))} />
      <PlacementNumberField id="scale" register={register} label="Desktop Video scale" value={value.desktopPlacement.scale} min={Number.EPSILON} max={Math.min((bounds.width - box.x) / value.content.width, (bounds.height - box.y) / value.content.height)}
        onCommit={next => onChange({ ...value, desktopPlacement: { ...value.desktopPlacement, scale: next } })} />
    </fieldset>
    {isValidVideosLayout(value) ? null : <p className="videos-settings__error" role="alert">Keep content between 240 x 180 and 1920 x 1080 px, and reduce desktop scale or move the box to fit the scene before saving.</p>}
    <div className="video-placement__actions">
      <Checkbox label="Snap to grid" checked={grid} onChange={event => { setGrid(event.currentTarget.checked); setGuides([]); }} />
      <Checkbox label="Snap to alignment" checked={alignment} onChange={event => { setAlignment(event.currentTarget.checked); setGuides([]); }} />
      <Button variant="default" disabled={disabled} onClick={() => {
        gesture.current = null; setGuides([]);
        const placement = createDefaultVideosLayout().desktopPlacement;
        onChange(moveLayout({ ...value, desktopPlacement: placement }, placement.x, placement.y));
      }}>Reset desktop placement</Button>
      <Button variant="default" disabled={disabled} onClick={() => { gesture.current = null; setGuides([]); onChange(createDefaultVideosLayout()); }}>Reset content and placement</Button>
    </div>
  </div>;
}

/**
 * Whole-pixel field that commits on blur or Enter, as the Music placement fields do; an out-of-range
 * draft shows its correction and is never applied. Kept local so this lazy page adds no shared chunk.
 */
function PlacementNumberField({ id, register, label, value, min, max, whole = false, onCommit }: {
  readonly id: FieldId; readonly register: (id: FieldId, registration: FieldRegistration | null) => void;
  readonly label: string; readonly value: number; readonly min: number; readonly max: number; readonly whole?: boolean; readonly onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const [error, setError] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { setDraft(String(value)); setError(false); }, [value]);
  const next = Number(draft);
  const invalid = draft.trim() === "" || !Number.isFinite(next) || (whole && !Number.isInteger(next)) || next < min || next > max;
  useEffect(() => {
    register(id, { invalid, reveal: () => { setError(true); input.current?.focus(); } });
  }, [id, invalid, register]);
  useEffect(() => () => register(id, null), [id, register]);
  const commit = () => {
    if (invalid) { setError(true); return; }
    setError(false); onCommit(next);
  };
  return <TextInput ref={input} label={label} error={error ? `Enter ${whole ? "a whole number" : "a number"} from ${min} to ${max}.` : false} errorProps={{ role: "alert" }} max={max} min={min} required withAsterisk={false} step={whole ? 1 : "any"} type="number" value={draft}
    onBlur={commit} onChange={event => { setDraft(event.currentTarget.value); setError(false); }} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } }} />;
}
