import type { AlertEditorDocument, AudioOutputStatus } from "@stream-jams/core";

type Outputs = AlertEditorDocument["outputs"];

export function AlertAudioOutputs({ value, status, loading, error, onChange }: {
  readonly value: Outputs;
  readonly status: AudioOutputStatus | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly onChange: (value: Outputs) => void;
}) {
  const routes = status?.routes ?? [];
  const missing = value.deviceRouteIds.filter((id) => !routes.some(({ route }) => route.id === id));
  function toggleRoute(id: string, checked: boolean) {
    onChange({ ...value, deviceRouteIds: checked ? [...value.deviceRouteIds, id] : value.deviceRouteIds.filter((candidate) => candidate !== id) });
  }
  return <div className="alert-editor-inspector"><fieldset>
    <legend>Audio outputs</legend>
    <p>All visible audio layers and enabled video soundtracks use these outputs. Each source keeps its own volume. Save to apply changes.</p>
    <label className="alert-editor-inspector__check"><input checked={value.browserSource} onChange={(event) => onChange({ ...value, browserSource: event.currentTarget.checked })} type="checkbox" />Browser Source</label>
    {routes.map(({ route, state }) => <label className="alert-editor-inspector__check" key={route.id}>
      <input checked={value.deviceRouteIds.includes(route.id)} onChange={(event) => toggleRoute(route.id, event.currentTarget.checked)} type="checkbox" />
      {route.name} — {state === "ready" ? "Ready" : state === "unbound" ? "Needs setup" : state === "missing-device" ? "Missing device" : "Desktop unavailable"}
    </label>)}
    {missing.map((id) => <label className="alert-editor-inspector__check" key={id}><input checked onChange={() => toggleRoute(id, false)} type="checkbox" />{id} — Route unavailable (selection retained)</label>)}
    {loading && status === null ? <p role="status">Loading audio routes…</p> : null}
    {error === null ? null : <p role="status">Audio route status could not refresh. {error} {status === null ? "Saved selections are retained." : "Showing last-known status."}</p>}
    {status?.capability.available === false ? <p>Device routing is unavailable. {status.capability.nextStep}</p> : null}
    {!value.browserSource && value.deviceRouteIds.length === 0 ? <p>Audio layers and enabled soundtracks are silent: no outputs selected. TTS is unchanged.</p> : null}
    {status?.muted ? <p>Global mute is on. Audio remains muted on all selected outputs.</p> : null}
    <p><a href="/manage/settings#audio-outputs">Configure audio outputs</a>. Preview plays locally only; it never uses these device routes. TTS routing is unchanged.</p>
  </fieldset></div>;
}
