import { projectTimerStack, timerProfileDimensions, type OverlayTargetProfileId, type TimerRunState, type TimersOverlayModuleConfig } from "@stream-jams/core";
import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { TimerStack } from "../../overlay/components/TimerStack.js";

export function TimerStackEditor({ value, onChange }: {
  readonly value: TimersOverlayModuleConfig;
  readonly onChange: (value: TimersOverlayModuleConfig) => void;
}) {
  const [profile, setProfile] = useState<OverlayTargetProfileId>("landscape");
  const region = value.profiles[profile]; const bounds = timerProfileDimensions[profile];
  const previewScale = Math.min(1, 420 / bounds.width);
  const gesture = useRef<{ mode: "move" | "resize"; clientX: number; clientY: number; layout: typeof region.layout } | null>(null);
  const stack = useMemo(() => projectTimerStack({ nowEpochMs: 0, targetProfileId: profile, region, runs: sampleRuns(region.maxVisible + 2) }), [profile, region]);
  const update = (patch: Partial<typeof region>) => onChange({ profiles: { ...value.profiles, [profile]: { ...region, ...patch } } });
  const updateLayout = (field: "x" | "y" | "width" | "height", next: number) => {
    const layout = { ...region.layout, [field]: next };
    layout.width = Math.min(layout.width, bounds.width - layout.x); layout.height = Math.min(layout.height, bounds.height - layout.y);
    update({ layout });
  };
  const slotWidth = region.orientation === "horizontal" ? region.layout.width / region.maxVisible : region.layout.width;
  const slotHeight = region.orientation === "vertical" ? region.layout.height / region.maxVisible : region.layout.height;
  const beginGesture = (mode: "move" | "resize", event: PointerEvent<HTMLButtonElement>) => {
    gesture.current = { mode, clientX: event.clientX, clientY: event.clientY, layout: region.layout }; event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveGesture = (event: PointerEvent<HTMLButtonElement>) => {
    const current = gesture.current; if (current === null) return;
    const dx = Math.round((event.clientX - current.clientX) / previewScale); const dy = Math.round((event.clientY - current.clientY) / previewScale);
    if (current.mode === "move") update({ layout: { ...current.layout, x: Math.max(0, Math.min(bounds.width - current.layout.width, current.layout.x + dx)), y: Math.max(0, Math.min(bounds.height - current.layout.height, current.layout.y + dy)) } });
    else update({ layout: { ...current.layout, width: Math.max(1, Math.min(bounds.width - current.layout.x, current.layout.width + dx)), height: Math.max(1, Math.min(bounds.height - current.layout.y, current.layout.height + dy)) } });
  };
  const keyAdjust = (mode: "move" | "resize", event: KeyboardEvent<HTMLButtonElement>) => {
    const delta = event.shiftKey ? 10 : 1; const arrows: Record<string, readonly [number, number]> = { ArrowLeft: [-delta, 0], ArrowRight: [delta, 0], ArrowUp: [0, -delta], ArrowDown: [0, delta] };
    const change = arrows[event.key]; if (change === undefined) return; event.preventDefault();
    if (mode === "move") update({ layout: { ...region.layout, x: Math.max(0, Math.min(bounds.width - region.layout.width, region.layout.x + change[0])), y: Math.max(0, Math.min(bounds.height - region.layout.height, region.layout.y + change[1])) } });
    else update({ layout: { ...region.layout, width: Math.max(1, Math.min(bounds.width - region.layout.x, region.layout.width + change[0])), height: Math.max(1, Math.min(bounds.height - region.layout.y, region.layout.height + change[1])) } });
  };
  return <section className="timer-layout" aria-labelledby="timer-layout-heading">
    <div className="timer-section-heading"><div><p className="management-eyebrow">Overlay layout</p><h3 id="timer-layout-heading">Timer stack</h3></div>
      <div aria-label="Timer profile" role="tablist">{(["landscape", "vertical"] as const).map(id => <button aria-selected={profile === id} key={id} onClick={() => setProfile(id)} role="tab" type="button">{id === "landscape" ? "Landscape" : "Vertical"}</button>)}</div></div>
    <div className="timer-layout__controls">
      <label>Orientation<select value={region.orientation} onChange={event => update({ orientation: event.currentTarget.value as typeof region.orientation })}><option value="vertical">Vertical</option><option value="horizontal">Horizontal</option></select></label>
      <label>Maximum shown<input min="1" max="12" type="number" value={region.maxVisible} onChange={event => update({ maxVisible: Number(event.currentTarget.value) })} /></label>
      {(["x", "y", "width", "height"] as const).map(field => <label key={field}>{field.toUpperCase()}<input min={field === "width" || field === "height" ? 1 : 0} max={field === "x" || field === "width" ? bounds.width : bounds.height} type="number" value={region.layout[field]} onChange={event => updateLayout(field, Number(event.currentTarget.value))} /></label>)}
    </div>
    {slotWidth < 180 || slotHeight < 56 ? <p className="timer-layout__warning" role="status">Timer cards may be difficult to read at this size.</p> : null}
    <div aria-label={`${profile} timer preview`} className="timer-layout__preview" style={{ width: bounds.width * previewScale, height: bounds.height * previewScale }}>
      <div style={{ transform: `scale(${previewScale})`, transformOrigin: "top left", width: bounds.width, height: bounds.height }}><TimerStack stack={stack} resolveAssetUrl={() => ""} now={() => 0} /></div>
      <button aria-label="Move timer region" className="timer-layout__region-handle" onKeyDown={event => keyAdjust("move", event)} onPointerDown={event => beginGesture("move", event)} onPointerMove={moveGesture} onPointerUp={() => { gesture.current = null; }} style={{ left: region.layout.x * previewScale, top: region.layout.y * previewScale, width: region.layout.width * previewScale, height: region.layout.height * previewScale }} type="button" />
      <button aria-label="Resize timer region" className="timer-layout__resize-handle" onKeyDown={event => keyAdjust("resize", event)} onPointerDown={event => beginGesture("resize", event)} onPointerMove={moveGesture} onPointerUp={() => { gesture.current = null; }} style={{ left: (region.layout.x + region.layout.width) * previewScale - 16, top: (region.layout.y + region.layout.height) * previewScale - 16 }} type="button" />
    </div>
  </section>;
}

function sampleRuns(count: number): TimerRunState[] {
  return Array.from({ length: count }, (_, index) => ({ status: "paused", definitionId: `preview-${index}`, generation: `preview-${index}`,
    snapshot: { id: `preview-${index}`, label: index === 0 ? "A very long timer name that will truncate" : `Timer ${index + 1}`, durationMs: 60_000,
      iconAssetId: null, startAudioAssetId: null, endAudioAssetId: null, outputs: { browserSource: true, deviceRouteIds: [] } }, remainingMs: (index + 1) * 15_000 }));
}
