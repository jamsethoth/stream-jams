import type {
  ActionableManagementError,
  AlertBrowserSourceView,
  AlertInventoryRow,
  AlertSetActivationImpact,
  AlertSetDetail,
  AlertSetOverview,
  AlertValidationIssue
} from "@stream-jams/core";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ManagementErrorBanner } from "../foundation/ManagementErrorBanner.js";
import { ModalSurface } from "../foundation/ModalSurface.js";
import { StatusBadge } from "../foundation/StatusBadge.js";
import type { ManagementApi } from "../management-api.js";
import "./alert-sets-page.css";

export type AlertSetsPageApi = Pick<
  ManagementApi,
  | "listAlertSets"
  | "getAlertSet"
  | "createAlertSet"
  | "renameAlertSet"
  | "duplicateAlertSet"
  | "getAlertSetActivationImpact"
  | "activateAlertSet"
  | "markStarterAlertSetReviewComplete"
  | "setManagedAlertEnabled"
  | "deleteAlertSet"
  | "createOverlayOutputKey"
  | "regenerateOverlayOutputKey"
>;

export interface AlertSetsPageProps {
  readonly managementApi: AlertSetsPageApi;
}

type NameAction = "create" | "rename" | "duplicate";

interface NameDialogState {
  readonly action: NameAction;
  readonly set: AlertSetOverview | null;
}

interface RegenerateDialogState {
  readonly source: AlertBrowserSourceView;
  readonly requiresTypedConfirmation: boolean;
}

