import { Button, Checkbox, Group, NativeSelect, Stack, Table, TextInput } from "@mantine/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { dataOverlayLimits, type ActionableManagementError, type DataGoal, type DataOverlayState, type DataValue } from "@stream-jams/core";
import { defaultDataOverlaysApi, type DataOverlaysApi } from "./data-overlays-api.js";
import { ModuleSection } from "../foundation/ModulePageLayout.js";
import { ManagementErrorToast, ManagementToast, type ManagementToastNotice } from "../foundation/ManagementToast.js";
import { actionableError } from "../foundation/actionable-error.js";
import { ManagementModalSurface, ManagementModalTitle } from "../foundation/ManagementModalSurface.js";
import { useDirtyNavigationSource } from "../navigation/dirty-navigation.js";
import { ManagementHttpError } from "../management-http-client.js";
import { TwitchDataSources } from "./TwitchDataSources.js";
import type { TwitchDataSourcesApi } from "./twitch-data-sources-api.js";
export function DataPage({ api = defaultDataOverlaysApi, twitchSourcesApi }: {
    readonly api?: DataOverlaysApi | undefined;
    readonly twitchSourcesApi?: TwitchDataSourcesApi | undefined;
}) {
    const [state, setState] = useState<DataOverlayState | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [actionError, setActionError] = useState<ActionableManagementError | null>(null);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const [notice, setNotice] = useState<ManagementToastNotice | null>(null);
    const [commandBusy, setBusy] = useState(false);
    const [sourceBusy, setSourceBusy] = useState(false);
    const busy = commandBusy || sourceBusy;
    const sourcePending = useRef(false);
    const pending = useRef(false);
    const [editing, setEditing] = useState<{
        type: "value" | "goal" | "group";
        id: string | null;
    } | null>(null);
    const [name, setName] = useState("");
    const [kind, setKind] = useState<"integer" | "text">("integer");
    const [defaultContent, setDefaultContent] = useState("0");
    const [groupId, setGroupId] = useState("");
    const [valueId, setValueId] = useState("");
    const [mode, setMode] = useState<"fixed-target" | "saved-baseline">("fixed-target");
    const [amount, setAmount] = useState("100");
    const [baseline, setBaseline] = useState("0");
    const [deleting, setDeleting] = useState<{
        type: "value" | "goal" | "group";
        id: string;
        name: string;
    } | null>(null);
    const editingSource = editing?.type === "value" && state?.values.find(value => value.id === editing.id)?.source !== undefined;
    async function load() { try {
        setState(await api.getState());
        setError(null);
    }
    catch (cause) {
        setError(message(cause));
    } }
    useEffect(() => {
        let alive = true;
        let refreshing = false;
        async function refresh() {
            if (refreshing || pending.current || document.visibilityState === "hidden")
                return;
            refreshing = true;
            try {
                const next = await api.getState();
                if (alive) {
                    setState(current => current !== null && current.revision > next.revision ? current : next);
                    setError(null);
                }
            }
            catch (cause) {
                if (alive)
                    setError(`Current content may be stale. ${message(cause)}`);
            }
            finally {
                refreshing = false;
            }
        }
        void refresh();
        const interval = window.setInterval(() => void refresh(), 5000);
        document.addEventListener("visibilitychange", refresh);
        return () => { alive = false; window.clearInterval(interval); document.removeEventListener("visibilitychange", refresh); };
    }, [api]);
    const mutate = useCallback(async (work: () => Promise<DataOverlayState>, close = true, navigation = false) => {
        if (pending.current || sourcePending.current)
            return false;
        pending.current = true;
        setBusy(true);
        setError(null);
        setActionError(null);
        setNotice(null);
        try {
            setState(await work());
            if (close) {
                setEditing(null);
                setDeleting(null);
            }
            setNotice({ tone: "success", message: "Data definition saved." });
            return true;
        }
        catch (cause) {
            const error = actionableError(cause, "Data definition was not saved", message(cause));
            if (!navigation)
                setActionError(error);
            return { saved: false as const, error };
        }
        finally {
            pending.current = false;
            setBusy(false);
        }
    }, []);
    const save = useCallback(async (navigation = false) => {
        if (editing === null)
            return true;
        const errors: Record<string, string> = {};
        if (!name.trim())
            errors.name = "Enter a name.";
        if (editing.type === "value" && !editingSource && kind === "integer" && (defaultContent.trim() === "" || !Number.isSafeInteger(Number(defaultContent))))
            errors.defaultContent = "Enter a safe integer reset default.";
        if (editing.type === "goal") {
            if (amount.trim() === "" || !Number.isSafeInteger(Number(amount)) || Number(amount) <= 0)
                errors.amount = "Enter a positive safe integer.";
            if (mode === "saved-baseline" && (baseline.trim() === "" || !Number.isSafeInteger(Number(baseline))))
                errors.baseline = "Enter a safe integer baseline.";
        }
        setFieldErrors(errors);
        if (Object.keys(errors).length > 0)
            return { saved: false as const, error: "Correct the highlighted definition fields before saving." };
        return mutate(() => {
            if (editing.type === "group")
                return api.saveGroup(editing.id, { name });
            if (editing.type === "goal")
                return api.saveGoal(editing.id, mode === "fixed-target" ? { name, valueId, mode, target: Number(amount) } : { name, valueId, mode, baseline: Number(baseline), additionalAmount: Number(amount) });
            const resetDefault = kind === "integer" ? Number(defaultContent) : defaultContent;
            if (editingSource && editing.id !== null) return api.updateValue(editing.id, { name });
            return editing.id === null ? api.createValue(kind === "integer" ? { name, kind, resetDefault: Number(resetDefault), resetGroupId: groupId || null } : { name, kind, resetDefault: String(resetDefault), resetGroupId: groupId || null }) : api.updateValue(editing.id, { name, resetDefault, resetGroupId: groupId || null });
        }, true, navigation);
    }, [editing, editingSource, name, kind, defaultContent, groupId, valueId, mode, amount, baseline, mutate, api]);
    const saveNavigation = useCallback(() => save(true), [save]);
    const discard = useCallback(() => setEditing(null), []);
    useDirtyNavigationSource({ id: "data-definitions", summary: "Unsaved Data definition", dirty: editing !== null, save: saveNavigation, discard });
    function edit(type: "value" | "goal" | "group", item?: DataValue | DataGoal | {
        id: string;
        name: string;
    }) {
        setError(null);
        setActionError(null);
        setFieldErrors({});
        setEditing({ type, id: item?.id ?? null });
        setName(item?.name ?? "");
        if (item && "kind" in item) {
            setKind(item.kind);
            setDefaultContent(String(item.resetDefault));
            setGroupId(item.resetGroupId ?? "");
        }
        else {
            setKind("integer");
            setDefaultContent("0");
            setGroupId("");
        }
        if (item && "mode" in item) {
            setValueId(item.valueId);
            setMode(item.mode);
            setAmount(String(item.mode === "fixed-target" ? item.target : item.additionalAmount));
            setBaseline(String(item.mode === "saved-baseline" ? item.baseline : 0));
        }
        else {
            setValueId(state?.values.find(value => value.kind === "integer")?.id ?? "");
            setMode("fixed-target");
            setAmount("100");
            setBaseline("0");
        }
    }
    return <Stack className="data-management" gap="lg">
    <p>Manage reusable definitions here. Current content is read-only; change live content in <a href="/operator">Operator</a>.</p>
    {error === null ? null : <div role="alert">{error}<Button variant="default" disabled={busy} onClick={() => void load()}>Reload Data</Button>
    </div>}
    {notice === null ? null : <ManagementToast notice={notice} onDismiss={() => setNotice(null)}/>}
    {actionError === null || deleting !== null ? null : <ManagementErrorToast error={actionError} onDismiss={() => setActionError(null)}/>}
    <TwitchDataSources api={twitchSourcesApi} disabled={busy || editing !== null || deleting !== null || state === null || state.values.length >= dataOverlayLimits.values} onPendingChange={value => { sourcePending.current = value; setSourceBusy(value); }} onCreated={next => setState(current => current !== null && current.revision > next.revision ? current : next)} />
    {state === null ? <p role="status">Loading Data…</p> : <>
      <ModuleSection title="Values" label="Values" description={`${state.values.length} / ${dataOverlayLimits.values} values. Integer or plain text up to ${dataOverlayLimits.textBytes} UTF-8 bytes.`} actions={<Button disabled={busy || editing !== null || state.values.length >= dataOverlayLimits.values} onClick={() => edit("value")}>Add value</Button>}>
        {state.values.length === 0 ? <p>No values yet. Add a value to share between canvases.</p> : <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Kind</Table.Th>
              <Table.Th>Current content</Table.Th>
              <Table.Th>References</Table.Th>
            <Table.Th>Operator pin</Table.Th>
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>{state.values.map(value => <Table.Tr key={value.id}>
            <Table.Td>{value.name}</Table.Td>
            <Table.Td>{value.kind}{value.source === undefined ? "" : value.source.invalidated ? " · Twitch follower total (read-only, account changed; create a new source)" : " · Twitch follower total (read-only)"}</Table.Td>
            <Table.Td className="data-current-content">{String(value.content)}</Table.Td>
            <Table.Td>{definitionReferences(state, "value", value.id).join(", ") || "No references"}</Table.Td>
            <Table.Td>
              <Checkbox aria-label={`Pin ${value.name}`} checked={state.pinnedValueIds.includes(value.id)} disabled={busy} onChange={event => { const checked = event.currentTarget.checked; void mutate(() => api.setPins(checked ? [...state.pinnedValueIds, value.id] : state.pinnedValueIds.filter(id => id !== value.id)), false); }}/>
            </Table.Td>
            <Table.Td>
              <Group>
                <Button variant="default" disabled={busy || editing !== null} onClick={() => edit("value", value)}>Edit {value.name}</Button>
                <Button color="red" variant="light" disabled={busy || editing !== null} onClick={() => { setError(null); setDeleting({ type: "value", id: value.id, name: value.name }); }}>Delete {value.name}</Button>
              </Group>
            </Table.Td>
          </Table.Tr>)}</Table.Tbody>
        </Table>}
      </ModuleSection>
      <ModuleSection title="Goals" label="Goals" actions={<Button disabled={busy || editing !== null || state.goals.length >= dataOverlayLimits.goals || !state.values.some(value => value.kind === "integer")} onClick={() => edit("goal")}>Add goal</Button>}>
        {state.goals.length === 0 ? <p>No goals yet. Goals require an integer value.</p> : state.goals.map(goal => <Group key={goal.id}>
          <span>{goal.name} · {state.values.find(value => value.id === goal.valueId)?.name} · {goal.mode} · target {goal.mode === "fixed-target" ? goal.target : goal.baseline + goal.additionalAmount} · {definitionReferences(state, "goal", goal.id).join(", ") || "No references"}</span>
          <Button variant="default" disabled={busy || editing !== null} onClick={() => edit("goal", goal)}>Edit {goal.name}</Button>
          <Button color="red" variant="light" disabled={busy || editing !== null} onClick={() => { setError(null); setDeleting({ type: "goal", id: goal.id, name: goal.name }); }}>Delete {goal.name}</Button>
        </Group>)}
      </ModuleSection>
      <ModuleSection title="Reset groups" label="Reset groups" actions={<Button disabled={busy || editing !== null} onClick={() => edit("group")}>Add reset group</Button>}>
        {state.resetGroups.length === 0 ? <p>No reset groups yet.</p> : state.resetGroups.map(group => <Group key={group.id}>
          <span>{group.name} · {state.values.filter(value => value.resetGroupId === group.id).length} members</span>
          <Button variant="default" disabled={busy || editing !== null} onClick={() => edit("group", group)}>Edit {group.name}</Button>
          <Button color="red" variant="light" disabled={busy || editing !== null} onClick={() => { setError(null); setDeleting({ type: "group", id: group.id, name: group.name }); }}>Delete {group.name}</Button>
        </Group>)}
      </ModuleSection>
    </>}
    {editing === null ? null : <form onSubmit={event => { event.preventDefault(); void save(); }} aria-label="Data definition editor">
      <fieldset disabled={busy}>
        <Stack>
          <h2>{editing.id === null ? "Add" : "Edit"} {editing.type}</h2>
          <TextInput required label="Name" error={fieldErrors.name} value={name} onChange={event => setName(event.currentTarget.value)}/>
          {editing.type !== "value" ? null : editingSource ? <p>Twitch follower total is read-only. You can rename this value; Twitch controls its content and it cannot join a reset group.</p> : <>
            <NativeSelect label="Kind" disabled={editing.id !== null} value={kind} data={[{ value: "integer", label: "Integer" }, { value: "text", label: "Plain text" }]} onChange={event => setKind(event.currentTarget.value as typeof kind)}/>
            <TextInput required={kind === "integer"} type={kind === "integer" ? "number" : "text"} label="Reset default" error={fieldErrors.defaultContent} value={defaultContent} onChange={event => setDefaultContent(event.currentTarget.value)}/>
            <NativeSelect label="Reset group" value={groupId} data={[{ value: "", label: "No group" }, ...(state?.resetGroups.map(group => ({ value: group.id, label: group.name })) ?? [])]} onChange={event => setGroupId(event.currentTarget.value)}/>
          </>}
          {editing.type !== "goal" ? null : <>
            <NativeSelect required label="Integer value" value={valueId} data={state?.values.filter(value => value.kind === "integer").map(value => ({ value: value.id, label: value.name })) ?? []} onChange={event => setValueId(event.currentTarget.value)}/>
            <NativeSelect label="Goal mode" value={mode} data={[{ value: "fixed-target", label: "Fixed target" }, { value: "saved-baseline", label: "Saved baseline" }]} onChange={event => setMode(event.currentTarget.value as typeof mode)}/>{mode === "saved-baseline" ? <TextInput required type="number" label="Saved baseline" error={fieldErrors.baseline} value={baseline} onChange={event => setBaseline(event.currentTarget.value)}/> : null}<TextInput required type="number" min={1} label={mode === "fixed-target" ? "Target" : "Additional amount"} error={fieldErrors.amount} value={amount} onChange={event => setAmount(event.currentTarget.value)}/>
          </>}
          <Group>
            <Button type="submit">Save definition</Button>
            <Button variant="default" onClick={() => setEditing(null)}>Discard definition</Button>
          </Group>
        </Stack>
      </fieldset>
    </form>}
    {deleting === null ? null : <ManagementModalSurface open={deleting !== null} labelledBy="data-definition-delete" pending={busy} onCancel={() => { setDeleting(null); setActionError(null); }}>
      <ManagementModalTitle>Delete {deleting.name}?</ManagementModalTitle>
      <p>Referenced definitions cannot be deleted. Removing this definition cannot be undone.</p>{actionError === null ? null : <div role="alert">
        <p>{actionError.cause}</p>
        <p>{actionError.nextStep}</p>
      </div>}<Group>
        <Button disabled={busy} color="red" onClick={() => void mutate(() => deleting.type === "value" ? api.deleteValue(deleting.id) : deleting.type === "goal" ? api.deleteGoal(deleting.id) : api.deleteGroup(deleting.id))}>Confirm delete</Button>
        <Button disabled={busy} variant="default" onClick={() => { setDeleting(null); setActionError(null); }}>Cancel</Button>
      </Group>
    </ManagementModalSurface>}
  </Stack>;
}
export function message(cause: unknown): string { return cause instanceof ManagementHttpError && cause.dataReferences.length > 0 ? `${cause.message} Referenced by: ${cause.dataReferences.join(", ")}. Remove those references and retry.` : cause instanceof Error ? cause.message : "The request failed. Retry the action."; }
export function definitionReferences(state: DataOverlayState, kind: "value" | "goal", id: string): string[] {
    const references: string[] = [];
    if (kind === "value") {
        references.push(...state.goals.filter(goal => goal.valueId === id).map(goal => `Goal: ${goal.name}`));
        if (state.pinnedValueIds.includes(id))
            references.push("Operator pin");
    }
    for (const canvas of state.canvases)
        for (const element of canvas.elements) {
            const match = element.kind === "text" && element.binding !== null
                ? element.binding.kind === "value" ? kind === "value" && element.binding.valueId === id : kind === "goal" && element.binding.goalId === id
                : element.kind === "progress" && kind === "goal" && element.goalId === id;
            if (match)
                references.push(`Canvas: ${canvas.name} (${element.kind})`);
        }
    return references;
}
