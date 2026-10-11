import { Button, Group, Stack, TextInput } from "@mantine/core";
import { twitchFollowerSourceInputSchema, type DataOverlayState, type TwitchDataSourceStatus } from "@stream-jams/core";
import { useEffect, useRef, useState } from "react";
import { ModuleSection } from "../foundation/ModulePageLayout.js";
import { ManagementErrorToast, ManagementToast, type ManagementToastNotice } from "../foundation/ManagementToast.js";
import { actionableError } from "../foundation/actionable-error.js";
import type { ActionableManagementError } from "@stream-jams/core";
import { ManagementHttpError } from "../management-http-client.js";
import { defaultTwitchDataSourcesApi, type TwitchDataSourcesApi } from "./twitch-data-sources-api.js";

export function TwitchDataSources({ api = defaultTwitchDataSourcesApi, onCreated, onPendingChange, disabled = false }: { readonly api?: TwitchDataSourcesApi | undefined; readonly onCreated: (state: DataOverlayState) => void; readonly onPendingChange?: (pending: boolean) => void; readonly disabled?: boolean }) {
  const [status, setStatus] = useState<TwitchDataSourceStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [actionError, setActionError] = useState<ActionableManagementError | null>(null);
  const [notice, setNotice] = useState<ManagementToastNotice | null>(null);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const epoch = useRef(0);
  const mounted = useRef(false);
  const pendingCallback = useRef(onPendingChange);
  pendingCallback.current = onPendingChange;
  useEffect(() => {
    mounted.current = true;
    busy.current = false; setPending(false); setStatus(null); setLoadError(null);
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      const generation = epoch.current;
      try {
        if (!document.hidden && !busy.current) {
          const next = await api.getStatus();
          if (!disposed && generation === epoch.current) { setStatus(next); setLoadError(null); }
        }
      } catch (cause) {
        if (!disposed && generation === epoch.current) setLoadError(errorMessage(cause));
      } finally { if (!disposed) timer = setTimeout(() => void poll(), 5000); }
    }
    void poll();
    return () => { disposed = true; mounted.current = false; epoch.current++; clearTimeout(timer); pendingCallback.current?.(false); };
  }, [api]);
  async function create() {
    if (busy.current || disabled || status?.follower.broadcasterId == null || loadError !== null) return;
    const input = twitchFollowerSourceInputSchema.safeParse({ name });
    if (!input.success) { setFieldError("Enter a name up to 120 characters."); return; }
    busy.current = true; epoch.current++; const generation = epoch.current;
    pendingCallback.current?.(true);
    setPending(true); setFieldError(undefined); setActionError(null); setNotice(null);
    try {
      const state = await api.createFollowers(input.data);
      if (!mounted.current || generation !== epoch.current) return;
      onCreated(state); setName("");
      setNotice({ tone: "success", message: "Follower value created. Twitch refreshes its total automatically." });
      // A status response started before creation must never overwrite this refresh.
      try {
        const next = await api.getStatus();
        if (mounted.current && generation === epoch.current) { setStatus(next); setLoadError(null); }
      } catch (cause) { if (mounted.current && generation === epoch.current) setLoadError(errorMessage(cause)); }
    } catch (cause) {
      if (mounted.current && generation === epoch.current) setActionError(actionableError(cause, "Follower value was not created", errorMessage(cause)));
    } finally { if (generation === epoch.current) { busy.current = false; pendingCallback.current?.(false); if (mounted.current) setPending(false); } }
  }
  return <ModuleSection title="Twitch data sources" label="Twitch data sources">
    <Stack>
      {loadError === null ? null : <p role="alert">Twitch data status may be stale. {loadError} Status retries automatically.</p>}
      {status === null ? <p role="status">Loading Twitch data sources…</p> : <>
        <p>Follower total: {followerMessage(status.follower.state)}{status.follower.updatedAt === null ? "" : ` Last refreshed: ${status.follower.updatedAt}.`}</p>
        <p>Follower totals refresh every 60 seconds. Twitch owns this value; live corrections and resets are unavailable. You can use it in a custom saved-baseline goal.</p>
        <p>Creator Goals: {status.goals.state === "reauthorization-required" ? `Reauthorization required (${status.goals.missingScopes.join(", ")}). Reconnect Twitch in Event sources. Existing alert intake remains available.` : status.goals.state === "disconnected" ? "Disconnected. Connect Twitch in Event sources." : "Creator Goal integration pending."} Live Creator Goal selection is unavailable.</p>
        <Group><Button component="a" href="/manage/event-sources" variant="default" disabled={pending}>{status.follower.broadcasterId === null ? "Connect Twitch in Event sources" : "Review or reconnect Twitch"}</Button></Group>
        <form aria-label="Create Twitch follower value" onSubmit={event => { event.preventDefault(); void create(); }}>
          <Stack>
            <TextInput label="Follower value name" value={name} onChange={event => setName(event.currentTarget.value)} error={fieldError} required disabled={pending || disabled} />
            <Button type="submit" disabled={pending || disabled || loadError !== null || status.follower.broadcasterId === null || !name.trim()}>Create follower value</Button>
          </Stack>
        </form>
      </>}
      {notice === null ? null : <ManagementToast notice={notice} onDismiss={() => setNotice(null)} />}
      {actionError === null ? null : <ManagementErrorToast error={actionError} onDismiss={() => setActionError(null)} />}
    </Stack>
  </ModuleSection>;
}
function followerMessage(state: TwitchDataSourceStatus["follower"]["state"]) {
  return { unconfigured: "Not configured. Create a follower value to start refreshing.", current: "Current.", stale: "Stale. Last known total is retained while Twitch refresh retries.", invalid: "Awaiting a valid total. Check the connected account; bindings from a different broadcaster require a new follower value.", disconnected: "Disconnected. Reconnect Twitch in Event sources." }[state];
}
function errorMessage(cause: unknown): string {
  return cause instanceof ManagementHttpError ? `${cause.message}${cause.referenceId === null ? "" : ` Reference: ${cause.referenceId}.`}` : cause instanceof Error ? `${cause.message} Check the local service and retry.` : "Check the local service and retry.";
}