export function AlertSetsPage({ managementApi }: AlertSetsPageProps) {
  const [sets, setSets] = useState<readonly AlertSetOverview[]>([]);
  const [selectedSetId, setSelectedSetId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AlertSetDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ActionableManagementError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [nameDialog, setNameDialog] = useState<NameDialogState | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [activationImpact, setActivationImpact] = useState<AlertSetActivationImpact | null>(null);
  const [activationSet, setActivationSet] = useState<AlertSetOverview | null>(null);
  const [previewAlert, setPreviewAlert] = useState<AlertInventoryRow | null>(null);
  const [regenerateDialog, setRegenerateDialog] = useState<RegenerateDialogState | null>(null);
  const [regenerateConfirmation, setRegenerateConfirmation] = useState("");
  const [deleteSet, setDeleteSet] = useState<AlertSetOverview | null>(null);
  const [revealedSourceIds, setRevealedSourceIds] = useState<ReadonlySet<string>>(() => new Set());
  const [query, setQuery] = useState("");
  const [eventFilter, setEventFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [profileFilter, setProfileFilter] = useState("all");

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const loadedSets = await managementApi.listAlertSets();
        if (!active) return;
        setSets(loadedSets);
        const selected = loadedSets.find((candidate) => candidate.active) ?? loadedSets[0] ?? null;
        setSelectedSetId(selected?.id ?? null);
        setDetail(selected === null ? null : await managementApi.getAlertSet(selected.id));
      } catch (cause) {
        if (active) setError(toActionableError("Alert sets could not be loaded", cause, "Refresh the page and try again."));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [managementApi]);

  const filteredInventory = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return (detail?.inventory ?? []).filter((alert) =>
      (normalizedQuery === "" || `${alert.name} ${alert.eventType} ${alert.providerKind}`.toLocaleLowerCase().includes(normalizedQuery)) &&
      (eventFilter === "all" || alert.eventType === eventFilter) &&
      (statusFilter === "all" || (statusFilter === "enabled" ? alert.enabled : !alert.enabled)) &&
      (profileFilter === "all" || alert.targetProfileIds.includes(profileFilter as "landscape" | "vertical"))
    );
  }, [detail, eventFilter, profileFilter, query, statusFilter]);

  async function selectSet(setId: string) {
    if (setId === selectedSetId) return;
    setSelectedSetId(setId);
    setLoading(true);
    setError(null);
    try {
      setDetail(await managementApi.getAlertSet(setId));
    } catch (cause) {
      setError(toActionableError("The alert set could not be opened", cause, "Refresh the alert-set list and try again."));
    } finally {
      setLoading(false);
    }
  }

  async function refresh(preferredSetId = selectedSetId) {
    const refreshedSets = await managementApi.listAlertSets();
    setSets(refreshedSets);
    const selected = refreshedSets.find((candidate) => candidate.id === preferredSetId)
      ?? refreshedSets.find((candidate) => candidate.active)
      ?? refreshedSets[0]
      ?? null;
    setSelectedSetId(selected?.id ?? null);
    setDetail(selected === null ? null : await managementApi.getAlertSet(selected.id));
  }

  function openNameDialog(action: NameAction, set: AlertSetOverview | null) {
    setNameDraft(action === "rename" ? set?.name ?? "" : action === "duplicate" ? `${set?.name ?? "Alert set"} copy` : "");
    setNameDialog({ action, set });
  }

  async function submitNameDialog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = nameDraft.trim();
    if (name === "" || nameDialog === null) return;
    setBusy(true);
    setError(null);
    try {
      const result = nameDialog.action === "create"
        ? await managementApi.createAlertSet({ name })
        : nameDialog.action === "rename"
          ? await managementApi.renameAlertSet(nameDialog.set?.id ?? "", { name })
          : await managementApi.duplicateAlertSet(nameDialog.set?.id ?? "", { name });
      await refresh(result.id);
      setNotice(nameDialog.action === "create" ? "Alert set created." : nameDialog.action === "rename" ? "Alert set renamed." : "Alert set duplicated.");
      setNameDialog(null);
    } catch (cause) {
      setError(toActionableError("The alert set was not saved", cause, "Check the name and try again."));
    } finally {
      setBusy(false);
    }
  }

  async function prepareActivation(set: AlertSetOverview) {
    setBusy(true);
    setError(null);
    try {
      setActivationSet(set);
      setActivationImpact(await managementApi.getAlertSetActivationImpact(set.id));
    } catch (cause) {
      setActivationSet(null);
      setError(toActionableError("Activation impact could not be loaded", cause, "Refresh the alert set and try again."));
    } finally {
      setBusy(false);
    }
  }

  async function confirmActivation() {
    if (activationSet === null || activationImpact === null || activationImpact.blockers.length > 0) return;
    setBusy(true);
    setError(null);
    try {
      await managementApi.activateAlertSet(activationSet.id, activationImpact.warnings.length > 0);
      await refresh(activationSet.id);
      setNotice(`${activationSet.name} is now active.`);
      setActivationSet(null);
      setActivationImpact(null);
    } catch (cause) {
      setError(toActionableError("The alert set was not activated", cause, "Resolve blockers or review warnings, then try again."));
    } finally {
      setBusy(false);
    }
  }

  async function markStarterReviewComplete() {
    if (detail === null) return;
    setBusy(true);
    setError(null);
    try {
      const overview = await managementApi.markStarterAlertSetReviewComplete(detail.overview.id);
      setDetail({ ...detail, overview });
      replaceOverview(overview);
      setNotice("Starter review marked complete. Alerts remain disabled until you enable them.");
    } catch (cause) {
      setError(toActionableError("Starter review was not updated", cause, "Try the action again."));
    } finally {
      setBusy(false);
    }
  }

  async function toggleAlert(alert: AlertInventoryRow) {
    setBusy(true);
    setError(null);
    try {
      const updated = await managementApi.setManagedAlertEnabled(alert.id, !alert.enabled);
      setDetail(updated);
      replaceOverview(updated.overview);
      setNotice(`${alert.name} ${alert.enabled ? "disabled" : "enabled"}.`);
    } catch (cause) {
      setError(toActionableError("The alert was not updated", cause, "Review its validation state and try again."));
    } finally {
      setBusy(false);
    }
  }

  async function createBrowserSource(source: AlertBrowserSourceView) {
    setBusy(true);
    setError(null);
    try {
      await managementApi.createOverlayOutputKey(outputRequest(source));
      await refresh(detail?.overview.id ?? null);
      setNotice(`${formatProfile(source.targetProfileId)} ${source.purpose} URL created.`);
    } catch (cause) {
      setError(toActionableError("The browser-source URL was not created", cause, "Check Diagnostics, then try again."));
    } finally {
      setBusy(false);
    }
  }

  async function regenerateBrowserSource() {
    if (regenerateDialog === null) return;
    setBusy(true);
    setError(null);
    try {
      await managementApi.regenerateOverlayOutputKey(outputRequest(regenerateDialog.source));
      await refresh(detail?.overview.id ?? null);
      setNotice(`${formatProfile(regenerateDialog.source.targetProfileId)} ${regenerateDialog.source.purpose} URL regenerated. Update every browser source that used the old URL.`);
      setRegenerateDialog(null);
      setRegenerateConfirmation("");
    } catch (cause) {
      setError(toActionableError("The browser-source URL was not regenerated", cause, "Keep the current URL and retry after checking Diagnostics."));
    } finally {
      setBusy(false);
    }
  }

  async function copyBrowserSource(source: AlertBrowserSourceView) {
    if (source.url === null) return;
    try {
      if (navigator.clipboard === undefined) throw new Error("Clipboard access is unavailable in this browser.");
      await navigator.clipboard.writeText(source.url);
      setNotice(`${formatProfile(source.targetProfileId)} ${source.purpose} URL copied.`);
    } catch (cause) {
      setError(toActionableError("The browser-source URL was not copied", cause, "Reveal the URL and copy it manually."));
    }
  }

  async function confirmDelete() {
    if (deleteSet === null) return;
    setBusy(true);
    setError(null);
    try {
      await managementApi.deleteAlertSet(deleteSet.id);
      await refresh(null);
      setNotice(`${deleteSet.name} deleted.`);
      setDeleteSet(null);
    } catch (cause) {
      setError(toActionableError("The alert set was not deleted", cause, "Activate another set first, then retry."));
    } finally {
      setBusy(false);
    }
  }

  function replaceOverview(overview: AlertSetOverview) {
    setSets((current) => current.map((set) => set.id === overview.id ? overview : set));
  }

  if (loading && detail === null) {
    return <p className="management-empty" role="status">Loading alert sets...</p>;
  }

  return (
    <div className="alert-sets-page">
      <div className="alert-sets-page__toolbar">
        <div>
          <h2>Alert sets</h2>
          <p>Prepare collections of alerts, validate their profiles, and choose the one used for live events.</p>
        </div>
        <button onClick={() => openNameDialog("create", null)} type="button">Create set</button>
      </div>

      {error === null ? null : <ManagementErrorBanner error={error} />}
      {notice === null ? null : <p className="alert-sets-page__notice" role="status">{notice}</p>}

      {sets.length === 0 ? (
        <section className="alert-sets-page__empty">
          <h3>No alert sets</h3>
          <p>Create an alert set to configure stream event responses.</p>
          <button onClick={() => openNameDialog("create", null)} type="button">Create alert set</button>
        </section>
      ) : (
        <div className="alert-sets-page__workspace">
          <section aria-labelledby="available-alert-sets-heading" className="alert-sets-page__set-list">
            <div className="alert-sets-page__section-heading">
              <div>
                <h3 id="available-alert-sets-heading">Available sets</h3>
                <p>{sets.length} configured</p>
              </div>
            </div>
            <div className="alert-sets-page__table-wrap">
              <table className="alert-sets-page__table alert-sets-page__table--set-list">
                <thead><tr><th scope="col">Set</th><th scope="col">Alerts</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>
                  {sets.map((set) => (
                    <tr className={set.id === selectedSetId ? "alert-sets-page__selected-row" : undefined} key={set.id}>
                      <th scope="row"><span>{set.name}</span>{set.starter ? <small>Starter</small> : null}</th>
                      <td>{set.enabledAlertCount}</td>
                      <td><StatusBadge label={set.active ? "Active" : "Inactive"} tone={set.active ? "positive" : "neutral"} /></td>
                      <td className="alert-sets-page__row-actions">
                        <button aria-label={`View ${set.name}`} className="button button--secondary" onClick={() => void selectSet(set.id)} type="button">View</button>
                        {set.active ? null : <button aria-label={`Make ${set.name} active`} disabled={busy} onClick={() => void prepareActivation(set)} type="button">Activate</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {detail === null ? null : (
            <div className="alert-sets-page__detail">
              <SetOverview
                busy={busy}
                detail={detail}
                onDelete={() => setDeleteSet(detail.overview)}
                onDuplicate={() => openNameDialog("duplicate", detail.overview)}
                onMarkReviewed={() => void markStarterReviewComplete()}
                onRename={() => openNameDialog("rename", detail.overview)}
              />
              <ValidationSummary issues={detail.overview.validationIssues} />
              <AlertInventory
                alerts={filteredInventory}
                busy={busy}
                eventFilter={eventFilter}
                eventTypes={[...new Set(detail.inventory.map((alert) => alert.eventType))]}
                onEventFilter={setEventFilter}
                onPreview={setPreviewAlert}
                onProfileFilter={setProfileFilter}
                onQuery={setQuery}
                onStatusFilter={setStatusFilter}
                onToggle={(alert) => void toggleAlert(alert)}
                profileFilter={profileFilter}
                query={query}
                statusFilter={statusFilter}
                totalCount={detail.inventory.length}
              />
              <BrowserSources
                busy={busy}
                onCopy={(source) => void copyBrowserSource(source)}
                onCreate={(source) => void createBrowserSource(source)}
                onRegenerate={(source) => {
                  setRegenerateConfirmation("");
                  setRegenerateDialog({
                    source,
                    requiresTypedConfirmation: source.connectionState !== "never-connected" || source.lastConnectedAt !== null
                  });
                }}
                onReveal={(source) => setRevealedSourceIds((current) => new Set([...current, source.id]))}
                revealedSourceIds={revealedSourceIds}
                sources={detail.browserSources}
              />
            </div>
          )}
        </div>
      )}

      <NameDialog busy={busy} draft={nameDraft} onCancel={() => setNameDialog(null)} onChange={setNameDraft} onSubmit={submitNameDialog} state={nameDialog} />
      <ActivationDialog busy={busy} impact={activationImpact} onCancel={() => { setActivationSet(null); setActivationImpact(null); }} onConfirm={() => void confirmActivation()} set={activationSet} />
      <PreviewDialog alert={previewAlert} onCancel={() => setPreviewAlert(null)} />
      <RegenerateDialog busy={busy} confirmation={regenerateConfirmation} onCancel={() => setRegenerateDialog(null)} onChange={setRegenerateConfirmation} onConfirm={() => void regenerateBrowserSource()} state={regenerateDialog} />
      <DeleteDialog busy={busy} onCancel={() => setDeleteSet(null)} onConfirm={() => void confirmDelete()} set={deleteSet} />
    </div>
  );
}

function SetOverview({
  busy,
  detail,
  onDelete,
  onDuplicate,
  onMarkReviewed,
  onRename
}: {
  readonly busy: boolean;
  readonly detail: AlertSetDetail;
  readonly onDelete: () => void;
  readonly onDuplicate: () => void;
  readonly onMarkReviewed: () => void;
  readonly onRename: () => void;
}) {
  const set = detail.overview;
  const needsReviewCount = detail.inventory.filter((alert) => alert.reviewState === "needs-review").length;
  return (
    <section className={`alert-sets-page__set-overview alert-sets-page__set-overview--${set.active ? "active" : "inactive"}`}>
      <div>
        <span className="alert-sets-page__eyebrow">{set.active ? "Active set" : "Selected set"}</span>
        <h3>{set.name}</h3>
        <p>{set.enabledAlertCount} enabled of {detail.inventory.length} alerts</p>
      </div>
      <div className="alert-sets-page__overview-status">
        <StatusBadge label={set.active ? "Live events use this set" : "Saved, not active"} tone={set.active ? "positive" : "neutral"} />
        {needsReviewCount > 0 ? <span>{needsReviewCount} alerts need review</span> : <span>Review complete</span>}
      </div>
      <div className="alert-sets-page__actions">
        {set.starter && set.starterReviewState === "pending" ? <button disabled={busy} onClick={onMarkReviewed} type="button">Mark starter review done</button> : null}
        <button className="button button--secondary" disabled={busy} onClick={onRename} type="button">Rename</button>
        <button className="button button--secondary" disabled={busy} onClick={onDuplicate} type="button">Duplicate</button>
        <button className="button button--danger" disabled={busy || set.active} onClick={onDelete} title={set.active ? "Activate another set before deleting this one." : undefined} type="button">Delete</button>
      </div>
    </section>
  );
}

function ValidationSummary({ issues }: { readonly issues: readonly AlertValidationIssue[] }) {
  const blockers = issues.filter((issue) => issue.severity === "blocker");
  const warnings = issues.filter((issue) => issue.severity === "warning");
  return (
    <section aria-labelledby="alert-validation-heading" className="alert-sets-page__section">
      <div className="alert-sets-page__section-heading">
        <div><h3 id="alert-validation-heading">Validation</h3><p>Only enabled profiles affect activation.</p></div>
        <div className="alert-sets-page__validation-counts">
          <StatusBadge label={`${blockers.length} blockers`} tone={blockers.length > 0 ? "negative" : "positive"} />
          <StatusBadge label={`${warnings.length} warnings`} tone={warnings.length > 0 ? "warning" : "neutral"} />
        </div>
      </div>
      {issues.length === 0 ? <p className="alert-sets-page__success">This set is ready to activate.</p> : (
        <ul className="alert-sets-page__issue-list">
          {issues.map((issue) => <li className={`alert-sets-page__issue alert-sets-page__issue--${issue.severity}`} key={issue.id}><strong>{issue.message}</strong><span>{issue.nextStep}</span>{issue.referenceId === null ? null : <code>{issue.referenceId}</code>}</li>)}
        </ul>
      )}
    </section>
  );
}

function AlertInventory({
  alerts,
  busy,
  eventFilter,
  eventTypes,
  onEventFilter,
  onPreview,
  onProfileFilter,
  onQuery,
  onStatusFilter,
  onToggle,
  profileFilter,
  query,
  statusFilter,
  totalCount
}: {
  readonly alerts: readonly AlertInventoryRow[];
  readonly busy: boolean;
  readonly eventFilter: string;
  readonly eventTypes: readonly string[];
  readonly onEventFilter: (value: string) => void;
  readonly onPreview: (alert: AlertInventoryRow) => void;
  readonly onProfileFilter: (value: string) => void;
  readonly onQuery: (value: string) => void;
  readonly onStatusFilter: (value: string) => void;
  readonly onToggle: (alert: AlertInventoryRow) => void;
  readonly profileFilter: string;
  readonly query: string;
  readonly statusFilter: string;
  readonly totalCount: number;
}) {
  return (
    <section aria-labelledby="alert-inventory-heading" className="alert-sets-page__section">
      <div className="alert-sets-page__section-heading"><div><h3 id="alert-inventory-heading">Alerts</h3><p>{alerts.length} of {totalCount} shown</p></div></div>
      <div className="alert-sets-page__filters">
        <label><span>Search</span><input onChange={(event) => onQuery(event.currentTarget.value)} placeholder="Name, event, or provider" type="search" value={query} /></label>
        <label><span>Event</span><select onChange={(event) => onEventFilter(event.currentTarget.value)} value={eventFilter}><option value="all">All events</option>{eventTypes.map((eventType) => <option key={eventType} value={eventType}>{formatEventType(eventType)}</option>)}</select></label>
        <label><span>Status</span><select onChange={(event) => onStatusFilter(event.currentTarget.value)} value={statusFilter}><option value="all">All statuses</option><option value="enabled">Enabled</option><option value="disabled">Disabled</option></select></label>
        <label><span>Profile</span><select onChange={(event) => onProfileFilter(event.currentTarget.value)} value={profileFilter}><option value="all">All profiles</option><option value="landscape">Landscape</option><option value="vertical">Vertical</option></select></label>
      </div>
      <div className="alert-sets-page__table-wrap">
        <table className="alert-sets-page__table alert-sets-page__table--inventory">
          <thead><tr><th scope="col">Alert</th><th scope="col">Event</th><th scope="col">Provider</th><th scope="col">Profiles</th><th scope="col">Review</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {alerts.map((alert) => (
              <tr key={alert.id}>
                <th scope="row"><span>{alert.name}</span><small>{alert.kind === "default" ? "Default" : "Variation"}</small></th>
                <td>{formatEventType(alert.eventType)}</td><td>{formatProvider(alert.providerKind)}</td><td>{alert.targetProfileIds.map(formatProfile).join(", ") || "None"}</td>
                <td><StatusBadge label={alert.reviewState === "needs-review" ? "Needs review" : "Ready"} tone={alert.reviewState === "needs-review" ? "warning" : "positive"} /></td>
                <td className="alert-sets-page__row-actions"><button className="button button--secondary" onClick={() => onPreview(alert)} type="button">Preview</button><button aria-label={`${alert.enabled ? "Disable" : "Enable"} ${alert.name}`} disabled={busy} onClick={() => onToggle(alert)} type="button">{alert.enabled ? "Disable" : "Enable"}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {alerts.length === 0 ? <p className="alert-sets-page__empty-row">No alerts match these filters.</p> : null}
    </section>
  );
}

function BrowserSources({
  busy,
  onCopy,
  onCreate,
  onRegenerate,
  onReveal,
  revealedSourceIds,
  sources
}: {
  readonly busy: boolean;
  readonly onCopy: (source: AlertBrowserSourceView) => void;
  readonly onCreate: (source: AlertBrowserSourceView) => void;
  readonly onRegenerate: (source: AlertBrowserSourceView) => void;
  readonly onReveal: (source: AlertBrowserSourceView) => void;
  readonly revealedSourceIds: ReadonlySet<string>;
  readonly sources: readonly AlertBrowserSourceView[];
}) {
  return (
    <section aria-labelledby="browser-sources-heading" className="alert-sets-page__section" id="browser-sources">
      <div className="alert-sets-page__section-heading"><div><h3 id="browser-sources-heading">Browser sources</h3><p>Use separate live and test URLs for each target profile.</p></div></div>
      <div className="alert-sets-page__source-list">
        {sources.map((source) => {
          const label = `${formatProfile(source.targetProfileId)} ${source.purpose}`;
          const revealed = revealedSourceIds.has(source.id);
          return (
            <article className="alert-sets-page__source" key={source.id}>
              <div className="alert-sets-page__source-heading"><div><strong>{label}</strong><span>{source.connectionState === "connected" ? "Connected now" : source.lastConnectedAt === null ? "Never connected" : `Last connected ${new Date(source.lastConnectedAt).toLocaleString()}`}</span></div><StatusBadge label={formatConnectionState(source.connectionState)} tone={source.connectionState === "connected" ? "positive" : source.connectionState === "never-connected" ? "neutral" : "warning"} /></div>
              {source.url === null ? <p className="alert-sets-page__source-missing">Create a route-key URL before adding this source to OBS.</p> : <input aria-label={`${label} browser source`} readOnly value={revealed ? source.url : maskRouteKey(source.url)} />}
              <div className="alert-sets-page__row-actions">
                {source.copyableUrlStatus === "create-required" ? <button disabled={busy} onClick={() => onCreate(source)} type="button">Create URL</button> : null}
                {source.url === null ? null : <><button aria-label={`Reveal ${label} URL`} className="button button--secondary" disabled={revealed} onClick={() => onReveal(source)} type="button">Reveal</button><button aria-label={`Copy ${label} URL`} className="button button--secondary" onClick={() => onCopy(source)} type="button">Copy</button></>}
                {source.copyableUrlStatus !== "create-required" ? <button aria-label={`Regenerate ${label} URL`} className="button button--danger" disabled={busy} onClick={() => onRegenerate(source)} type="button">Regenerate</button> : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function NameDialog({ busy, draft, onCancel, onChange, onSubmit, state }: { readonly busy: boolean; readonly draft: string; readonly onCancel: () => void; readonly onChange: (value: string) => void; readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void; readonly state: NameDialogState | null }) {
  const title = state?.action === "create" ? "Create alert set" : state?.action === "rename" ? "Rename alert set" : "Duplicate alert set";
  return <ModalSurface labelledBy="alert-set-name-dialog-title" onCancel={onCancel} open={state !== null}><form className="alert-sets-page__modal" onSubmit={onSubmit}><div><h2 id="alert-set-name-dialog-title">{title}</h2><p>Saving does not change which alert set is active.</p></div><label><span>Alert set name</span><input autoComplete="off" autoFocus maxLength={120} onChange={(event) => onChange(event.currentTarget.value)} required value={draft} /></label><div className="management-modal__actions"><button className="button button--secondary" disabled={busy} onClick={onCancel} type="button">Cancel</button><button disabled={busy || draft.trim() === ""} type="submit">{state?.action === "duplicate" ? "Duplicate" : "Save"}</button></div></form></ModalSurface>;
}

function ActivationDialog({ busy, impact, onCancel, onConfirm, set }: { readonly busy: boolean; readonly impact: AlertSetActivationImpact | null; readonly onCancel: () => void; readonly onConfirm: () => void; readonly set: AlertSetOverview | null }) {
  return <ModalSurface labelledBy="alert-set-activation-title" onCancel={onCancel} open={set !== null && impact !== null}><div className="alert-sets-page__modal"><div><h2 id="alert-set-activation-title">Activate {set?.name}?</h2><p>{impact?.replacingActiveSetName === null ? "This set will receive live events." : `${impact?.replacingActiveSetName} will become inactive. Saved configuration will not be deleted.`}</p></div><ImpactFacts impact={impact} />{(impact?.blockers.length ?? 0) > 0 ? <IssueGroup heading="Resolve before activation" issues={impact?.blockers ?? []} /> : null}{(impact?.warnings.length ?? 0) > 0 ? <IssueGroup heading="Review before activation" issues={impact?.warnings ?? []} /> : null}<div className="management-modal__actions"><button className="button button--secondary" disabled={busy} onClick={onCancel} type="button">Cancel</button><button disabled={busy || (impact?.blockers.length ?? 0) > 0} onClick={onConfirm} type="button">{(impact?.warnings.length ?? 0) > 0 ? "Activate with warnings" : "Activate"}</button></div></div></ModalSurface>;
}

function ImpactFacts({ impact }: { readonly impact: AlertSetActivationImpact | null }) {
  if (impact === null) return null;
  return <dl className="alert-sets-page__facts"><div><dt>Enabled alerts</dt><dd>{impact.enabledAlertCount}</dd></div><div><dt>Profiles</dt><dd>{impact.affectedTargetProfileIds.map(formatProfile).join(", ") || "None"}</dd></div><div><dt>Event types</dt><dd>{impact.affectedEventTypes.map(formatEventType).join(", ") || "None"}</dd></div></dl>;
}

function IssueGroup({ heading, issues }: { readonly heading: string; readonly issues: readonly AlertValidationIssue[] }) {
  return <section className="alert-sets-page__modal-issues"><h3>{heading}</h3><ul>{issues.map((issue) => <li key={issue.id}><strong>{issue.message}</strong><span>{issue.nextStep}</span></li>)}</ul></section>;
}

function PreviewDialog({ alert, onCancel }: { readonly alert: AlertInventoryRow | null; readonly onCancel: () => void }) {
  return <ModalSurface labelledBy="alert-preview-title" onCancel={onCancel} open={alert !== null}><div className="alert-sets-page__modal"><div><span className="alert-sets-page__eyebrow">Sample preview</span><h2 id="alert-preview-title">{alert?.name}</h2></div><div className="alert-sets-page__preview"><span>{alert?.previewText}</span></div><p>This uses built-in sample data and does not enter the live event flow.</p><div className="management-modal__actions"><button onClick={onCancel} type="button">Close</button></div></div></ModalSurface>;
}

function RegenerateDialog({ busy, confirmation, onCancel, onChange, onConfirm, state }: { readonly busy: boolean; readonly confirmation: string; readonly onCancel: () => void; readonly onChange: (value: string) => void; readonly onConfirm: () => void; readonly state: RegenerateDialogState | null }) {
  const label = state === null ? "Browser source" : `${formatProfile(state.source.targetProfileId)} ${state.source.purpose}`;
  const confirmed = !state?.requiresTypedConfirmation || confirmation === "REGENERATE";
  return <ModalSurface labelledBy="regenerate-browser-source-title" onCancel={onCancel} open={state !== null}><div className="alert-sets-page__modal"><div><h2 id="regenerate-browser-source-title">Regenerate {label} URL?</h2><p>The current URL will stop working immediately. Update every browser source that uses it.</p></div>{state?.requiresTypedConfirmation ? <label><span>Type REGENERATE to continue</span><input autoComplete="off" onChange={(event) => onChange(event.currentTarget.value)} value={confirmation} /></label> : null}<div className="management-modal__actions"><button className="button button--secondary" disabled={busy} onClick={onCancel} type="button">Cancel</button><button className="button button--danger" disabled={busy || !confirmed} onClick={onConfirm} type="button">Regenerate URL</button></div></div></ModalSurface>;
}

function DeleteDialog({ busy, onCancel, onConfirm, set }: { readonly busy: boolean; readonly onCancel: () => void; readonly onConfirm: () => void; readonly set: AlertSetOverview | null }) {
  return <ModalSurface labelledBy="delete-alert-set-title" onCancel={onCancel} open={set !== null}><div className="alert-sets-page__modal"><div><h2 id="delete-alert-set-title">Delete {set?.name}?</h2><p>This permanently deletes the set and its alerts. Assets used elsewhere remain available.</p></div><div className="management-modal__actions"><button className="button button--secondary" disabled={busy} onClick={onCancel} type="button">Cancel</button><button className="button button--danger" disabled={busy} onClick={onConfirm} type="button">Delete alert set</button></div></div></ModalSurface>;
}

function outputRequest(source: AlertBrowserSourceView) {
  return { overlayId: "default", scope: "module" as const, moduleId: "alerts", purpose: source.purpose, targetProfileId: source.targetProfileId };
}

function maskRouteKey(url: string): string {
  return url.replace(/(\/(?:live|test)\/)[^?]+/u, "$1********");
}

function formatEventType(value: string): string {
  return value.split("_").map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`).join(" ");
}

function formatProvider(value: string): string {
  return value === "streamerbot" ? "Streamer.bot" : value === "speakerbot" ? "Speaker.bot" : value === "browser-speech" ? "Browser Speech" : "Twitch";
}

function formatProfile(value: "landscape" | "vertical"): string {
  return value === "landscape" ? "Landscape" : "Vertical";
}

function formatConnectionState(value: AlertBrowserSourceView["connectionState"]): string {
  return value === "never-connected" ? "Never connected" : value === "connected" ? "Connected" : "Disconnected";
}

function toActionableError(summary: string, cause: unknown, nextStep: string): ActionableManagementError {
  const referenceId = `ui_${globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)}`;
  console.error(`[${referenceId}] ${summary}`, cause);
  return {
    summary,
    cause: cause instanceof Error ? cause.message : "An unexpected error occurred.",
    nextStep,
    severity: "error",
    occurredAt: new Date().toISOString(),
    referenceId,
    correction: { label: "Open Diagnostics", route: `/diagnostics?reference=${encodeURIComponent(referenceId)}` }
  };
}
