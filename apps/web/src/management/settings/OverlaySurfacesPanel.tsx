import { surfaceConfigurationSchema, type ActionableManagementError, type SurfaceConfiguration, type SurfaceSettingsView } from "@stream-jams/core";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { ManagementErrorBanner } from "../foundation/ManagementErrorBanner.js";
import { ManagementErrorToast, ManagementToast, type ManagementToastNotice } from "../foundation/ManagementToast.js";
import { ManagementHttpError } from "../management-http-client.js";
import { useDirtyNavigationSource } from "../navigation/dirty-navigation.js";
import { defaultSurfaceSettingsApi, type SurfaceSettingsApi } from "./overlay-surfaces-api.js";
import "./overlay-surfaces-panel.css";

export interface OverlaySurfacesPanelHandle { save(): Promise<boolean>; discard(): void }
export interface OverlaySurfacesPanelProps {
  readonly api?: SurfaceSettingsApi | undefined;
  readonly onDirtyChange?: ((dirty: boolean) => void) | undefined;
  readonly manageNavigation?: boolean | undefined;
}
type Model = { view: SurfaceSettingsView | null; drafts: ReadonlyMap<string, SurfaceConfiguration> };

export const OverlaySurfacesPanel = forwardRef<OverlaySurfacesPanelHandle, OverlaySurfacesPanelProps>(function OverlaySurfacesPanel(
  { api = defaultSurfaceSettingsApi, onDirtyChange, manageNavigation = true }, ref
) {
  const [model, setModel] = useState<Model>({ view: null, drafts: new Map() });
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [refreshError, setRefreshError] = useState<ActionableManagementError | null>(null);
  const [actionError, setActionError] = useState<ActionableManagementError | null>(null);
  const [notice, setNotice] = useState<ManagementToastNotice | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const mounted = useRef(false);
  const version = useRef(0);
  const loaded = useRef(false);

  useEffect(() => {
    mounted.current = true;
    let cancelled = false; let refreshing = false;
    version.current++;
    const refresh = async (initial = false) => {
      if (refreshing || busyRef.current || (!initial && document.visibilityState === "hidden")) return;
      refreshing = true; const requestVersion = version.current;
      try {
        const view = await api.load();
        if (cancelled || requestVersion !== version.current) return;
        setModel(current => mergeView(current, view)); loaded.current = true; setRefreshError(null);
      } catch (cause) {
        if (!cancelled && requestVersion === version.current) setRefreshError(actionable(loaded.current ? "Overlay status could not be refreshed" : "Overlay settings could not be loaded", cause, "Check the local service and retry. The last known settings are retained."));
      } finally { refreshing = false; if (!cancelled) setLoading(false); }
    };
    void refresh(true);
    const timer = window.setInterval(() => void refresh(), 5000);
    const visible = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", visible);
    return () => { cancelled = true; mounted.current = false; window.clearInterval(timer); document.removeEventListener("visibilitychange", visible); };
  }, [api, reload]);

  const dirtyDrafts = [...model.drafts.values()].filter(draft => !same(draft, model.view?.surfaces.find(surface => surface.id === draft.id)));
  const dirty = dirtyDrafts.length > 0;
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

  const saveValues = useCallback(async (values: readonly SurfaceConfiguration[]): Promise<boolean> => {
    if (busyRef.current) return false;
    if (values.length === 0) return true;
    busyRef.current = true; setBusy(true); setActionError(null); setNotice(null);
    const requestVersion = ++version.current;
    try {
      for (const value of values) {
        const response = await api.save(surfaceConfigurationSchema.parse(value));
        if (!mounted.current || requestVersion !== version.current) return false;
        setModel(current => mergeView(current, response, value.id)); setRefreshError(null);
        const warning = value.kind === "desktop" && (response.desktop.state === "failed" || response.desktop.state === "unavailable");
        setNotice({ tone: warning ? "warning" : "success", message: warning ? "Desktop settings saved; output needs attention." : `${title(value)} settings saved.`, ...(warning && response.desktop.message !== null ? { detail: response.desktop.message } : {}) });
      }
      return true;
    } catch (cause) {
      if (mounted.current) setActionError(actionable("Overlay settings were not saved", cause, "Review the display binding and layer order, then save again."));
      return false;
    } finally { busyRef.current = false; if (mounted.current) setBusy(false); }
  }, [api]);
  const saveAll = useCallback(() => saveValues([...model.drafts.values()].filter(draft => !same(draft, model.view?.surfaces.find(surface => surface.id === draft.id)))), [model, saveValues]);
  const discard = useCallback(() => {
    if (busyRef.current) return;
    setModel(current => ({ ...current, drafts: new Map(current.view?.surfaces.map(surface => [surface.id, surface]) ?? []) })); setActionError(null);
  }, []);
  useImperativeHandle(ref, () => ({ save: saveAll, discard }), [saveAll, discard]);
  useDirtyNavigationSource({ id: "overlay-surfaces", dirty: manageNavigation && dirty, summary: "Overlay surface settings have unsaved changes.", save: saveAll, discard });

  function edit(value: SurfaceConfiguration) { setModel(current => ({ ...current, drafts: new Map(current.drafts).set(value.id, value) })); }
  function move(draft: SurfaceConfiguration, index: number, offset: number) {
    const layers = [...draft.layers]; const row = layers.splice(index, 1)[0]; if (row === undefined) return;
    layers.splice(index + offset, 0, row); edit({ ...draft, layers });
  }
  async function retry() {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setActionError(null); setNotice(null); const requestVersion = ++version.current;
    try {
      const response = await api.retry();
      if (!mounted.current || requestVersion !== version.current) return;
      setModel(current => mergeView(current, response)); setRefreshError(null);
      setNotice({ tone: response.desktop.state === "ready" ? "success" : "warning", message: response.desktop.state === "ready" ? "Desktop output is ready for future alerts." : "Desktop output still needs attention.", detail: response.desktop.message ?? "Retry used the saved desktop settings." });
    } catch (cause) { if (mounted.current) setActionError(actionable("Desktop output could not be retried", cause, "Check the saved display binding and local service, then retry.")); }
    finally { busyRef.current = false; if (mounted.current) setBusy(false); }
  }

  const view = model.view;
  return <section className="overlay-surfaces" id="overlay-surfaces" aria-labelledby="overlay-surfaces-heading">
    <header><h3 id="overlay-surfaces-heading">Overlay surfaces</h3><p>Choose where modules appear and their order. Save each surface to apply changes.</p></header>
    {loading && view === null ? <p role="status">Loading overlay surfaces…</p> : null}
    {refreshError === null ? null : <div><ManagementErrorBanner error={refreshError} /><button type="button" disabled={busy} onClick={() => { setLoading(true); setReload(value => value + 1); }}>Refresh overlay settings</button>{view === null ? null : <p>Showing last known status; it may be stale.</p>}</div>}
    {view !== null && view.surfaces.length === 0 ? <p>No overlay surfaces are configured.</p> : null}
    {view?.surfaces.map(saved => {
      const draft = model.drafts.get(saved.id) ?? saved; const name = title(draft); const changed = !same(draft, saved);
      const unavailable = draft.kind === "desktop" && !view.desktop.available;
      const invalid = !surfaceConfigurationSchema.safeParse(draft).success;
      const savedDesktop = saved.kind === "desktop" ? saved : null;
      const selected = savedDesktop === null ? null : view.desktop.displays.find(display => display.id === savedDesktop.displayId);
      return <form key={draft.id} className="overlay-surfaces__surface" aria-label={name} onSubmit={event => { event.preventDefault(); void saveValues([draft]); }}>
        <div className="overlay-surfaces__heading"><h4>{name}</h4><span>{changed ? "Unsaved changes" : "Saved settings"}</span></div>
        {draft.kind === "desktop" ? <>
          <p>Desktop status: <strong>{stateLabel(view.desktop.state)}</strong>. Saved display: {selected?.label ?? savedDesktop?.displayId ?? "Not selected"}.</p>
          {view.desktop.message === null ? null : <p className="overlay-surfaces__message">{view.desktop.message}</p>}
          <p>Exclusive fullscreen may cover the overlay. Use borderless or windowed mode; graphics injection is not used.</p>
        </> : null}
        <fieldset disabled={busy || unavailable}>
          <legend className="overlay-surfaces__legend">{name} configuration</legend>
          {draft.kind === "desktop" ? <div className="overlay-surfaces__desktop-fields">
            <label className="overlay-surfaces__checkbox"><input type="checkbox" checked={draft.enabled} onChange={event => edit({ ...draft, enabled: event.currentTarget.checked })} />Enable desktop overlay</label>
            <label>Desktop display<select value={draft.displayId ?? ""} onChange={event => edit({ ...draft, displayId: event.currentTarget.value || null })}>
              <option value="">Select a display</option>
              {draft.displayId !== null && !view.desktop.displays.some(display => display.id === draft.displayId) ? <option value={draft.displayId}>{draft.displayId} (missing)</option> : null}
              {view.desktop.displays.map(display => <option key={display.id} value={display.id}>{display.label}</option>)}
            </select></label>
            <label>Desktop opacity<input type="number" min="0" max="1" step="0.05" value={Number.isFinite(draft.opacity) ? draft.opacity : ""} onChange={event => edit({ ...draft, opacity: event.currentTarget.valueAsNumber })} /></label>
          </div> : null}
          {invalid ? <p role="alert">Select a display when enabled and enter an opacity from 0 to 1 before saving.</p> : null}
          <p>Modules are listed topmost first. Visibility changes affect this surface only.</p>
          {draft.layers.length === 0 ? <p>No registered modules on this surface.</p> : <ol className="overlay-surfaces__layers" aria-label={`${name} module order`}>
            {draft.layers.map((layer, index) => <li key={layer.moduleId}>
              <label className="overlay-surfaces__checkbox"><input type="checkbox" aria-label={`Show ${layer.moduleId} on ${name}`} checked={layer.visible} onChange={event => edit({ ...draft, layers: draft.layers.map(row => row.moduleId === layer.moduleId ? { ...row, visible: event.currentTarget.checked } : row) })} />{layer.moduleId}</label>
              <div className="overlay-surfaces__row-actions"><button type="button" aria-label={`Move ${layer.moduleId} up on ${name}`} disabled={index === 0} onClick={() => move(draft, index, -1)}>Up</button><button type="button" aria-label={`Move ${layer.moduleId} down on ${name}`} disabled={index === draft.layers.length - 1} onClick={() => move(draft, index, 1)}>Down</button></div>
            </li>)}
          </ol>}
        </fieldset>
        <div className="overlay-surfaces__actions"><button type="submit" disabled={busy || unavailable || !changed || invalid}>Save {name}</button><button type="button" disabled={busy || !changed} onClick={() => edit(saved)}>Revert {name}</button>
          {draft.kind === "desktop" ? <button type="button" disabled={busy || unavailable || savedDesktop?.enabled !== true} onClick={() => void retry()}>Retry desktop output</button> : null}
        </div>
        {draft.kind === "desktop" && changed ? <p>Retry uses saved desktop settings. Unsaved changes will not be applied.</p> : null}
      </form>;
    })}
    {notice === null ? null : <ManagementToast notice={notice} onDismiss={() => setNotice(null)} />}
    {actionError === null ? null : <ManagementErrorToast error={actionError} onDismiss={() => setActionError(null)} />}
  </section>;
});

