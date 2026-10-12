import { Button, Group, NativeSelect, Stack, TextInput } from "@mantine/core";

import { useEffect, useMemo, useRef, useState } from "react";

import { buildDataTemplatePreviewState, projectDataOverlays, timerProfileDimensions, type DataCanvas, type DataOverlayState, type DataTemplate, type DataTemplateMapping, type TwitchDataSourceStatus } from "@stream-jams/core";

import { DataOverlayCanvases } from "../../overlay/components/DataOverlayCanvases.js";
import type { AssetApi } from "../assets/asset-api.js";

import { ManagementModalSurface, ManagementModalTitle } from "../foundation/ManagementModalSurface.js";

import { type DataTemplateApi } from "./data-template-api.js";

import { initialTemplateMappings, TemplateSlotMapping } from "./TemplateSlotMapping.js";

import { defaultTwitchDataSourcesApi, type TwitchDataSourcesApi } from "./twitch-data-sources-api.js";

import { message } from "./DataPage.js";



export function DataTemplatePicker({ api, state, canvas, assetApi, onApplied, onCancel, twitchSourcesApi = defaultTwitchDataSourcesApi }: { readonly api: DataTemplateApi; readonly assetApi?: AssetApi | undefined; readonly twitchSourcesApi?: TwitchDataSourcesApi | undefined; readonly state: DataOverlayState; readonly canvas?: DataCanvas | undefined; readonly onApplied: (state: DataOverlayState) => void; readonly onCancel: () => void }) {

  const [templates, setTemplates] = useState<DataTemplate[] | null>(null);

  const [selected, setSelected] = useState<DataTemplate | null>(null);

  const [mappings, setMappings] = useState<DataTemplateMapping[]>([]);

  const [name, setName] = useState("");

  const [x, setX] = useState("0"); const [y, setY] = useState("0");

  const [error, setError] = useState<string | null>(null);

  const [busy, setBusy] = useState(false); const guard = useRef(false);
  const [previewImages, setPreviewImages] = useState<Record<string, string>>({});
  const [missingPreviewImages, setMissingPreviewImages] = useState<string[]>([]);
  useEffect(() => {
    let alive = true; const urls: string[] = []; setPreviewImages({}); setMissingPreviewImages([]);
    const ids = [...new Set(selected?.elements.flatMap(element => element.kind === "image" ? [element.assetId] : []) ?? [])];
    if (assetApi) void Promise.all(ids.map(async id => {
      try { const url = URL.createObjectURL(await assetApi.getAssetFile(id)); urls.push(url); return [id, url, null] as const; }
      catch (cause) { return [id, null, message(cause)] as const; }
    })).then(entries => { if (alive) { setPreviewImages(Object.fromEntries(entries.filter((entry): entry is readonly [string, string, null] => entry[1] !== null).map(([id, url]) => [id, url]))); setMissingPreviewImages(entries.filter(([, url]) => url === null).map(([id, , error]) => `${id}: ${error}`)); } else urls.forEach(url => URL.revokeObjectURL(url)); });
    return () => { alive = false; urls.forEach(url => URL.revokeObjectURL(url)); };
  }, [selected, assetApi]);

  const [sourceStatus, setSourceStatus] = useState<TwitchDataSourceStatus | null>(null);

  const [sourceError, setSourceError] = useState<string | null>(null);

  const needsSource = selected?.slots.some(slot => slot.requiredSource) ?? false;

  useEffect(() => {

    if (!needsSource) return;

    let alive = true; let pending = false; setSourceStatus(null); setSourceError(null);

    async function refresh() { if (pending) return; pending = true; try { const next = await twitchSourcesApi.getStatus(); if (alive) { setSourceStatus(next); setSourceError(null); } } catch (cause) { if (alive) setSourceError(message(cause)); } finally { pending = false; } }

    void refresh(); const timer = window.setInterval(() => void refresh(), 5000); return () => { alive = false; window.clearInterval(timer); };

  }, [needsSource, twitchSourcesApi]);

  const sourceReady = !needsSource || sourceError === null && (sourceStatus?.follower.state === "current" || sourceStatus?.follower.state === "stale");

  const mappingsReady = selected?.slots.every(slot => {

    const entry = mappings.find(mapping => mapping.slotId === slot.id)?.mapping;

    if (!entry) return false;

    if (!slot.requiredSource) return true;

    const valueId = entry.kind === "value" ? entry.valueId : entry.kind === "goal" ? state.goals.find(goal => goal.id === entry.goalId)?.valueId : undefined;

    return valueId !== undefined && (sourceStatus?.follower.valueIds.includes(valueId) ?? false);

  }) ?? false;

  const [deleting, setDeleting] = useState<DataTemplate | null>(null);

  async function load() { try { setTemplates((await api.getCatalog()).templates); setError(null); } catch (cause) { setError(message(cause)); } }

  useEffect(() => { let alive = true; void api.getCatalog().then(catalog => { if (alive) setTemplates(catalog.templates); }, (cause: unknown) => { if (alive) setError(message(cause)); }); return () => { alive = false; }; }, [api]);

  const projection = useMemo(() => selected === null ? null : projectDataOverlays(buildDataTemplatePreviewState(selected), { runtimeId: "template-preview", output: "browser", targetProfileId: selected.targetProfileId, nowEpochMs: 0, moduleEnabled: true, outputPaused: false, resolveAssetId: id => previewImages[id] !== undefined }), [selected, previewImages]);
  const previewBounds = useMemo(() => {
    if (!selected || selected.elements.length === 0) return { x: 0, y: 0, width: 1920, height: 1080 };
    const x = Math.min(...selected.elements.map(element => element.x)); const y = Math.min(...selected.elements.map(element => element.y));
    return { x, y, width: Math.max(...selected.elements.map(element => element.x + element.width)) - x, height: Math.max(...selected.elements.map(element => element.y + element.height)) - y };
  }, [selected]);

  async function apply() {

    if (!selected || !sourceReady || !mappingsReady || guard.current) return;

    guard.current = true; setBusy(true); setError(null);

    try { const next = canvas ? await api.insert(selected.id, { canvasId: canvas.id, x: Number(x), y: Number(y), mappings }) : await api.instantiate(selected.id, { name, enabled: false, order: 0, outputs: { browser: true, desktop: false }, mappings }); onApplied(next); }

    catch (cause) { setError(message(cause)); }

    finally { guard.current = false; setBusy(false); }

  }

  return <ManagementModalSurface open labelledBy="data-template-picker" pending={busy} onCancel={onCancel}>

    <ManagementModalTitle>{canvas ? "Insert template" : "Create canvas from template"}</ManagementModalTitle>

    <p>{canvas ? "Inserted elements become independent layers in this saved canvas." : "The new canvas starts disabled. Review and save its visibility before showing it."} Template edits never change existing canvases.</p>

    {error ? <div role="alert">{error}{templates === null ? <Button variant="default" onClick={() => void load()}>Retry templates</Button> : null}</div> : null}

    {templates === null ? <p role="status">Loading templates…</p> : <>

      <NativeSelect label="Template" disabled={busy || deleting !== null} value={selected?.id ?? ""} data={[{ value: "", label: "Choose a template" }, ...templates.filter(template => !canvas || template.targetProfileId === canvas.targetProfileId).map(template => ({ value: template.id, label: `${template.name}${template.origin === "user" ? " · saved" : ""}` }))]} onChange={event => { const template = templates.find(item => item.id === event.currentTarget.value) ?? null; setSelected(template); setMappings(template ? initialTemplateMappings(template.slots) : []); setName(template?.name ?? ""); setError(null); }} />

      {templates.length === 0 ? <p>No templates yet. Save a canvas as a reusable template.</p> : null}

      {selected && projection ? <Stack mt="md">

        <section aria-label="Template sample preview"><p>Independent sample preview · {selected.targetProfileId}. Images must be available locally when used.</p><div style={{ position: "relative", width: "100%", maxWidth: 320, aspectRatio: `${previewBounds.width} / ${previewBounds.height}`, overflow: "hidden", background: "var(--color-surface-subtle)" }}><div style={{ position: "absolute", width: timerProfileDimensions[selected.targetProfileId].width, height: timerProfileDimensions[selected.targetProfileId].height, transform: `scale(${320 / previewBounds.width}) translate(${-previewBounds.x}px, ${-previewBounds.y}px)`, transformOrigin: "top left" }}><DataOverlayCanvases projection={projection} resolveAssetUrl={id => previewImages[id] ?? null} /></div></div></section>

        {missingPreviewImages.length > 0 ? <p role="status">Unavailable local images: {missingPreviewImages.join(", ")}. These layers become missing-image placeholders if their registration is unavailable.</p> : null}
        <form onSubmit={event => { event.preventDefault(); void apply(); }}><Stack>

          {canvas ? <Group><TextInput required label="Insert x" type="number" min={0} value={x} disabled={busy} onChange={event => setX(event.currentTarget.value)} /><TextInput required label="Insert y" type="number" min={0} value={y} disabled={busy} onChange={event => setY(event.currentTarget.value)} /></Group> : <TextInput required label="Template canvas name" value={name} disabled={busy} onChange={event => setName(event.currentTarget.value)} />}

          {needsSource ? <p role="status">Twitch follower source: {sourceError ? "status unavailable. Check Data and retry." : sourceStatus?.follower.state ?? "checking readiness…"}. {sourceReady ? "" : "Configure or reconnect in Data before applying this template."}</p> : null}

          {selected.slots.map(slot => <TemplateSlotMapping key={`${selected.id}:${slot.id}`} slot={slot} state={state} sourceValueIds={sourceStatus?.follower.valueIds} disabled={busy} onChange={mapping => setMappings(current => [...current.filter(item => item.slotId !== slot.id), mapping])} />)}

          <Group><Button type="submit" disabled={busy || deleting !== null || !sourceReady || !mappingsReady}>{canvas ? "Insert independent layers" : "Create disabled canvas"}</Button>{selected.origin === "user" ? <Button color="red" variant="light" disabled={busy} onClick={() => { setDeleting(selected); setError(null); }}>Delete saved template</Button> : null}</Group>

        </Stack></form>

      </Stack> : null}

    </>}

    {deleting ? <section aria-label="Delete template review"><p>Delete {deleting.name}? Existing canvases remain independent and keep their layouts.</p><Group><Button color="red" disabled={busy} onClick={() => { if (guard.current) return; guard.current = true; setBusy(true); setError(null); void api.delete(deleting.id).then(catalog => { setTemplates(catalog.templates); setDeleting(null); setSelected(null); }, (cause: unknown) => setError(message(cause))).finally(() => { guard.current = false; setBusy(false); }); }}>Confirm delete template</Button><Button variant="default" disabled={busy} onClick={() => { setDeleting(null); setError(null); }}>Keep template</Button></Group></section> : null}

    <Button mt="md" variant="default" disabled={busy} onClick={onCancel}>Cancel</Button>

  </ManagementModalSurface>;

}
