import type {
  ActionableManagementError,
  AudioOutputDevice,
  AudioOutputRoute,
  AudioRouteStatus
} from "@stream-jams/core";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction
} from "react";
import { DestructiveConfirmationDialog } from "../foundation/DestructiveConfirmationDialog.js";
import { ManagementErrorBanner } from "../foundation/ManagementErrorBanner.js";
import { ManagementErrorToast, ManagementToast, type ManagementToastNotice } from "../foundation/ManagementToast.js";
import { StatusBadge, type StatusBadgeTone } from "../foundation/StatusBadge.js";
import { ManagementHttpError } from "../management-http-client.js";
import type { AudioApi } from "./audio-api.js";
import { useAudioStatus } from "./use-audio-status.js";
import "./audio-outputs-panel.css";

interface RouteDraft {
  readonly id: string;
  readonly savedName: string;
  readonly savedDeviceId: string | null;
  readonly name: string;
  readonly deviceId: string | null;
}

interface ConflictState {
  readonly kind: "delete" | "rebind";
  readonly routeId: string;
  readonly summary: string;
  readonly nextStep: string;
  readonly references: readonly { readonly alertId: string; readonly name: string }[];
}

export interface AudioOutputsPanelHandle {
  save(): Promise<boolean>;
  discard(): void;
}

export interface AudioOutputsPanelProps {
  readonly audioApi: AudioApi;
  readonly onDirtyChange?: ((dirty: boolean) => void) | undefined;
}