function mergeView(current: Model, view: SurfaceSettingsView, savedId?: string): Model {
  const drafts = new Map<string, SurfaceConfiguration>();
  for (const surface of view.surfaces) {
    const draft = current.drafts.get(surface.id); const saved = current.view?.surfaces.find(value => value.id === surface.id);
    drafts.set(surface.id, surface.id !== savedId && draft !== undefined && !same(draft, saved) ? draft : surface);
  }
  return { view, drafts };
}
function same(a: SurfaceConfiguration | undefined, b: SurfaceConfiguration | undefined): boolean { return JSON.stringify(a) === JSON.stringify(b); }
function title(surface: SurfaceConfiguration): string { return surface.kind === "desktop" ? "Desktop overlay" : `Unified browser: ${surface.overlayId}`; }
function stateLabel(state: SurfaceSettingsView["desktop"]["state"]): string { return state === "ready" ? "Ready for future alerts" : state === "disabled" ? "Disabled" : state === "failed" ? "Failed — Retry required" : "Unavailable"; }
function actionable(summary: string, cause: unknown, nextStep: string): ActionableManagementError {
  const error = cause instanceof ManagementHttpError ? cause : null;
  return { summary, cause: cause instanceof Error ? cause.message : "The operation did not complete.", nextStep: error?.nextStep ?? nextStep, severity: "error", occurredAt: new Date().toISOString(), referenceId: error?.referenceId ?? null, correction: null };
}
