import { Button, NativeSelect } from "@mantine/core";
import { eventBusReplayAgeDefaultSeconds, type ActionableManagementError, type EventBusSettings } from "@stream-jams/core";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ManagementErrorBanner } from "../foundation/ManagementErrorBanner.js";
import { useDirtyNavigationSource } from "../navigation/dirty-navigation.js";

export interface EventReplaySettingsApi {
  getEventBusSettings(): Promise<EventBusSettings>;
  saveEventBusSettings(settings: EventBusSettings): Promise<EventBusSettings>;
}

const replayAgeOptions: readonly number[] = [0, 30, 60, 120, 300, 600, 900, 1_800];

/** Chooses how old an event missed during a restart may be and still play. */
export function EventReplaySettings({ api }: { readonly api: EventReplaySettingsApi }) {
  const [saved, setSaved] = useState<EventBusSettings | null>(null);
  const [draft, setDraft] = useState<number>(eventBusReplayAgeDefaultSeconds);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<ActionableManagementError | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const settings = await api.getEventBusSettings();
      setSaved(settings);
      setDraft(settings.replayAgeSeconds);
    } catch (cause) {
      setError(actionable("Event replay settings could not be loaded", cause, "Check that the local service is running, then retry."));
    }
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  const dirty = saved !== null && saved.replayAgeSeconds !== draft;
  const save = useCallback(async () => {
    const next = await api.saveEventBusSettings({ replayAgeSeconds: draft });
    setSaved(next);
    setDraft(next.replayAgeSeconds);
  }, [api, draft]);

  useDirtyNavigationSource({
    id: "event-replay-settings",
    dirty,
    summary: "The event replay age has unsaved changes.",
    save,
    discard: () => setDraft(saved?.replayAgeSeconds ?? eventBusReplayAgeDefaultSeconds)
  });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      await save();
      setStatus("Event replay age saved.");
    } catch (cause) {
      setError(actionable("Event replay age was not saved", cause, "Choose a replay age from Off to 30 minutes and try again."));
    } finally {
      setBusy(false);
    }
  }

  const options = replayAgeOptions.includes(draft) ? replayAgeOptions : [...replayAgeOptions, draft].sort((left, right) => left - right);
  return (
    <section aria-labelledby="event-replay-heading" className="settings-page__section">
      <h3 id="event-replay-heading">Event replay</h3>
      <p className="settings-page__hint">
        Events that arrived just before Stream Jams stopped play once it starts again, if they are no older than the replay age.
        Older events are skipped and listed as expired in Diagnostics. Global pause, mute and do not disturb still apply.
      </p>
      {error === null ? null : <ManagementErrorBanner error={error} />}
      {saved === null ? (error === null ? <p role="status">Loading event replay settings...</p> : <Button variant="default" onClick={() => void load()} type="button">Retry</Button>) : (
        <form className="settings-page__form" onSubmit={(event) => void submit(event)}>
          <NativeSelect
            disabled={busy}
            id="settings-event-replay-age"
            label="Replay age"
            onChange={(event) => { setDraft(Number(event.currentTarget.value)); setStatus(null); }}
            value={String(draft)}
          >
            {options.map((seconds) => <option key={seconds} value={seconds}>{replayAgeLabel(seconds)}</option>)}
          </NativeSelect>
          {dirty ? <Button disabled={busy} type="submit">Save replay age</Button> : null}
        </form>
      )}
      {status === null ? null : <p role="status">{status}</p>}
    </section>
  );
}

export function replayAgeLabel(seconds: number): string {
  if (seconds === 0) return "Off: skip missed events";
  const label = seconds < 60
    ? `${seconds} seconds`
    : seconds % 60 === 0 ? `${seconds / 60} ${seconds === 60 ? "minute" : "minutes"}` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
  return seconds === eventBusReplayAgeDefaultSeconds ? `${label} (default)` : label;
}

function actionable(summary: string, cause: unknown, nextStep: string): ActionableManagementError {
  return {
    summary,
    cause: cause instanceof Error ? cause.message : "The operation did not complete.",
    nextStep,
    severity: "error",
    occurredAt: new Date().toISOString(),
    referenceId: null,
    correction: null
  };
}
