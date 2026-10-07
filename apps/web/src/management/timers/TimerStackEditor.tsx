import { NativeSelect, SegmentedControl, TextInput } from "@mantine/core";
import { projectTimerStack, timerProfileDimensions, timerStackRegionSchema, type OverlayTargetProfileId, type TimerDefinition, type TimerRunState, type TimersOverlayModuleConfig } from "@stream-jams/core";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { TimerStack } from "../../overlay/components/TimerStack.js";
import type { MediaPreviewApi } from "../assets/media-preview-api.js";
import { useMediaPreviewGroup } from "../assets/use-media-preview-group.js";

const geometryLabels = { x: "X", y: "Y", width: "Width", height: "Height" } as const;

export function TimerStackEditor({ assetApi, definitions, value, onChange }: {
  readonly assetApi: MediaPreviewApi;
  readonly definitions?: readonly TimerDefinition[];
  readonly value: TimersOverlayModuleConfig;
  readonly onChange: (value: TimersOverlayModuleConfig) => void;
}) {
  const [profile, setProfile] = useState<OverlayTargetProfileId>("landscape");
  const [availableWidth, setAvailableWidth] = useState(840);
  const ids = (definitions ?? []).flatMap(definition => definition.iconAssetId === null ? [] : [definition.iconAssetId]);
  const { group, descriptors } = useMediaPreviewGroup(assetApi, ids);
  const previewAssetUrls = useMemo(() => new Map(Object.entries(descriptors).map(([id, descriptor]) => [id, descriptor.url])), [descriptors]);
  const resolvePreviewAssetUrl = useCallback((assetId: string) => previewAssetUrls.get(assetId) ?? null, [previewAssetUrls]);
  const previewShell = useRef<HTMLDivElement>(null);
  const sourceKey = [...previewAssetUrls.values()].join("\u0000");
  useEffect(() => {
    const cleanups: (() => void)[] = [];
    if (group !== null) for (const image of previewShell.current?.querySelectorAll("img") ?? []) {
      const id = Object.entries(descriptors).find(([, descriptor]) => image.getAttribute("src") === descriptor.url)?.[0];
      if (id !== undefined) cleanups.push(group.registerElement(image, id));
    }
    return () => { for (const cleanup of cleanups) cleanup(); };
  }, [group, sourceKey]);
  const region = value.profiles[profile]; const bounds = timerProfileDimensions[profile];
  const previewScale = Math.min(1, availableWidth / bounds.width, 620 / bounds.height);
  const gesture = useRef<{ mode: "move" | "resize"; clientX: number; clientY: number; layout: typeof region.layout } | null>(null);
  const stack = useMemo(() => {
    const parsed = timerStackRegionSchema.safeParse(region);
    return parsed.success ? projectTimerStack({
      nowEpochMs: 0,
      targetProfileId: profile,
      region: parsed.data,
      runs: sampleRuns(definitions ?? [], parsed.data.maxVisible)
    }) : null;
  }, [definitions, profile, region]);
  useEffect(() => {
    const shell = previewShell.current;
    if (shell === null || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry !== undefined) setAvailableWidth(Math.min(960, Math.max(1, entry.contentRect.width)));
    });
    observer.observe(shell);
    return () => observer.disconnect();
  }, []);
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
    <div className="timer-section-heading"><div><h3 id="timer-layout-heading">Timer stack</h3></div>
      <SegmentedControl aria-label="Timer profile" value={profile} onChange={(value) => { if (value === "landscape" || value === "vertical") setProfile(value); }} data={[{ value: "landscape", label: "Landscape" }, { value: "vertical", label: "Vertical" }]} /></div>
    <div className="timer-layout__controls">
      <NativeSelect label="Orientation" value={region.orientation} onChange={event => update({ orientation: event.currentTarget.value as typeof region.orientation })}><option value="vertical">Vertical</option><option value="horizontal">Horizontal</option></NativeSelect>
      <TextInput label="Maximum shown" min="1" max="12" type="number" value={region.maxVisible} onChange={event => update({ maxVisible: Number(event.currentTarget.value) })} />
      {(["x", "y", "width", "height"] as const).map(field => <TextInput key={field} label={geometryLabels[field]} min={field === "width" || field === "height" ? 1 : 0} max={field === "x" || field === "width" ? bounds.width : bounds.height} type="number" value={region.layout[field]} onChange={event => updateLayout(field, Number(event.currentTarget.value))} />)}
    </div>
    {slotWidth < 180 || slotHeight < 56 ? <p className="timer-layout__warning" role="status">Timer cards may be difficult to read at this size.</p> : null}
    <div className="timer-layout__preview-shell" ref={previewShell}>
      {stack === null ? <p role="status">Correct the layout values to preview the timer stack.</p> : <div aria-label={`${profile} timer preview`} className="timer-layout__preview" style={{ width: bounds.width * previewScale, height: bounds.height * previewScale }}>
        <div style={{ transform: `scale(${previewScale})`, transformOrigin: "top left", width: bounds.width, height: bounds.height }}><TimerStack stack={stack} resolveAssetUrl={resolvePreviewAssetUrl} now={() => 0} /></div>
        <button aria-label="Move timer region" className="timer-layout__region-handle" onKeyDown={event => keyAdjust("move", event)} onPointerDown={event => beginGesture("move", event)} onPointerMove={moveGesture} onPointerUp={() => { gesture.current = null; }} style={{ left: region.layout.x * previewScale, top: region.layout.y * previewScale, width: region.layout.width * previewScale, height: region.layout.height * previewScale }} type="button" />
        <button aria-label="Resize timer region" className="timer-layout__resize-handle" onKeyDown={event => keyAdjust("resize", event)} onPointerDown={event => beginGesture("resize", event)} onPointerMove={moveGesture} onPointerUp={() => { gesture.current = null; }} style={{ left: (region.layout.x + region.layout.width) * previewScale - 24, top: (region.layout.y + region.layout.height) * previewScale - 24 }} type="button" />
      </div>}
    </div>
  </section>;
}

function sampleRuns(definitions: readonly TimerDefinition[], maxVisible: number): TimerRunState[] {
  const totalCount = Math.max(maxVisible + 2, definitions.length);
  const visibleExampleCount = Math.max(0, maxVisible - definitions.length);
  const exampleCount = totalCount - definitions.length;
  const snapshots = [
    ...definitions.map(definition => ({
      id: definition.id,
      label: definition.label,
      durationMs: definition.durationMs,
      iconAssetId: definition.iconAssetId,
      startAudioAssetId: definition.startAudioAssetId,
      endAudioAssetId: definition.endAudioAssetId,
      outputs: definition.outputs
    })),
    ...Array.from({ length: exampleCount }, (_, index) => {
      const number = index + 1;
      const isLongVisibleExample = visibleExampleCount > 0 && index === visibleExampleCount - 1;
      return {
        id: `preview-${number}`,
        label: isLongVisibleExample ? `Timer ${number} with a deliberately long name that will be truncated` : `Timer ${number}`,
        durationMs: number * 15_000,
        iconAssetId: null,
        startAudioAssetId: null,
        endAudioAssetId: null,
        outputs: { browserSource: true, deviceRouteIds: [] }
      };
    })
  ];
  return snapshots.map((snapshot, index): TimerRunState => ({
    status: "running",
    definitionId: snapshot.id,
    generation: `preview-${snapshot.id}`,
    snapshot,
    startedAtEpochMs: 0,
    endsAtEpochMs: (index + 1) * 15_000
  }));
}
