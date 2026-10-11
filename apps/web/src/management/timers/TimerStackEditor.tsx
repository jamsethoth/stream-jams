import { Button, NativeSelect, SegmentedControl, TextInput } from "@mantine/core";
import { alertFontPresets, projectTimerStack, resolveTimerOutputGeometry, timerProfileDimensions, timersOverlayModuleDefinition, timersOverlayModuleConfigSchema,
  type OverlayTargetProfileId, type TimerAppearance, type TimerDefinition, type TimerProfile, type TimerRunState, type TimersOverlayModuleConfig } from "@stream-jams/core";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { TimerStack } from "../../overlay/components/TimerStack.js";
import type { MediaPreviewApi } from "../assets/media-preview-api.js";
import { useMediaPreviewGroup } from "../assets/use-media-preview-group.js";

const numericAppearance = [
  ["cardWidthPx", "Card width (px)", 1, 1920], ["cardHeightPx", "Card height (px)", 1, 1920],
  ["maxVisible", "Maximum shown", 1, 12], ["stackGapPx", "Stack gap (px)", 0, 128], ["gapPx", "Content gap (px)", 0, 128],
  ["blockPaddingPx", "Vertical padding (px)", 0, 128], ["inlinePaddingPx", "Horizontal padding (px)", 0, 128],
  ["cornerRadiusPx", "Corner radius (px)", 0, 256], ["borderWidthPx", "Border width (px)", 0, 16],
  ["backgroundOpacity", "Background opacity", 0, 1], ["iconSizePx", "Icon size (px)", 0, 256]
] as const;
const colorAppearance = [["borderColor", "Border color"], ["backgroundColor", "Background color"],
  ["runningAccent", "Running accent"], ["pausedAccent", "Paused accent"], ["completedAccent", "Completed accent"]] as const;
const previewNow = () => 0;