export const AudioOutputsPanel = forwardRef<AudioOutputsPanelHandle, AudioOutputsPanelProps>(function AudioOutputsPanel(
  { audioApi, onDirtyChange },
  ref
) {
  const { status, loading, error: refreshError, refresh } = useAudioStatus(audioApi);
  const [drafts, setDrafts] = useState<readonly RouteDraft[]>([]);
  const [newName, setNewName] = useState("");
  const [newDeviceId, setNewDeviceId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteRoute, setDeleteRoute] = useState<AudioOutputRoute | null>(null);
  const [conflict, setConflict] = useState<ConflictState | null>(null);
  const [notice, setNotice] = useState<ManagementToastNotice | null>(null);
  const [actionError, setActionError] = useState<ActionableManagementError | null>(null);
  const mutationInProgressRef = useRef(false);

  useEffect(() => {
    if (status === null) return;
    setDrafts((current) => {
      if (mutationInProgressRef.current) return current;
      return status.routes.map(({ route }) => {
        const existing = current.find((draft) => draft.id === route.id);
        return existing !== undefined && isDirty(existing) ? existing : toDraft(route);
      });
    });
  }, [status]);

  const newOutputDirty = newName !== "" || newDeviceId !== null;
  const dirty = drafts.some(isDirty) || newOutputDirty;
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

  const saveOne = useCallback(async (draft: RouteDraft, confirmLiveImpact = false): Promise<boolean> => {
    if (!isDirty(draft)) return true;
    mutationInProgressRef.current = true;
    setBusyId(draft.id);
    setActionError(null);
    setConflict(null);
    try {
      const route = await audioApi.updateRoute(draft.id, {
        ...(draft.name !== draft.savedName ? { name: draft.name.trim() } : {}),
        ...(draft.deviceId !== draft.savedDeviceId ? { deviceId: draft.deviceId } : {}),
        confirmLiveImpact
      });
      setDrafts((current) => current.map((candidate) => candidate.id === route.id ? toDraft(route) : candidate));
      setNotice({
        tone: route.deviceId === null ? "warning" : "success",
        message: `${route.name} saved.`,
        ...(route.deviceId === null ? { detail: "Bind an output device before using or testing this route." } : {})
      });
      await refresh();
      return true;
    } catch (cause) {
      if (cause instanceof ManagementHttpError && cause.code === "AUDIO_ROUTE_CONFIRMATION_REQUIRED") {
        setConflict({
          kind: "rebind",
          routeId: draft.id,
          summary: cause.message,
          nextStep: cause.nextStep ?? "Review the affected alerts, then confirm the binding change.",
          references: cause.references
        });
      } else {
        setActionError(actionable("Audio output was not saved", cause, "Review the output name and device, then retry."));
      }
      return false;
    } finally {
      mutationInProgressRef.current = false;
      setBusyId(null);
    }
  }, [audioApi, refresh]);

  const saveNewOutput = useCallback(async (): Promise<boolean> => {
    if (!newOutputDirty) return true;
    const name = newName.trim();
    if (name === "") {
      setActionError(actionable("Audio output needs a name", "The name is empty.", "Enter a unique name, then create the output."));
      return false;
    }
    mutationInProgressRef.current = true;
    setBusyId("new");
    setActionError(null);
    setConflict(null);
    try {
      const created = await audioApi.createRoute({ name, deviceId: newDeviceId });
      setNewName("");
      setNewDeviceId(null);
      setDrafts((current) => [...current, toDraft(created)]);
      setNotice({
        tone: created.deviceId === null ? "warning" : "success",
        message: `${created.name} created.`,
        ...(created.deviceId === null ? { detail: "Bind an output device before using or testing this route." } : {})
      });
      await refresh();
      return true;
    } catch (cause) {
      setActionError(actionable("Audio output was not created", cause, "Use a unique name and an available explicit output device, then retry."));
      return false;
    } finally {
      mutationInProgressRef.current = false;
      setBusyId(null);
    }
  }, [audioApi, newDeviceId, newName, newOutputDirty, refresh]);

  const saveAll = useCallback(async (): Promise<boolean> => {
    if (mutationInProgressRef.current) return false;
    if (newOutputDirty && newName.trim() === "") {
      setActionError(actionable("Audio output needs a name", "The name is empty.", "Enter a unique name, then create the output."));
      return false;
    }
    if (drafts.some((draft) => isDirty(draft) && draft.name.trim() === "")) {
      setActionError(actionable("Audio output needs a name", "A saved route name is empty.", "Enter a unique name, then save the output."));
      return false;
    }
    for (const draft of drafts) {
      if (isDirty(draft) && !(await saveOne(draft))) return false;
    }
    return saveNewOutput();
  }, [drafts, newName, newOutputDirty, saveNewOutput, saveOne]);

  const discard = useCallback(() => {
    if (status !== null) setDrafts(status.routes.map(({ route }) => toDraft(route)));
    setNewName("");
    setNewDeviceId(null);
    setConflict(null);
    setActionError(null);
  }, [status]);

  useImperativeHandle(ref, () => ({ save: saveAll, discard }), [discard, saveAll]);

  function createOutput(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void saveNewOutput();
  }

  async function confirmDelete() {
    if (deleteRoute === null) return;
    const route = deleteRoute;
    setDeleteRoute(null);
    mutationInProgressRef.current = true;
    setBusyId(route.id);
    setActionError(null);
    setConflict(null);
    try {
      await audioApi.deleteRoute(route.id);
      setDrafts((current) => current.filter((draft) => draft.id !== route.id));
      setNotice({ tone: "success", message: `${route.name} deleted.` });
      await refresh();
    } catch (cause) {
      if (cause instanceof ManagementHttpError && cause.code === "AUDIO_ROUTE_REFERENCED") {
        setConflict({
          kind: "delete",
          routeId: route.id,
          summary: cause.message,
          nextStep: cause.nextStep ?? "Remove this route from the listed alerts before deleting it.",
          references: cause.references
        });
      } else {
        setActionError(actionable("Audio output was not deleted", cause, "Resolve the reported problem and retry."));
      }
    } finally {
      mutationInProgressRef.current = false;
      setBusyId(null);
    }
  }

  async function testOutput(route: AudioOutputRoute) {
    mutationInProgressRef.current = true;
    setBusyId(route.id);
    setActionError(null);
    setConflict(null);
    try {
      const result = await audioApi.testRoute(route.id);
      setNotice(result.muted
        ? { tone: "warning", message: `${route.name} test completed while global alert audio was muted.`, detail: "Unmute alert audio before testing again if you need to hear the tone." }
        : { tone: "success", message: `${route.name} played a one-second test tone.` });
    } catch (cause) {
      setActionError(actionable("Audio test did not complete", cause, "Check the selected device and global mute, then retry."));
    } finally {
      mutationInProgressRef.current = false;
      setBusyId(null);
    }
  }

  async function retryAudioPlayer() {
    mutationInProgressRef.current = true;
    setBusyId("retry");
    setActionError(null);
    try {
      await audioApi.retry();
      setNotice({ tone: "success", message: "Audio player retry requested." });
      await refresh();
    } catch (cause) {
      setActionError(actionable("Audio player could not be retried", cause, "Restart the desktop app if retry continues to fail."));
    } finally {
      mutationInProgressRef.current = false;
      setBusyId(null);
    }
  }

  if (status === null && loading) {
    return <section aria-labelledby="audio-outputs-heading" className="audio-outputs" id="audio-outputs"><h3 id="audio-outputs-heading">Audio outputs</h3><p className="management-empty" role="status">Loading audio outputs...</p></section>;
  }

  if (status === null) {
    return (
      <section aria-labelledby="audio-outputs-heading" className="audio-outputs" id="audio-outputs">
        <h3 id="audio-outputs-heading">Audio outputs</h3>
        <ManagementErrorBanner error={actionable("Audio outputs could not be loaded", refreshError, "Check the local service, then retry." )} />
        <button onClick={() => void refresh()} type="button">Retry loading audio outputs</button>
      </section>
    );
  }

  const routeStatuses = new Map(status.routes.map((entry) => [entry.route.id, entry]));
  const devices = status.capability.devices;

  return (
    <section aria-labelledby="audio-outputs-heading" className="audio-outputs" id="audio-outputs">
      <div className="audio-outputs__heading">
        <div>
          <h3 id="audio-outputs-heading">Audio outputs</h3>
          <p>Name local playback destinations once, then select them from alert settings.</p>
        </div>
        <StatusBadge label={!status.capability.available ? "Device playback unavailable" : status.muted ? "Globally muted" : "Device playback available"} tone={status.muted || !status.capability.available ? "warning" : "positive"} />
      </div>

      <div className="audio-outputs__guidance">
        <p><strong>Private-output reminder:</strong> OBS Desktop Audio or monitoring can independently capture a selected endpoint.</p>
        <p>Browser Source and local-device paths may have different latency. These controls do not change TTS routing.</p>
      </div>

      {refreshError === null ? null : (
        <ManagementErrorBanner error={actionable("Audio output status is stale", refreshError, "The last known routes are retained. Check the device connection, then retry status refresh.")} role="status" />
      )}
      {actionError === null ? null : <ManagementErrorToast error={actionError} onDismiss={() => setActionError(null)} />}
      {notice === null ? null : <ManagementToast notice={notice} onDismiss={() => setNotice(null)} />}

      {status.capability.available ? null : (
        <div className="audio-outputs__unavailable" role="status">
          <div><strong>Local device playback is unavailable.</strong><p>{status.capability.nextStep ?? "Open the desktop app to enumerate and test local output devices."}</p></div>
          <button className="button button--secondary" disabled={busyId !== null} onClick={() => void retryAudioPlayer()} type="button">{busyId === "retry" ? "Retrying audio player..." : "Retry audio player"}</button>
        </div>
      )}

      {conflict === null ? null : <ConflictNotice busy={busyId !== null} conflict={conflict} onConfirm={conflict.kind === "rebind" ? () => {
        const draft = drafts.find((candidate) => candidate.id === conflict.routeId);
        if (draft !== undefined) void saveOne(draft, true);
      } : null} />}

      <form className="audio-outputs__create" onSubmit={createOutput}>
        <label><span>New output name</span><input disabled={busyId !== null} maxLength={120} onChange={(event) => setNewName(event.currentTarget.value)} value={newName} /></label>
        <DeviceSelect available={status.capability.available} devices={devices} disabled={busyId !== null} label="New output device" onChange={setNewDeviceId} route={null} value={newDeviceId} />
        <button disabled={busyId !== null || newName.trim() === ""} type="submit">{busyId === "new" ? "Creating output..." : "Create output"}</button>
      </form>

      {drafts.length === 0 ? <p className="management-empty">No named audio outputs yet. Create one to route explicit alert audio to a local device.</p> : (
        <div className="audio-outputs__list">
          {drafts.map((draft) => {
            const routeStatus = routeStatuses.get(draft.id) ?? fallbackStatus(draft);
            const route = routeStatus.route;
            const routeBusy = busyId === route.id;
            return (
              <fieldset aria-label={`${route.name} audio output`} className="audio-output-route" disabled={busyId !== null} key={route.id}>
                <legend><span>{route.name}</span><StatusBadge label={stateLabel(routeStatus.state)} tone={stateTone(routeStatus.state)} /></legend>
                <label><span>Output name</span><input maxLength={120} onChange={(event) => updateDraft(setDrafts, draft.id, { name: event.currentTarget.value })} value={draft.name} /></label>
                <DeviceSelect available={status.capability.available} devices={devices} disabled={busyId !== null} label="Output device" onChange={(deviceId) => updateDraft(setDrafts, draft.id, { deviceId })} route={route} value={draft.deviceId} />
                <p className="audio-output-route__state">{stateDescription(routeStatus)}</p>
                <div className="audio-output-route__actions">
                  <button disabled={!isDirty(draft) || draft.name.trim() === ""} onClick={() => void saveOne(draft)} type="button">{routeBusy ? "Saving output..." : "Save output"}</button>
                  <button className="button button--secondary" disabled={routeStatus.state !== "ready" || isDirty(draft) || busyId !== null} onClick={() => void testOutput(route)} type="button">Test {route.name}</button>
                  <button className="button button--danger-quiet" disabled={busyId !== null} onClick={() => setDeleteRoute(route)} type="button">Delete {route.name}</button>
                </div>
              </fieldset>
            );
          })}
        </div>
      )}

      <DestructiveConfirmationDialog
        actionLabel="Delete output"
        consequences="The named route will be removed and cannot be undone. Referenced routes are blocked and the affected alerts will be listed."
        onCancel={() => setDeleteRoute(null)}
        onConfirm={() => void confirmDelete()}
        open={deleteRoute !== null}
        recovery="Create a new named output and reassign it to alerts if needed."
        scope={deleteRoute?.name ?? "Selected audio output"}
        title={`Delete ${deleteRoute?.name ?? "audio output"}?`}
      />
    </section>
  );
});

