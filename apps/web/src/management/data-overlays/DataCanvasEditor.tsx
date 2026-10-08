import { Button, Checkbox, Group, NativeSelect, Stack, TextInput, Textarea } from "@mantine/core";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { dataCanvasInputSchema, dataGoalFieldSchema, dataOverlayLimits, timerProfileDimensions, type DataCanvas, type DataCanvasElement, type DataOverlayState } from "@stream-jams/core";
import type { AssetApi } from "../assets/asset-api.js";
import { AssetPicker } from "../assets/AssetPicker.js";
import type { ManagementApi } from "../management-api.js";
import { useDirtyNavigationSource } from "../navigation/dirty-navigation.js";
import { DataOverlayCanvases } from "../../overlay/components/DataOverlayCanvases.js";
import { constrainDataCanvasGeometry } from "./data-canvas-editor-geometry.js";
import { createDataPreviewStore, type DataPreviewScenario } from "./data-preview-store.js";
import type { DataOverlaysApi } from "./data-overlays-api.js";
import { message } from "./DataPage.js";
import "./data-overlays.css";
import { ManagementModalSurface, ManagementModalTitle } from "../foundation/ManagementModalSurface.js";
export interface DataCanvasEditorProps {
    readonly canvas: DataCanvas;
    readonly state: DataOverlayState;
    readonly api: DataOverlaysApi;
    readonly assetApi: AssetApi;
    readonly managementApi: ManagementApi;
    readonly onSaved: (state: DataOverlayState) => void;
    readonly onBack: () => void;
}
export function DataCanvasEditor({ canvas, state, api, assetApi, managementApi, onSaved, onBack }: DataCanvasEditorProps) {
    const [draft, setDraft] = useState(() => structuredClone(canvas));
    const [saved, setSaved] = useState(() => JSON.stringify(canvas));
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const inFlight = useRef(false);
    const [grid, setGrid] = useState(false);
    const [alignment, setAlignment] = useState(true);
    const [picker, setPicker] = useState(false);
    const [leaveReview, setLeaveReview] = useState(false);
    const [assets, setAssets] = useState<Record<string, string>>({});
    const [assetIds, setAssetIds] = useState<string[]>([]);
    const [sampleRevision, setSampleRevision] = useState(0);
    const [sampleValue, setSampleValue] = useState(state.values[0]?.id ?? "");
    const [sampleGoal, setSampleGoal] = useState(state.goals[0]?.id ?? "");
    const preview = useMemo(() => createDataPreviewStore(state), [state]);
    const bounds = timerProfileDimensions[draft.targetProfileId];
    const scale = 480 / bounds.width;
    const selected = draft.elements.find(element => element.id === selectedId);
    const drag = useRef<{
        id: string;
        x: number;
        y: number;
        element: DataCanvasElement;
        mode: "move" | "resize";
    } | null>(null);
    useEffect(() => {
        let alive = true;
        const urls: string[] = [];
        void assetApi.listAssets().then(async (items) => {
            const ids = items.filter(item => item.mediaType === "image").map(item => item.id);
            if (alive)
                setAssetIds(ids);
            const entries = await Promise.all(ids.map(async (id) => { try {
                const url = URL.createObjectURL(await assetApi.getAssetFile(id));
                urls.push(url);
                return [id, url] as const;
            }
            catch (cause) {
                if (alive)
                    setError(`Image preview unavailable: ${message(cause)}`);
                return [id, ""] as const;
            } }));
            if (alive)
                setAssets(Object.fromEntries(entries.filter(([, url]) => url !== "")));
            else
                urls.forEach(url => URL.revokeObjectURL(url));
        }, (cause: unknown) => { if (alive)
            setError(`Image library unavailable: ${message(cause)}`); });
        return () => { alive = false; urls.forEach(url => URL.revokeObjectURL(url)); };
    }, [assetApi]);
    const save = useCallback(async (navigation = false) => {
        if (inFlight.current)
            return false;
        inFlight.current = true;
        setBusy(true);
        setError(null);
        try {
            const input = { name: draft.name, enabled: draft.enabled, order: draft.order, targetProfileId: draft.targetProfileId, outputs: draft.outputs, elements: draft.elements };
            const next = await api.saveCanvas(draft.id, dataCanvasInputSchema.parse(input));
            const committed = next.canvases.find(item => item.id === draft.id);
            if (committed) {
                setDraft(committed);
                setSaved(JSON.stringify(committed));
            }
            onSaved(next);
            return true;
        }
        catch (cause) {
            const error = message(cause);
            if (!navigation)
                setError(error);
            return { saved: false as const, error };
        }
        finally {
            inFlight.current = false;
            setBusy(false);
        }
    }, [draft, api, onSaved]);
    const saveNavigation = useCallback(() => save(true), [save]);
    const discard = useCallback(() => { setDraft(JSON.parse(saved) as DataCanvas); setError(null); }, [saved]);
    useDirtyNavigationSource({ id: `data-canvas-${canvas.id}`, summary: `Unsaved canvas ${draft.name}`, dirty: JSON.stringify(draft) !== saved, save: saveNavigation, discard });
    function update(element: DataCanvasElement) { if (!busy)
        setDraft(current => ({ ...current, elements: current.elements.map(item => item.id === element.id ? element : item) })); }
    function geometry(element: DataCanvasElement, next: {
        x: number;
        y: number;
        width: number;
        height: number;
    }, mode: "move" | "resize") {
        try {
            update({ ...element, ...constrainDataCanvasGeometry(next, bounds, { mode, grid, alignment, scale, peers: draft.elements.filter(item => item.id !== element.id) }).rect });
        }
        catch (cause) {
            setError(message(cause));
        }
    }
    function add(kind: DataCanvasElement["kind"]) {
        if (draft.elements.length >= dataOverlayLimits.elementsPerCanvas) {
            setError("A canvas supports at most 100 elements. Delete an element before adding another.");
            return;
        }
        const base = { id: crypto.randomUUID(), order: Math.max(-1, ...draft.elements.map(item => item.order)) + 1, x: 0, y: 0, width: 320, height: 100, visible: true, stalePolicy: "retain-last" as const };
        let element: DataCanvasElement;
        if (kind === "text")
            element = { ...base, kind, binding: null, literalText: "Sample text", format: { thousandsSeparator: false, prefix: "", suffix: "", overflow: "wrap" }, style: { fontSizePx: 48, color: "#ffffffff", fontWeight: 400, align: "left" } };
        else if (kind === "image") {
            if (!assetIds[0]) {
                setError("Import a local image in Assets before adding an image element.");
                return;
            }
            element = { ...base, kind, assetId: assetIds[0], fit: "contain" };
        }
        else if (kind === "progress") {
            if (!state.goals[0]) {
                setError("Create an integer goal in Data before adding a progress bar.");
                return;
            }
            element = { ...base, kind, goalId: state.goals[0].id, orientation: "horizontal", direction: "forward", fillColor: "#00ff00ff", backgroundColor: "#00000080", borderColor: "#ffffffff", borderWidthPx: 0 };
        }
        else
            element = { ...base, kind, color: "#ffffffff" };
        setDraft(current => ({ ...current, elements: [...current.elements, element] }));
        setSelectedId(element.id);
        setError(null);
    }
    function pointerStart(event: PointerEvent<HTMLElement>, element: DataCanvasElement, mode: "move" | "resize") { if (busy || event.button !== 0)
        return; event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); setSelectedId(element.id); drag.current = { id: element.id, x: event.clientX, y: event.clientY, element, mode }; }
    function pointerMove(event: PointerEvent<HTMLElement>) { const current = drag.current; if (!current)
        return; const dx = (event.clientX - current.x) / scale; const dy = (event.clientY - current.y) / scale; geometry(current.element, current.mode === "move" ? { ...current.element, x: current.element.x + dx, y: current.element.y + dy } : { ...current.element, width: current.element.width + dx, height: current.element.height + dy }, current.mode); }
    function simulate(scenario: DataPreviewScenario) { try {
        preview.simulate(scenario, sampleValue, sampleGoal);
        setSampleRevision(value => value + 1);
        setError(null);
    }
    catch (cause) {
        setError(message(cause));
    } }
    const projection = useMemo(() => {
        return preview.project({ runtimeId: "editor-preview", output: "browser", targetProfileId: draft.targetProfileId, nowEpochMs: Date.now(), moduleEnabled: true, outputPaused: false, resolveAssetId: id => assets[id] !== undefined }, { ...state, canvases: [{ ...draft, enabled: true, outputs: { browser: true, desktop: true } }] });
    }, [assets, draft, preview, sampleRevision, state]);
    const diagnostics = draft.elements.flatMap(element => {
        if (element.kind === "image" && !assets[element.assetId])
            return [`Image ${element.id}: asset unavailable. Select an available local image.`];
        if (element.kind === "progress" && !state.goals.some(goal => goal.id === element.goalId))
            return [`Progress ${element.id}: missing goal. Select an integer goal.`];
        if (element.kind === "text" && element.binding !== null) {
            const binding = element.binding;
            if (binding.kind === "value" ? !state.values.some(value => value.id === binding.valueId) : !state.goals.some(goal => goal.id === binding.goalId))
                return [`Text ${element.id}: missing binding. Select a value or goal.`];
        }
        return [];
    });
    return <Stack className="data-management" gap="md">
    <Group justify="space-between">
      <h1>Canvas: {draft.name}</h1>
      <Group>
        <Button disabled={busy} onClick={() => void save()}>Save canvas</Button>
        <Button disabled={busy} variant="default" onClick={() => { if (JSON.stringify(draft) !== saved)
        setLeaveReview(true);
    else
        onBack(); }}>Back to canvases</Button>
      </Group>
    </Group>
    <p>{JSON.stringify(draft) !== saved ? "Unsaved changes" : "Saved"}. Preview samples never change live values.</p>{error === null ? null : <p role="alert">{error}</p>}{diagnostics.length === 0 ? null : <ul aria-label="Canvas diagnostics">{diagnostics.map(item => <li key={item}>{item}</li>)}</ul>}
    <fieldset disabled={busy}>
      <Group align="end">
        <TextInput required label="Canvas name" value={draft.name} onChange={event => setDraft({ ...draft, name: event.currentTarget.value })}/>
        <Checkbox label="Canvas enabled" checked={draft.enabled} onChange={event => setDraft({ ...draft, enabled: event.currentTarget.checked })}/>
        <Checkbox label="Browser output" checked={draft.outputs.browser} onChange={event => setDraft({ ...draft, outputs: { ...draft.outputs, browser: event.currentTarget.checked } })}/>
        <Checkbox label="Desktop output" checked={draft.outputs.desktop} onChange={event => setDraft({ ...draft, outputs: { ...draft.outputs, desktop: event.currentTarget.checked } })}/>
        <TextInput label="Canvas order" type="number" value={draft.order} onChange={event => { const order = Number(event.currentTarget.value); if (Number.isSafeInteger(order))
        setDraft({ ...draft, order }); }}/>
      </Group>
    </fieldset>
    <Group>
      <Checkbox label="Grid snapping" checked={grid} onChange={event => setGrid(event.currentTarget.checked)}/>
      <Checkbox label="Alignment snapping" checked={alignment} onChange={event => setAlignment(event.currentTarget.checked)}/>{(["text", "image", "rectangle", "ellipse", "progress"] as const).map(kind => <Button key={kind} variant="default" disabled={busy} onClick={() => add(kind)}>Add {kind}</Button>)}<span>{draft.elements.length} / {dataOverlayLimits.elementsPerCanvas} elements</span>
    </Group>
    <div className="data-editor-workspace">
      <div>
        <div className="data-editor-stage" style={{ width: 480, height: bounds.height * scale }}>
          <div style={{ width: bounds.width, height: bounds.height, transform: `scale(${scale})`, transformOrigin: "top left", position: "absolute" }}>
            <DataOverlayCanvases projection={projection} resolveAssetUrl={id => assets[id] ?? null}/>{[...draft.elements].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)).map((element, index) => <div key={element.id} role="group" tabIndex={0} aria-label={`Move ${element.kind} layer ${index + 1}`} data-selected={selectedId === element.id} className="data-editor-handle" style={{ left: element.x, top: element.y, width: element.width, height: element.height, zIndex: index + 100 }} onFocus={() => setSelectedId(element.id)} onPointerDown={event => pointerStart(event, element, "move")} onPointerMove={pointerMove} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { const current = drag.current; if (current)
            update(current.element); drag.current = null; }} onKeyDown={event => { const step = event.shiftKey ? 10 : 1; const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key]; if (delta) {
            event.preventDefault();
            geometry(element, event.altKey ? { ...element, width: element.width + delta[0]!, height: element.height + delta[1]! } : { ...element, x: element.x + delta[0]!, y: element.y + delta[1]! }, event.altKey ? "resize" : "move");
        } }}>
              <span className="data-editor-resize" role="button" tabIndex={0} aria-label={`Resize ${element.kind} layer ${index + 1}`} onPointerDown={event => pointerStart(event, element, "resize")} onPointerMove={pointerMove} onPointerUp={() => { drag.current = null; }} onKeyDown={event => { const step = event.shiftKey ? 10 : 1; const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key]; if (delta) {
            event.preventDefault();
            event.stopPropagation();
            geometry(element, { ...element, width: element.width + delta[0]!, height: element.height + delta[1]! }, "resize");
        } }}/>
            </div>)}</div>
        </div>
        <p>Arrow keys move; Shift moves by 10; Alt + arrows resizes. Use the resize handle or exact fields.</p>
        <h2>Layers</h2>{[...draft.elements].sort((a, b) => b.order - a.order).map(element => <Button variant={selectedId === element.id ? "light" : "default"} key={element.id} onClick={() => setSelectedId(element.id)}>{element.kind} · {element.order}{element.visible ? "" : " · hidden"}</Button>)}
      </div>
      <Stack>
        <h2>Element inspector</h2>{selected === undefined ? <p>Select an element to edit its geometry, style and binding.</p> : <fieldset disabled={busy}>
          <Stack>
            <Group>{(["x", "y", "width", "height"] as const).map(field => <TextInput key={field} type="number" label={field} value={selected[field]} onChange={event => { if (event.currentTarget.value !== "")
            geometry(selected, { ...selected, [field]: Number(event.currentTarget.value) }, field === "width" || field === "height" ? "resize" : "move"); }}/>)}</Group>
            <TextInput label="Layer order" type="number" value={selected.order} onChange={event => { const order = Number(event.currentTarget.value); if (Number.isSafeInteger(order))
            update({ ...selected, order }); }}/>
            <Checkbox label="Visible" checked={selected.visible} onChange={event => update({ ...selected, visible: event.currentTarget.checked })}/>
            <NativeSelect label="Stale source" data={[{ value: "retain-last", label: "Retain for ten minutes" }, { value: "hide-immediately", label: "Hide immediately" }]} value={selected.stalePolicy} onChange={event => update({ ...selected, stalePolicy: event.currentTarget.value as DataCanvasElement["stalePolicy"] })}/>
            {selected.kind === "text" ? <>
              <NativeSelect label="Text binding" value={selected.binding === null ? "" : selected.binding.kind === "value" ? `value:${selected.binding.valueId}` : `goal:${selected.binding.goalId}`} data={[{ value: "", label: "Literal text" }, ...state.values.map(value => ({ value: `value:${value.id}`, label: value.name })), ...state.goals.map(goal => ({ value: `goal:${goal.id}`, label: `Goal: ${goal.name}` }))]} onChange={event => { const [kind, id] = event.currentTarget.value.split(":"); update({ ...selected, binding: !id ? null : kind === "value" ? { kind: "value", valueId: id } : { kind: "goal", goalId: id, field: "current" } }); }}/>{selected.binding?.kind === "goal" ? <NativeSelect label="Goal field" value={selected.binding.field} data={dataGoalFieldSchema.options} onChange={event => { if (selected.binding?.kind === "goal")
                update({ ...selected, binding: { ...selected.binding, field: dataGoalFieldSchema.parse(event.currentTarget.value) } }); }}/> : null}<Textarea label="Literal text" value={selected.literalText} onChange={event => update({ ...selected, literalText: event.currentTarget.value })}/>{(["prefix", "suffix"] as const).map(field => <TextInput key={field} label={field} value={selected.format[field]} onChange={event => update({ ...selected, format: { ...selected.format, [field]: event.currentTarget.value } })}/>)}<Checkbox label="Thousands separators" checked={selected.format.thousandsSeparator} onChange={event => update({ ...selected, format: { ...selected.format, thousandsSeparator: event.currentTarget.checked } })}/>
              <NativeSelect label="Overflow" data={["wrap", "ellipsis"]} value={selected.format.overflow} onChange={event => update({ ...selected, format: { ...selected.format, overflow: event.currentTarget.value as "wrap" | "ellipsis" } })}/>
              <TextInput label="Font size" type="number" min={8} max={256} value={selected.style.fontSizePx} onChange={event => update({ ...selected, style: { ...selected.style, fontSizePx: Number(event.currentTarget.value) } })}/>
              <NativeSelect label="Font weight" data={[100, 200, 300, 400, 500, 600, 700, 800, 900].map(String)} value={String(selected.style.fontWeight)} onChange={event => update({ ...selected, style: { ...selected.style, fontWeight: Number(event.currentTarget.value) } })}/>
              <NativeSelect label="Text alignment" data={["left", "center", "right"]} value={selected.style.align} onChange={event => update({ ...selected, style: { ...selected.style, align: event.currentTarget.value as "left" | "center" | "right" } })}/>
              <TextInput label="Text RGBA color" value={selected.style.color} onChange={event => update({ ...selected, style: { ...selected.style, color: event.currentTarget.value } })}/>
            </> : null}
            {selected.kind === "rectangle" || selected.kind === "ellipse" ? <TextInput label="Shape RGBA color" value={selected.color} onChange={event => update({ ...selected, color: event.currentTarget.value })}/> : null}
            {selected.kind === "image" ? <>
              <Button onClick={() => setPicker(true)}>Choose local image</Button>
              <NativeSelect label="Image fit" data={["contain", "cover", "fill"]} value={selected.fit} onChange={event => update({ ...selected, fit: event.currentTarget.value as "contain" | "cover" | "fill" })}/>
            </> : null}
            {selected.kind === "progress" ? <>
              <NativeSelect label="Progress goal" value={selected.goalId} data={state.goals.map(goal => ({ value: goal.id, label: goal.name }))} onChange={event => update({ ...selected, goalId: event.currentTarget.value })}/>
              <NativeSelect label="Orientation" value={selected.orientation} data={["horizontal", "vertical"]} onChange={event => update({ ...selected, orientation: event.currentTarget.value as "horizontal" | "vertical" })}/>
              <NativeSelect label="Direction" value={selected.direction} data={["forward", "reverse"]} onChange={event => update({ ...selected, direction: event.currentTarget.value as "forward" | "reverse" })}/>{(["fillColor", "backgroundColor", "borderColor"] as const).map(field => <TextInput key={field} label={field} value={selected[field]} onChange={event => update({ ...selected, [field]: event.currentTarget.value })}/>)}<TextInput type="number" label="Border width" min={0} max={32} value={selected.borderWidthPx} onChange={event => update({ ...selected, borderWidthPx: Number(event.currentTarget.value) })}/>
            </> : null}
            <Group>
              <Button variant="default" onClick={() => { if (draft.elements.length >= dataOverlayLimits.elementsPerCanvas) {
            setError("A canvas supports at most 100 elements.");
            return;
        } const copy = { ...structuredClone(selected), id: crypto.randomUUID(), order: Math.max(...draft.elements.map(item => item.order)) + 1 }; setDraft({ ...draft, elements: [...draft.elements, copy] }); setSelectedId(copy.id); }}>Duplicate element</Button>
              <Button color="red" onClick={() => { setDraft({ ...draft, elements: draft.elements.filter(item => item.id !== selected.id) }); setSelectedId(null); }}>Delete element</Button>
            </Group>
          </Stack>
        </fieldset>}
      </Stack>
    </div>
    <section aria-label="Sample preview">
      <h2>Sample preview</h2>
      <Group>
        <NativeSelect label="Sample value" value={sampleValue} data={state.values.map(value => ({ value: value.id, label: value.name }))} onChange={event => setSampleValue(event.currentTarget.value)}/>
        <NativeSelect label="Sample goal" value={sampleGoal} data={state.goals.filter(goal => goal.valueId === sampleValue).map(goal => ({ value: goal.id, label: goal.name }))} onChange={event => setSampleGoal(event.currentTarget.value)}/>{(["zero", "decrease", "completion", "over-target", "long-text", "missing-source"] as const).map(scenario => <Button key={scenario} variant="default" onClick={() => simulate(scenario)}>{scenario}</Button>)}<Button variant="default" onClick={() => { preview.reset(); setSampleRevision(value => value + 1); }}>Reset samples</Button>
      </Group>
    </section>
    <ManagementModalSurface labelledBy="data-canvas-leave" open={leaveReview} pending={busy} onCancel={() => setLeaveReview(false)}>
      <ManagementModalTitle>Unsaved canvas changes</ManagementModalTitle>
      <p>Save the layout or discard your changes before leaving.</p>{error === null ? null : <p role="alert">{error}</p>}<Group>
        <Button disabled={busy} onClick={() => { void save().then(result => { if (result === true)
        onBack(); }); }}>Save and leave</Button>
        <Button disabled={busy} color="red" variant="light" onClick={onBack}>Discard and leave</Button>
        <Button disabled={busy} variant="default" onClick={() => setLeaveReview(false)}>Cancel</Button>
      </Group>
    </ManagementModalSurface>
    <AssetPicker assetApi={assetApi} managementApi={managementApi} compatibleMediaTypes={["image"]} open={picker} selectedAssetId={selected?.kind === "image" ? selected.assetId : null} onCancel={() => setPicker(false)} onSelect={id => { if (selected?.kind === "image")
        update({ ...selected, assetId: id }); setPicker(false); void assetApi.getAssetFile(id).then(blob => { const url = URL.createObjectURL(blob); setAssets(current => ({ ...current, [id]: url })); }, (cause: unknown) => setError(message(cause))); }}/>
  </Stack>;
}