export function TimerStackEditor({ assetApi, definitions, value, onChange, validationError }: {
  readonly assetApi: MediaPreviewApi; readonly definitions?: readonly TimerDefinition[];
  readonly value: TimersOverlayModuleConfig; readonly onChange: (value: TimersOverlayModuleConfig) => void;
  readonly validationError?: { readonly path: string; readonly message: string } | null;
}) {
  const [profile, setProfile] = useState<OverlayTargetProfileId>("landscape");
  const [availableWidth, setAvailableWidth] = useState(840);
  const ids = (definitions ?? []).flatMap(definition => definition.iconAssetId === null ? [] : [definition.iconAssetId]);
  const { group, descriptors } = useMediaPreviewGroup(assetApi, ids);
  const previewAssetUrls = useMemo(() => new Map(Object.entries(descriptors).map(([id, descriptor]) => [id, descriptor.url])), [descriptors]);
  const resolvePreviewAssetUrl = useCallback((assetId: string) => previewAssetUrls.get(assetId) ?? null, [previewAssetUrls]);
  const previewShell = useRef<HTMLDivElement>(null);
  const editorRoot = useRef<HTMLElement>(null);
  useEffect(() => {
    if (validationError === undefined || validationError === null) return;
    const invalidProfile = validationError.path.split(".")[1];
    if ((invalidProfile === "landscape" || invalidProfile === "vertical") && profile !== invalidProfile) { setProfile(invalidProfile); return; }
    const path = validationError.path.endsWith("desktopPlacement") ? `${validationError.path}.x` : validationError.path;
    editorRoot.current?.querySelector<HTMLInputElement>(`[data-timer-field="${path}"]`)?.focus();
  }, [profile, validationError]);
  const errorFor = (field: string) => validationError?.path === field || (field.endsWith("desktopPlacement.x") && validationError?.path === field.slice(0, -2)) ? validationError?.message : undefined;
  const sourceKey = [...previewAssetUrls.values()].join("\u0000");
  useEffect(() => {
    const cleanups: (() => void)[] = [];
    if (group !== null) for (const image of previewShell.current?.querySelectorAll("img") ?? []) {
      const id = Object.entries(descriptors).find(([, descriptor]) => image.getAttribute("src") === descriptor.url)?.[0];
      if (id !== undefined) cleanups.push(group.registerElement(image, id));
    }
    return () => { for (const cleanup of cleanups) cleanup(); };
  }, [group, sourceKey]);
  useEffect(() => {
    const shell = previewShell.current;
    if (shell === null || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => { if (entry !== undefined) setAvailableWidth(Math.min(960, Math.max(1, entry.contentRect.width))); });
    observer.observe(shell); return () => observer.disconnect();
  }, []);
  const selected = value.profiles[profile]; const a = selected.appearance; const placement = selected.desktopPlacement;
  const bounds = timerProfileDimensions[profile];
  const previewScale = Math.min(1, availableWidth / bounds.width, 620 / bounds.height);
  const preview = useMemo(() => {
    const parsed = timersOverlayModuleConfigSchema.safeParse(value);
    if (!parsed.success) return null;
    const saved = parsed.data.profiles[profile];
    const geometry = resolveTimerOutputGeometry(saved);
    const runs = sampleRuns(definitions ?? [], saved.appearance.maxVisible);
    return { geometry, browser: projectTimerStack({ nowEpochMs: 0, targetProfileId: profile, profile: saved, geometry, recipientKind: "browser", runs }),
      desktop: projectTimerStack({ nowEpochMs: 0, targetProfileId: profile, profile: saved, geometry, recipientKind: "desktop", runs }) };
  }, [definitions, profile, value]);
  const update = (next: TimerProfile) => onChange({ ...value, profiles: { ...value.profiles, [profile]: next } });
  const updateAppearance = (patch: Partial<TimerAppearance>) => update({ ...selected, appearance: { ...a, ...patch } });
  const updatePlacement = (patch: Partial<TimerProfile["desktopPlacement"]>) => update({ ...selected, desktopPlacement: { ...placement, ...patch } });
  const gesture = useRef<{ mode: "move" | "resize"; clientX: number; clientY: number; placement: TimerProfile["desktopPlacement"] } | null>(null);
  const beginGesture = (mode: "move" | "resize", event: PointerEvent<HTMLButtonElement>) => {
    gesture.current = { mode, clientX: event.clientX, clientY: event.clientY, placement }; event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveGesture = (event: PointerEvent<HTMLButtonElement>) => {
    const current = gesture.current; if (current === null || preview === null) return;
    const dx = (event.clientX - current.clientX) / previewScale; const dy = (event.clientY - current.clientY) / previewScale;
    if (current.mode === "move") updatePlacement({ x: Math.max(0, Math.min(bounds.width - preview.geometry.footprint.width * placement.scale, current.placement.x + dx)),
      y: Math.max(0, Math.min(bounds.height - preview.geometry.footprint.height * placement.scale, current.placement.y + dy)) });
    else updatePlacement({ scale: Math.max(.01, Math.min(10, (bounds.width - placement.x) / preview.geometry.footprint.width,
      (bounds.height - placement.y) / preview.geometry.footprint.height, current.placement.scale + dx / preview.geometry.footprint.width)) });
  };
  const keyAdjust = (mode: "move" | "resize", event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Escape" && gesture.current !== null) { updatePlacement(gesture.current.placement); gesture.current = null; return; }
    const delta = event.shiftKey ? 10 : 1; const changes: Record<string, readonly [number, number]> = { ArrowLeft: [-delta, 0], ArrowRight: [delta, 0], ArrowUp: [0, -delta], ArrowDown: [0, delta] };
    const change = changes[event.key]; if (change === undefined || preview === null) return; event.preventDefault();
    if (mode === "move") updatePlacement({ x: Math.max(0, Math.min(bounds.width - preview.geometry.footprint.width * placement.scale, placement.x + change[0])),
      y: Math.max(0, Math.min(bounds.height - preview.geometry.footprint.height * placement.scale, placement.y + change[1])) });
    else updatePlacement({ scale: Math.max(.01, Math.min(10, (bounds.width - placement.x) / preview.geometry.footprint.width,
      (bounds.height - placement.y) / preview.geometry.footprint.height, placement.scale + (change[0] - change[1]) / 100)) });
  };
  const width = preview?.geometry.footprint.width ?? 0; const height = preview?.geometry.footprint.height ?? 0;
  return <section className="timer-layout" aria-labelledby="timer-layout-heading" ref={editorRoot}>
    <div className="timer-section-heading"><h3 id="timer-layout-heading">Timer stack</h3>
      <SegmentedControl aria-label="Timer profile" value={profile} onChange={next => { if (next === "landscape" || next === "vertical") setProfile(next); }} data={[{ value: "landscape", label: "Landscape" }, { value: "vertical", label: "Vertical" }]} /></div>
    <p>Appearance affects this browser profile and its content dimensions. Desktop output uses Landscape appearance.</p>
    <fieldset><legend>Profile appearance</legend><div className="timer-layout__controls">
      <NativeSelect label="Orientation" data-timer-field={`profiles.${profile}.appearance.orientation`} value={a.orientation} onChange={event => updateAppearance({ orientation: event.currentTarget.value as TimerAppearance["orientation"] })}><option value="vertical">Vertical</option><option value="horizontal">Horizontal</option></NativeSelect>
      {numericAppearance.map(([field, label, min, max]) => <TextInput key={field} label={label} error={errorFor(`profiles.${profile}.appearance.${field}`)} data-timer-field={`profiles.${profile}.appearance.${field}`} type="number" min={min} max={max} step={field === "maxVisible" ? 1 : "any"} value={Number.isFinite(a[field]) ? a[field] : ""} onChange={event => updateAppearance({ [field]: event.currentTarget.value === "" ? NaN : Number(event.currentTarget.value) })} />)}
      {colorAppearance.map(([field, label]) => <TextInput key={field} label={label} error={errorFor(`profiles.${profile}.appearance.${field}`)} data-timer-field={`profiles.${profile}.appearance.${field}`} value={a[field] ?? a.borderColor} onChange={event => updateAppearance({ [field]: event.currentTarget.value })} />)}
      {(["labelFont", "valueFont"] as const).map(field => {
        const label = field === "labelFont" ? "Label" : "Countdown"; const font = a[field];
        return <fieldset key={field}><legend>{label} text</legend>
          <NativeSelect label={`${label} font`} value={font.fontPreset} onChange={event => { const next = { ...font, fontPreset: event.currentTarget.value as typeof font.fontPreset }; delete next.legacyFamily; updateAppearance({ [field]: next }); }}>
            {alertFontPresets.map(preset => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
          </NativeSelect>
          <TextInput label={`${label} size (px)`} error={errorFor(`profiles.${profile}.appearance.${field}.fontSizePx`)} data-timer-field={`profiles.${profile}.appearance.${field}.fontSizePx`} min={8} max={128} type="number" value={Number.isFinite(font.fontSizePx) ? font.fontSizePx : ""} onChange={event => updateAppearance({ [field]: { ...font, fontSizePx: event.currentTarget.value === "" ? NaN : Number(event.currentTarget.value) } })} />
          <NativeSelect label={`${label} weight`} value={font.fontWeight} onChange={event => updateAppearance({ [field]: { ...font, fontWeight: Number(event.currentTarget.value) as typeof font.fontWeight } })}>{[400, 500, 600, 700, 800, 900].map(weight => <option key={weight} value={weight}>{weight}</option>)}</NativeSelect>
          <TextInput label={`${label} color`} error={errorFor(`profiles.${profile}.appearance.${field}.color`)} data-timer-field={`profiles.${profile}.appearance.${field}.color`} value={font.color} onChange={event => updateAppearance({ [field]: { ...font, color: event.currentTarget.value } })} />
        </fieldset>;
      })}
    </div></fieldset>
    <Button variant="default" type="button" onClick={() => update(structuredClone(timersOverlayModuleDefinition.defaultConfig.profiles[profile]))}>Reset selected profile</Button>
    <fieldset><legend>Desktop placement</legend><p>{profile === "vertical" ? "Vertical placement is preserved for compatibility. The desktop still renders Landscape." : "Move or scale the desktop stack without changing the browser canvas."}</p>
      <div className="timer-layout__controls">{(["x", "y", "zIndex", "scale"] as const).map(field => <TextInput key={field} label={field === "x" ? "X" : field === "y" ? "Y" : field === "scale" ? "Desktop scale" : "Z order"}
        error={errorFor(`profiles.${profile}.desktopPlacement.${field}`)} data-timer-field={`profiles.${profile}.desktopPlacement.${field}`} type="number" step="any" value={Number.isFinite(placement[field]) ? placement[field] : ""} onChange={event => updatePlacement({ [field]: event.currentTarget.value === "" ? NaN : Number(event.currentTarget.value) })} />)}</div>
    </fieldset>
    <div className="timer-layout__preview-shell" ref={previewShell}>
      {preview === null ? <p role="status">Correct the appearance or placement values to preview the timer stack.</p> : <>
        <p>Browser content: <bdi dir="ltr">{preview.geometry.width} x {preview.geometry.height}</bdi>. Update OBS dimensions after saving an appearance change.</p>
        <div aria-label={`${profile} browser appearance preview`} className="timer-layout__preview" style={{ width: preview.geometry.width * Math.min(1, availableWidth / preview.geometry.width), height: preview.geometry.height * Math.min(1, availableWidth / preview.geometry.width) }}>
          <div style={{ transform: `scale(${Math.min(1, availableWidth / preview.geometry.width)})`, transformOrigin: "top left", width: preview.geometry.width, height: preview.geometry.height }}><TimerStack stack={preview.browser} resolveAssetUrl={resolvePreviewAssetUrl} now={previewNow} /></div>
        </div>
        <p>Desktop placement preview</p><div aria-label={`${profile} timer preview`} className="timer-layout__preview" style={{ width: bounds.width * previewScale, height: bounds.height * previewScale }}>
          <div style={{ transform: `scale(${previewScale})`, transformOrigin: "top left", width: bounds.width, height: bounds.height }}><TimerStack stack={preview.desktop} resolveAssetUrl={resolvePreviewAssetUrl} now={previewNow} /></div>
          <button aria-label="Move timer region" className="timer-layout__region-handle" onKeyDown={event => keyAdjust("move", event)} onPointerDown={event => beginGesture("move", event)} onPointerMove={moveGesture} onPointerUp={() => { gesture.current = null; }} onPointerCancel={() => { if (gesture.current !== null) updatePlacement(gesture.current.placement); gesture.current = null; }}
            style={{ left: placement.x * previewScale, top: placement.y * previewScale, width: width * placement.scale * previewScale, height: height * placement.scale * previewScale }} type="button" />
          <button aria-label="Rescale timer region" className="timer-layout__resize-handle" onKeyDown={event => keyAdjust("resize", event)} onPointerDown={event => beginGesture("resize", event)} onPointerMove={moveGesture} onPointerUp={() => { gesture.current = null; }} onPointerCancel={() => { if (gesture.current !== null) updatePlacement(gesture.current.placement); gesture.current = null; }}
            style={{ left: (placement.x + width * placement.scale) * previewScale - 24, top: (placement.y + height * placement.scale) * previewScale - 24 }} type="button" />
        </div>
      </>}
    </div>
  </section>;
}

function sampleRuns(definitions: readonly TimerDefinition[], maxVisible: number): TimerRunState[] {
  const totalCount = Math.max(maxVisible + 2, definitions.length);
  const visibleExamples = Math.max(0, maxVisible - definitions.length);
  const snapshots = [...definitions.map(definition => ({ id: definition.id, label: definition.label, durationMs: definition.durationMs,
    iconAssetId: definition.iconAssetId, startAudioAssetId: definition.startAudioAssetId, endAudioAssetId: definition.endAudioAssetId, outputs: definition.outputs })),
    ...Array.from({ length: totalCount - definitions.length }, (_, index) => ({ id: `preview-${index + 1}`,
      label: visibleExamples > 0 && index === visibleExamples - 1 ? `Timer ${index + 1} with a deliberately long name that will be truncated` : `Timer ${index + 1}`,
      durationMs: (index + 1) * 15_000, iconAssetId: null, startAudioAssetId: null, endAudioAssetId: null, outputs: { browserSource: true, deviceRouteIds: [] } }))];
  return snapshots.map((snapshot, index): TimerRunState => {
    const identity = { definitionId: snapshot.id, generation: `preview-${snapshot.id}`, snapshot };
    if (index === 0) return { ...identity, status: "completed", completedAtEpochMs: 0, expiresAtEpochMs: 60_000 };
    if (index === 1) return { ...identity, status: "running", startedAtEpochMs: 0, endsAtEpochMs: 30_000 };
    return { ...identity, status: "paused", remainingMs: (index + 1) * 15_000 };
  });
}