function DeviceSelect({ available, devices, disabled, label, onChange, route, value }: {
  readonly available: boolean;
  readonly devices: readonly AudioOutputDevice[];
  readonly disabled: boolean;
  readonly label: string;
  readonly onChange: (deviceId: string | null) => void;
  readonly route: AudioOutputRoute | null;
  readonly value: string | null;
}) {
  const missingSelection = value !== null && !devices.some((device) => device.deviceId === value);
  return (
    <label>
      <span>{label}</span>
      <select disabled={disabled || !available} onChange={(event) => onChange(event.currentTarget.value === "" ? null : event.currentTarget.value)} value={value ?? ""}>
        <option value="">Not bound</option>
        {missingSelection ? <option value={value!}>{route?.deviceLabel ?? value} (missing)</option> : null}
        {devices.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label}</option>)}
      </select>
    </label>
  );
}

function ConflictNotice({ busy, conflict, onConfirm }: { readonly busy: boolean; readonly conflict: ConflictState; readonly onConfirm: (() => void) | null }) {
  return (
    <section className="audio-outputs__conflict" role="alert">
      <strong>{conflict.kind === "rebind" ? "Confirm affected alerts before rebinding" : "Output is still used by alerts"}</strong>
      <p>{conflict.summary}</p>
      {conflict.references.length === 0 ? null : <ul>{conflict.references.map((reference) => <li key={reference.alertId}>{reference.name}</li>)}</ul>}
      <p><span className="management-error-banner__label">Next step:</span> {conflict.nextStep}</p>
      {onConfirm === null ? null : <button disabled={busy} onClick={onConfirm} type="button">Confirm binding change</button>}
    </section>
  );
}

