import { Button, Group, NativeSelect, Stack, TextInput } from "@mantine/core";
import { useEffect, useRef, useState } from "react";
import type { DataCanvas, DataTemplate } from "@stream-jams/core";
import { ManagementModalSurface, ManagementModalTitle } from "../foundation/ManagementModalSurface.js";
import type { DataTemplateApi } from "./data-template-api.js";
import { message } from "./DataPage.js";

export function SaveDataTemplateDialog({ api, canvas, elementIds, onCancel, onSaved }: { readonly api: DataTemplateApi; readonly canvas: DataCanvas; readonly elementIds?: string[] | undefined; readonly onCancel: () => void; readonly onSaved: () => void }) {
  const [name, setName] = useState(canvas.name); const [target, setTarget] = useState("");
  const [templates, setTemplates] = useState<DataTemplate[]>([]); const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false); const guard = useRef(false);
  useEffect(() => { let alive = true; void api.getCatalog().then(catalog => { if (alive) setTemplates(catalog.templates.filter(template => template.origin === "user")); }, (cause: unknown) => { if (alive) setError(message(cause)); }); return () => { alive = false; }; }, [api]);
  return <ManagementModalSurface open labelledBy="data-template-save" pending={busy} onCancel={onCancel}>
    <ManagementModalTitle>Save {elementIds ? "selected layers" : "canvas"} as template</ManagementModalTitle>
    <p>Save the layout, styles and typed binding slots. Live counts, goal targets and provider identity are excluded. Updating a template leaves every existing canvas unchanged.</p>
    {error ? <p role="alert">{error}</p> : null}
    <form onSubmit={event => { event.preventDefault(); if (guard.current) return; guard.current = true; setBusy(true); setError(null); void api.save(target || null, { name, canvasId: canvas.id, ...(elementIds ? { elementIds } : {}) }).then(onSaved, (cause: unknown) => setError(message(cause))).finally(() => { guard.current = false; setBusy(false); }); }}><Stack>
      <NativeSelect label="Template destination" value={target} disabled={busy} data={[{ value: "", label: "New saved template" }, ...templates.map(template => ({ value: template.id, label: `Replace ${template.name}` }))]} onChange={event => { setTarget(event.currentTarget.value); const existing = templates.find(template => template.id === event.currentTarget.value); if (existing) setName(existing.name); }} />
      <TextInput required label="Saved template name" value={name} disabled={busy} onChange={event => setName(event.currentTarget.value)} />
      <Group><Button type="submit" disabled={busy}>{target ? "Replace saved template" : "Save template"}</Button><Button variant="default" disabled={busy} onClick={onCancel}>Cancel</Button></Group>
    </Stack></form>
  </ManagementModalSurface>;
}
