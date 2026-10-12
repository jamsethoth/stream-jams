import { Button, Group, NativeSelect, Stack, TextInput } from "@mantine/core";
import { supportedTwitchGoalTypeSchema, twitchGoalSourceInputSchema, type DataOverlayState, type SupportedTwitchGoalType, type TwitchDataSourceStatus, type TwitchGoalSourceInput } from "@stream-jams/core";
import { useState } from "react";

export function goalUnits(type: string): string {
  return type === "follower" ? "followers" : type === "subscription" || type === "new_subscription" ? "sub points" : type === "subscription_count" || type === "new_subscription_count" ? "subscriptions" : "unsupported";
}
const typeOptions: { value: SupportedTwitchGoalType; label: string }[] = [
  { value: "follower", label: "Followers" }, { value: "subscription", label: "Subscription points" },
  { value: "subscription_count", label: "Subscriptions" }, { value: "new_subscription", label: "New subscription points" },
  { value: "new_subscription_count", label: "New subscriptions" }
];
export function TwitchGoalControls({ status, dataState, disabled, onSave }: {
  readonly status: TwitchDataSourceStatus["goals"]; readonly dataState?: DataOverlayState | null | undefined; readonly disabled: boolean;
  readonly onSave: (id: string | null, input: TwitchGoalSourceInput) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"active-type" | "pinned">("active-type");
  const [type, setType] = useState<SupportedTwitchGoalType>("follower");
  const [goalId, setGoalId] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>();
  const unavailable = disabled || status.broadcasterId === null || ["reauthorization-required", "disconnected", "error", "waiting"].includes(status.state);
  const message = {
    waiting: "Waiting for Twitch goal subscriptions and the first snapshot.", current: "Current.",
    stale: "Stale. Last known amounts are retained for up to ten minutes while refresh retries.",
    ended: "No active matching goal. Latest-of-type bindings follow the next matching goal; pinned goals require rebind.",
    invalid: "Account changed. Rebind each goal explicitly; invalid bindings are hidden from overlays.",
    error: "Goal refresh failed. Review Twitch in Event sources; refresh retries automatically.",
    "reauthorization-required": `Reauthorization required (${status.missingScopes.join(", ") || "channel:read:goals"}). Reconnect Twitch in Event sources. Existing alert intake remains available.`,
    disconnected: "Disconnected. Connect Twitch in Event sources."
  }[status.state];
  return <Stack gap="sm">
    <p>Creator Goals: {message}{status.updatedAt === null ? "" : ` Last refreshed: ${status.updatedAt}.`}</p>
    <p>Twitch owns the counts and targets. Bindings are independent of canvases. Sub-point goals measure points, not subscribers.</p>
    {status.activeGoals.length === 0 ? <p>No active Creator Goals.</p> : <ul aria-label="Active Twitch goals">{status.activeGoals.map(goal => {
      const supported = supportedTwitchGoalTypeSchema.safeParse(goal.type).success;
      return <li key={goal.id}>{goal.description || goal.id} · {goal.type} · {goal.current_amount} / {goal.target_amount} {goalUnits(goal.type)} · started {goal.started_at}
        <Button variant="default" size="xs" disabled={unavailable || !supported} onClick={() => { setMode("pinned"); setGoalId(goal.id); if (!name) setName(goal.description || "Twitch goal"); }}>Pin {goal.description || goal.id}</Button>
        {supported ? null : <span> Unsupported type; cannot bind.</span>}
      </li>;
    })}</ul>}
    {status.bindings.length === 0 ? null : <ul aria-label="Creator Goal bindings">{status.bindings.map(binding => {
      const goal = dataState?.goals.find(item => item.id === binding.goalId);
      const value = dataState?.values.find(item => item.id === binding.valueId);
      return <li key={binding.goalId}>{goal?.name ?? binding.goalId} · {value?.source?.kind === "creator-goal" && value.source.binding.mode === "pinned" ? "Pinned" : "Latest of type"} · selected {binding.selectedGoalId ?? "none"} · {binding.state} · {binding.units}
        <Button variant="default" disabled={disabled || status.broadcasterId === null} onClick={() => {
          setEditingId(binding.goalId); setName(goal?.name ?? value?.name ?? "Twitch goal"); setError(undefined);
          if (value?.source?.kind === "creator-goal") { const current = value.source.binding; setMode(current.mode); if (current.mode === "pinned") setGoalId(current.goalId); else setType(current.type); }
        }}>Rebind {goal?.name ?? binding.goalId}</Button>
      </li>;
    })}</ul>}
    <form aria-label="Configure Twitch Creator Goal" onSubmit={event => {
      event.preventDefault(); if (unavailable) return;
      const input = twitchGoalSourceInputSchema.safeParse({ name, binding: mode === "active-type" ? { mode, type } : { mode, goalId } });
      if (!input.success) { setError("Enter a name up to 120 characters and select a supported goal."); return; }
      setError(undefined); void onSave(editingId, input.data);
    }}><Stack gap="sm">
      <TextInput label="Creator Goal name" required value={name} error={error} disabled={disabled} onChange={event => setName(event.currentTarget.value)} />
      <NativeSelect label="Goal binding" value={mode} disabled={disabled} data={[{ value: "active-type", label: "Latest active goal of type (automatic)" }, { value: "pinned", label: "Pin one goal (manual rebind after ending)" }]} onChange={event => setMode(event.currentTarget.value as typeof mode)} />
      {mode === "active-type" ? <NativeSelect label="Twitch goal type" data={typeOptions} value={type} disabled={disabled} onChange={event => setType(event.currentTarget.value as SupportedTwitchGoalType)} /> : <NativeSelect label="Pinned Twitch goal" value={goalId} disabled={disabled} data={[{ value: "", label: "Choose an active goal" }, ...status.activeGoals.map(goal => ({ value: goal.id, label: `${goal.description || goal.id} · ${goal.type} · ${goal.current_amount}/${goal.target_amount} ${goalUnits(goal.type)}`, disabled: !supportedTwitchGoalTypeSchema.safeParse(goal.type).success }))]} onChange={event => setGoalId(event.currentTarget.value)} />}
      <Group><Button type="submit" disabled={unavailable || !name.trim() || (mode === "pinned" && !status.activeGoals.some(goal => goal.id === goalId && supportedTwitchGoalTypeSchema.safeParse(goal.type).success))}>{editingId === null ? "Create Creator Goal" : "Save Creator Goal rebind"}</Button>
        {editingId === null ? null : <Button variant="default" disabled={disabled} onClick={() => { setEditingId(null); setName(""); setError(undefined); }}>Cancel rebind</Button>}</Group>
    </Stack></form>
  </Stack>;
}
