import { NativeSelect, Stack, TextInput } from "@mantine/core";
import { useState } from "react";
import type { DataOverlayState, DataTemplateMapping, DataTemplateSlot, DataValueCreateInput } from "@stream-jams/core";

export function TemplateSlotMapping({ slot, state, onChange, disabled, sourceValueIds }: { readonly slot: DataTemplateSlot; readonly state: DataOverlayState; readonly onChange: (mapping: DataTemplateMapping) => void; readonly disabled: boolean; readonly sourceValueIds?: readonly string[] | undefined }) {
  const values = state.values.filter(value => (slot.kind === "goal" ? value.kind === "integer" : value.kind === slot.valueKind) && (!slot.requiredSource || value.source?.provider === slot.requiredSource.provider && value.source.kind === slot.requiredSource.kind && sourceValueIds?.includes(value.id)));
  const goals = state.goals.filter(goal => values.some(value => value.id === goal.valueId));
  const [choice, setChoice] = useState(slot.requiredSource ? "" : "new");
  const [name, setName] = useState(slot.name);
  const [content, setContent] = useState(slot.kind === "value" && slot.valueKind === "text" ? "" : "0");
  const [goalName, setGoalName] = useState(`${slot.name} goal`);
  const [mode, setMode] = useState<"fixed-target" | "saved-baseline">("fixed-target");
  const [amount, setAmount] = useState("100");
  const [goalValue, setGoalValue] = useState("new");
  function emit(next: { choice?: string; name?: string; content?: string; goalName?: string; mode?: typeof mode; amount?: string; goalValue?: string } = {}) {
    const pick = next.choice ?? choice;
    if (pick.startsWith("value:")) { onChange({ slotId: slot.id, mapping: { kind: "value", valueId: pick.slice(6) } }); return; }
    if (pick.startsWith("goal:")) { onChange({ slotId: slot.id, mapping: { kind: "goal", goalId: pick.slice(5) } }); return; }
    if (pick !== "new") return;
    const kind = slot.kind === "goal" ? "integer" : slot.valueKind;
    const common = { name: next.name ?? name, resetGroupId: null };
    const definition: DataValueCreateInput = kind === "integer" ? { ...common, kind: "integer", resetDefault: Number(next.content ?? content) } : { ...common, kind: "text", resetDefault: next.content ?? content };
    if (slot.kind === "value") onChange({ slotId: slot.id, mapping: { kind: "new-value", definition } });
    else onChange({ slotId: slot.id, mapping: { kind: "new-goal", value: (next.goalValue ?? goalValue) === "new" ? { kind: "new", definition: { ...definition, kind: "integer", resetDefault: Number(next.content ?? content) } } : { kind: "existing", valueId: next.goalValue ?? goalValue }, goal: (next.mode ?? mode) === "fixed-target" ? { name: next.goalName ?? goalName, mode: "fixed-target", target: Number(next.amount ?? amount) } : { name: next.goalName ?? goalName, mode: "saved-baseline", additionalAmount: Number(next.amount ?? amount) } } });
  }
  return <fieldset disabled={disabled}><legend>{slot.name}</legend><Stack gap="xs">
    {slot.requiredSource ? <p>This slot requires a configured Twitch follower total. Configure or reconnect it in {disabled ? "Data" : <a href="/manage/data">Data</a>}, then choose its value or goal. Readiness is checked when applying.</p> : null}
    <NativeSelect label={`Map ${slot.name}`} value={choice} data={[...(slot.requiredSource ? [{ value: "", label: "Choose a compatible source" }] : [{ value: "new", label: slot.kind === "value" ? "Create custom value" : "Create custom goal" }]), ...(slot.kind === "value" ? values.map(value => ({ value: `value:${value.id}`, label: value.name })) : goals.map(goal => ({ value: `goal:${goal.id}`, label: goal.name })))]} onChange={event => { setChoice(event.currentTarget.value); emit({ choice: event.currentTarget.value }); }} />
    {choice === "new" ? <>
      {slot.kind === "goal" ? <NativeSelect label={`${slot.name} backing value`} value={goalValue} data={[{ value: "new", label: "Create integer value" }, ...values.map(value => ({ value: value.id, label: value.name }))]} onChange={event => { setGoalValue(event.currentTarget.value); emit({ goalValue: event.currentTarget.value }); }} /> : null}
      {slot.kind === "value" || goalValue === "new" ? <><TextInput required label={`${slot.name} value name`} value={name} onChange={event => { setName(event.currentTarget.value); emit({ name: event.currentTarget.value }); }} /><TextInput required={slot.kind === "goal" || slot.valueKind === "integer"} label={`${slot.name} initial value`} type={slot.kind === "goal" || slot.valueKind === "integer" ? "number" : "text"} step={1} value={content} onChange={event => { setContent(event.currentTarget.value); emit({ content: event.currentTarget.value }); }} /></> : null}
      {slot.kind === "goal" ? <><TextInput required label={`${slot.name} goal name`} value={goalName} onChange={event => { setGoalName(event.currentTarget.value); emit({ goalName: event.currentTarget.value }); }} /><NativeSelect label={`${slot.name} goal mode`} value={mode} data={[{ value: "fixed-target", label: "Fixed target" }, { value: "saved-baseline", label: "Progress from current value" }]} onChange={event => { const value = event.currentTarget.value as typeof mode; setMode(value); emit({ mode: value }); }} /><TextInput required label={`${slot.name} ${mode === "fixed-target" ? "target" : "additional amount"}`} type="number" min={1} step={1} value={amount} onChange={event => { setAmount(event.currentTarget.value); emit({ amount: event.currentTarget.value }); }} /></> : null}
    </> : null}
  </Stack></fieldset>;
}

export function initialTemplateMappings(slots: readonly DataTemplateSlot[]): DataTemplateMapping[] {
  return slots.filter(slot => !slot.requiredSource).map(slot => ({ slotId: slot.id, mapping: slot.kind === "value" ? { kind: "new-value" as const, definition: slot.valueKind === "integer" ? { name: slot.name, kind: "integer" as const, resetDefault: 0, resetGroupId: null } : { name: slot.name, kind: "text" as const, resetDefault: "", resetGroupId: null } } : { kind: "new-goal" as const, value: { kind: "new" as const, definition: { name: slot.name, kind: "integer" as const, resetDefault: 0, resetGroupId: null } }, goal: { name: `${slot.name} goal`, mode: "fixed-target" as const, target: 100 } } }));
}
