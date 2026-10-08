import { Button, Checkbox, Group, NativeSelect, Stack, TextInput } from "@mantine/core";
import { useEffect, useRef, useState } from "react";
import { dataOverlayLimits, type DataOverlayState, type OverlayOutputView } from "@stream-jams/core";
import type { AssetApi } from "../assets/asset-api.js";
import type { ManagementApi } from "../management-api.js";
import { ModuleControls, ModulePageLayout, ModuleSection } from "../foundation/ModulePageLayout.js";
import type { TwitchDataSourcesApi } from "./twitch-data-sources-api.js";
import { DataTemplatePicker } from "./DataTemplatePicker.js";
import { defaultDataTemplateApi, type DataTemplateApi } from "./data-template-api.js";
import { DataCanvasEditor } from "./DataCanvasEditor.js";
import { defaultDataOverlaysApi, type DataOverlaysApi } from "./data-overlays-api.js";
import { message } from "./DataPage.js";
import { DataOutputLinks } from "./DataOutputLinks.js";
import "./data-overlays.css";
import { ManagementModalSurface, ManagementModalTitle } from "../foundation/ManagementModalSurface.js";
export function DataOverlaysPage({ api = defaultDataOverlaysApi, templateApi = defaultDataTemplateApi, twitchSourcesApi, assetApi, managementApi }: {
    readonly api?: DataOverlaysApi | undefined;
    readonly templateApi?: DataTemplateApi | undefined;
    readonly twitchSourcesApi?: TwitchDataSourcesApi | undefined;
    readonly assetApi: AssetApi;
    readonly managementApi: ManagementApi;
}) {
    const [state, setState] = useState<DataOverlayState | null>(null);
    const [enabled, setEnabled] = useState(false);
    const [enabledDraft, setEnabledDraft] = useState(false);
    const [templatePicker, setTemplatePicker] = useState(false);
    const [editing, setEditing] = useState<string | null>(null);
    const [name, setName] = useState("");
    const [profile, setProfile] = useState<"landscape" | "vertical">("landscape");
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const pending = useRef(false);
    const [deleting, setDeleting] = useState<string | null>(null);
    const [sources, setSources] = useState<readonly OverlayOutputView[]>([]);
    async function load() { try {
        const [next, moduleEnabled, sourceRows] = await Promise.all([api.getState(), api.getEnabled(), api.listOutputs()]);
        setState(next);
        setEnabled(moduleEnabled);
        setEnabledDraft(moduleEnabled);
        setSources(sourceRows);
        setError(null);
    }
    catch (cause) {
        setError(message(cause));
    } }
    useEffect(() => { let alive = true; void Promise.all([api.getState(), api.getEnabled(), api.listOutputs()]).then(([next, moduleEnabled, sourceRows]) => { if (alive) {
        setState(next);
        setEnabled(moduleEnabled);
        setEnabledDraft(moduleEnabled);
        setSources(sourceRows);
    } }, (cause: unknown) => { if (alive)
        setError(message(cause)); }); return () => { alive = false; }; }, [api, managementApi]);
    async function mutate(work: () => Promise<void>) { if (pending.current)
        return; pending.current = true; setBusy(true); setError(null); try {
        await work();
    }
    catch (cause) {
        setError(message(cause));
    }
    finally {
        pending.current = false;
        setBusy(false);
    } }
    const canvas = state?.canvases.find(item => item.id === editing);
    if (canvas && state)
        return <DataCanvasEditor key={canvas.id} canvas={canvas} state={state} api={api} templateApi={templateApi} twitchSourcesApi={twitchSourcesApi} assetApi={assetApi} managementApi={managementApi} onSaved={setState} onBack={() => setEditing(null)}/>;
    return <ModulePageLayout className="data-management" feedback={error === null || deleting !== null ? null : <div role="alert">{error}<Button variant="default" onClick={() => void load()}>Reload Data Overlays</Button>
  </div>} controls={<ModuleControls status={<strong>{enabled ? "Enabled" : "Disabled"}</strong>} description="Enabling outputs uses saved canvases. Values persist independently of visibility.">
    <Checkbox label="Enable Data Overlays" checked={enabledDraft} disabled={busy} onChange={event => setEnabledDraft(event.currentTarget.checked)}/>
    <Button disabled={busy || enabledDraft === enabled} onClick={() => void mutate(async () => { setEnabled(await api.setEnabled(enabledDraft)); })}>Save enablement</Button>
  </ModuleControls>} outputs={<ModuleSection id="browser-sources" title="Outputs" label="Data Overlays outputs">
    <p>Canvas browser assignments apply to module and unified browser sources. Desktop assignments use the configured private desktop surface.</p>
    <DataOutputLinks outputs={sources} api={managementApi} onChanged={async () => setSources(await api.listOutputs())}/>
    <a href="/manage/settings">Configure outputs in Settings</a>
  </ModuleSection>}>
    <ModuleSection title="Canvases" label="Canvases" description="Up to 50 canvases. Deleting a canvas preserves its shared values and goals.">
      <Button variant="default" disabled={busy || state === null || state.canvases.length >= dataOverlayLimits.canvases} onClick={() => setTemplatePicker(true)}>Create from template</Button>
      {templatePicker && state ? <DataTemplatePicker assetApi={assetApi} twitchSourcesApi={twitchSourcesApi} api={templateApi} state={state} onCancel={() => setTemplatePicker(false)} onApplied={next => { setState(next); setTemplatePicker(false); const added = next.canvases.find(item => !state.canvases.some(saved => saved.id === item.id)); if (added) setEditing(added.id); }} /> : null}
      {state === null ? <p role="status">Loading canvases…</p> : <Stack>{state.canvases.length === 0 ? <p>No canvases yet. Create one and add reusable elements.</p> : [...state.canvases].sort((a, b) => a.order - b.order).map(item => <Group key={item.id}>
        <span>{item.name} · {item.targetProfileId} · {item.enabled ? "shown" : "hidden"} · {item.elements.length} elements</span>
        <Button variant="default" disabled={busy} onClick={() => setEditing(item.id)}>Edit {item.name}</Button>
        <Button color="red" variant="light" disabled={busy} onClick={() => setDeleting(item.id)}>Delete {item.name}</Button>
      </Group>)}<form onSubmit={event => { event.preventDefault(); void mutate(async () => { setState(await api.saveCanvas(null, { name, targetProfileId: profile, enabled: false, order: state.canvases.length, outputs: { browser: true, desktop: false }, elements: [] })); setName(""); }); }}>
          <Group align="end">
            <TextInput label="New canvas name" required disabled={busy || state.canvases.length >= dataOverlayLimits.canvases} value={name} onChange={event => setName(event.currentTarget.value)}/>
            <NativeSelect label="Target profile" value={profile} data={["landscape", "vertical"]} disabled={busy} onChange={event => setProfile(event.currentTarget.value as typeof profile)}/>
            <Button type="submit" disabled={busy || state.canvases.length >= dataOverlayLimits.canvases}>Create canvas</Button>
          </Group>
        </form>
      </Stack>}
    </ModuleSection>
    {deleting === null ? null : <ManagementModalSurface open={deleting !== null} labelledBy="data-canvas-delete" pending={busy} onCancel={() => setDeleting(null)}>
      <ManagementModalTitle>Delete {state?.canvases.find(item => item.id === deleting)?.name}?</ManagementModalTitle>
      <p>This removes the saved layout. Shared values and goals remain.</p>{error === null ? null : <p role="alert">{error}</p>}
      <Group>
        <Button color="red" disabled={busy} onClick={() => void mutate(async () => { setState(await api.deleteCanvas(deleting)); setDeleting(null); })}>Confirm delete canvas</Button>
        <Button variant="default" disabled={busy} onClick={() => setDeleting(null)}>Cancel</Button>
      </Group>
    </ManagementModalSurface>}
    <p>
      <a href="/manage/data">Manage shared values, goals and Operator pins</a>
    </p>
  </ModulePageLayout>;
}