function updateDraft(
  setDrafts: Dispatch<SetStateAction<readonly RouteDraft[]>>,
  id: string,
  patch: Partial<Pick<RouteDraft, "name" | "deviceId">>
) {
  setDrafts((current) => current.map((draft) => draft.id === id ? { ...draft, ...patch } : draft));
}

function toDraft(route: AudioOutputRoute): RouteDraft {
  return { id: route.id, name: route.name, deviceId: route.deviceId, savedName: route.name, savedDeviceId: route.deviceId };
}

function isDirty(draft: RouteDraft): boolean {
  return draft.name !== draft.savedName || draft.deviceId !== draft.savedDeviceId;
}

function fallbackStatus(draft: RouteDraft): AudioRouteStatus {
  return { route: { id: draft.id, name: draft.savedName, deviceId: draft.savedDeviceId, deviceLabel: draft.savedDeviceId }, state: draft.savedDeviceId === null ? "unbound" : "unavailable" };
}

function stateLabel(state: AudioRouteStatus["state"]): string {
  return state === "ready" ? "Ready" : state === "unbound" ? "Needs binding" : state === "missing-device" ? "Device missing" : "Unavailable";
}

function stateTone(state: AudioRouteStatus["state"]): StatusBadgeTone {
  return state === "ready" ? "positive" : state === "unbound" ? "neutral" : state === "missing-device" ? "warning" : "negative";
}

function stateDescription(status: AudioRouteStatus): string {
  if (status.state === "ready") return `Bound to ${status.route.deviceLabel}. Testing plays one explicit one-second tone.`;
  if (status.state === "unbound") return "Choose an explicit output device and save before testing or assigning this route.";
  if (status.state === "missing-device") return `${status.route.deviceLabel ?? "The saved device"} is not currently available. Reconnect it or choose and save a replacement; audio will not fall back.`;
  return "The saved binding is preserved, but local device playback is unavailable in this runtime.";
}

function actionable(summary: string, cause: unknown, nextStep: string): ActionableManagementError {
  const httpError = cause instanceof ManagementHttpError ? cause : null;
  return {
    summary,
    cause: cause instanceof Error ? cause.message : typeof cause === "string" ? cause : "The operation did not complete.",
    nextStep: httpError?.nextStep ?? nextStep,
    severity: "error",
    occurredAt: new Date().toISOString(),
    referenceId: httpError?.referenceId ?? null,
    correction: null
  };
}
