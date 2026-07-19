import {
  alertStarterTemplates,
  type ActionableManagementError,
  type AlertBrowserSourceView,
  type AlertCreateInput,
  type AlertInventoryRow,
  type AlertSetActivationImpact,
  type AlertSetDetail,
  type AlertSetOverview,
  type AlertValidationIssue,
  type TargetProfileId
} from "@stream-jams/core";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ManagementErrorBanner } from "../foundation/ManagementErrorBanner.js";
import { ModalSurface } from "../foundation/ModalSurface.js";
import { StatusBadge } from "../foundation/StatusBadge.js";
import { formatCount as formatLocalizedCount, formatDateTime } from "../foundation/formatters.js";
import type { ManagementApi } from "../management-api.js";
import "./alert-sets-page.css";

export type AlertSetsPageApi = Pick<
  ManagementApi,
  | "listAlertSets"
  | "getAlertSet"
  | "createAlertSet"
  | "createAlert"
  | "createAlertVariation"
  | "duplicateManagedAlert"
  | "resetManagedAlert"
  | "deleteManagedAlert"
  | "renameAlertSet"
  | "duplicateAlertSet"
  | "getAlertSetActivationImpact"
  | "activateAlertSet"
  | "markStarterAlertSetReviewComplete"
  | "setManagedAlertEnabled"
  | "deleteAlertSet"
  | "getAlertEditorDocument"
  | "sendAlertEditorTest"
  | "createOverlayOutputKey"
  | "regenerateOverlayOutputKey"
>;

export interface AlertSetsPageProps {
  readonly initialSetId?: string | undefined;
  readonly managementApi: AlertSetsPageApi;
  readonly onEditAlert: (alert: AlertInventoryRow) => void;
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

interface AlertMutationDialogState {
  readonly action: "reset" | "delete";
  readonly alert: AlertInventoryRow;
}

const targetProfileDimensions: Record<TargetProfileId, Readonly<{ width: number; height: number }>> = {
  landscape: { width: 1920, height: 1080 },
  vertical: { width: 1080, height: 1920 }
};

export function AlertSetsPage({ initialSetId, managementApi, onEditAlert }: AlertSetsPageProps) {
  const [sets, setSets] = useState<readonly AlertSetOverview[]>([]);
  const [selectedSetId, setSelectedSetId] = useState<string | null>(null);
  const [expandedSetId, setExpandedSetId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AlertSetDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialLoadFailed, setInitialLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ActionableManagementError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [nameDialog, setNameDialog] = useState<NameDialogState | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [createAlertOpen, setCreateAlertOpen] = useState(false);
  const [createAlertEventType, setCreateAlertEventType] = useState<AlertCreateInput["eventType"]>(alertStarterTemplates[0].eventType);
  const [createAlertName, setCreateAlertName] = useState<string>(alertStarterTemplates[0].defaultName);
  const [createAlertError, setCreateAlertError] = useState<ActionableManagementError | null>(null);
  const [variationParent, setVariationParent] = useState<AlertInventoryRow | null>(null);
  const [variationName, setVariationName] = useState("");
  const [variationError, setVariationError] = useState<ActionableManagementError | null>(null);
  const [alertMutation, setAlertMutation] = useState<AlertMutationDialogState | null>(null);
  const [activationImpact, setActivationImpact] = useState<AlertSetActivationImpact | null>(null);
  const [activationSet, setActivationSet] = useState<AlertSetOverview | null>(null);
  const [previewAlert, setPreviewAlert] = useState<AlertInventoryRow | null>(null);
  const [testMenuAlertId, setTestMenuAlertId] = useState<string | null>(null);
  const [testingAlertId, setTestingAlertId] = useState<string | null>(null);
  const [regenerateDialog, setRegenerateDialog] = useState<RegenerateDialogState | null>(null);
  const [regenerateConfirmation, setRegenerateConfirmation] = useState("");
  const [deleteSet, setDeleteSet] = useState<AlertSetOverview | null>(null);
  const [revealedSourceIds, setRevealedSourceIds] = useState<ReadonlySet<string>>(() => new Set());
  const [query, setQuery] = useState("");
  const [eventFilter, setEventFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [profileFilter, setProfileFilter] = useState("all");
  const [browserSourceStatusUpdatedAt, setBrowserSourceStatusUpdatedAt] = useState<string | null>(null);
  const [browserSourceRefreshError, setBrowserSourceRefreshError] = useState<ActionableManagementError | null>(null);
  const [browserSourcesExpanded, setBrowserSourcesExpanded] = useState(false);
  const browserSourceRefreshFailed = useRef(false);
  const effectLoadGeneration = useRef(0);

  useEffect(() => {
    const generation = ++effectLoadGeneration.current;
    void loadAlertSets(initialSetId, true, generation);
    return () => { effectLoadGeneration.current += 1; };
  }, [initialSetId, managementApi]);

  useEffect(() => {
    if (selectedSetId === null) return;
    let cancelled = false;
    let refreshing = false;
    browserSourceRefreshFailed.current = false;

    const refreshBrowserSourceStatus = async () => {
      if (refreshing) return;
      refreshing = true;
      try {
        const refreshed = await managementApi.getAlertSet(selectedSetId);
        if (cancelled) return;
        setDetail((current) => current?.overview.id === selectedSetId
          ? { ...current, browserSources: refreshed.browserSources }
          : current);
        setBrowserSourceStatusUpdatedAt(new Date().toISOString());
        browserSourceRefreshFailed.current = false;
        setBrowserSourceRefreshError(null);
      } catch (cause) {
        if (!cancelled && !browserSourceRefreshFailed.current) {
          browserSourceRefreshFailed.current = true;
          setBrowserSourceRefreshError(toActionableError(
            "Unable to refresh browser-source status",
            cause,
            "Check the local service and Diagnostics. Live status will retry automatically."
          ));
        }
      } finally {
        refreshing = false;
      }
    };

    const interval = window.setInterval(() => void refreshBrowserSourceStatus(), 5_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [managementApi, selectedSetId]);

  useEffect(() => {
    if (detail === null || window.location.hash !== "#browser-sources") return;
    setBrowserSourcesExpanded(true);
    const browserSources = document.getElementById("browser-sources");
    if (browserSources === null || typeof browserSources.scrollIntoView !== "function") return;
    browserSources.scrollIntoView({ block: "start" });
  }, [detail]);

  const filteredInventory = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return (detail?.inventory ?? []).filter((alert) =>
      (normalizedQuery === "" || `${alert.name} ${alert.eventType} ${alert.providerKind}`.toLocaleLowerCase().includes(normalizedQuery)) &&
      (eventFilter === "all" || alert.eventType === eventFilter) &&
      (statusFilter === "all" || (statusFilter === "enabled" ? alert.enabled : !alert.enabled)) &&
      (profileFilter === "all" || alert.targetProfileIds.includes(profileFilter as "landscape" | "vertical"))
    );
  }, [detail, eventFilter, profileFilter, query, statusFilter]);

  async function toggleSet(setId: string) {
    if (setId === expandedSetId) {
      setExpandedSetId(null);
      setTestMenuAlertId(null);
      return;
    }
    setExpandedSetId(setId);
    setTestMenuAlertId(null);
    if (setId === selectedSetId && detail?.overview.id === setId) return;
    setSelectedSetId(setId);
    setLoading(true);
    setError(null);
    browserSourceRefreshFailed.current = false;
    setBrowserSourceRefreshError(null);
    try {
      const selectedDetail = await managementApi.getAlertSet(setId);
      setDetail(selectedDetail);
      setBrowserSourceStatusUpdatedAt(new Date().toISOString());
    } catch (cause) {
      setError(toActionableError("The alert set could not be opened", cause, "Refresh the alert-set list and try again."));
    } finally {
      setLoading(false);
    }
  }

  async function loadAlertSets(preferredSetId: string | null | undefined, handleFailure = false, effectGeneration: number | null = null) {
    const isStale = () => effectGeneration !== null && effectGeneration !== effectLoadGeneration.current;
    setLoading(true);
    setError(null);
    try {
      const loadedSets = await managementApi.listAlertSets();
      const selected = loadedSets.find((candidate) => candidate.id === preferredSetId)
        ?? loadedSets.find((candidate) => candidate.active)
        ?? loadedSets[0]
        ?? null;
      const loadedDetail = selected === null ? null : await managementApi.getAlertSet(selected.id);
      if (isStale()) return;
      setSets(loadedSets);
      setSelectedSetId(selected?.id ?? null);
      setExpandedSetId(selected?.id ?? null);
      setDetail(loadedDetail);
      setBrowserSourceStatusUpdatedAt(loadedDetail === null ? null : new Date().toISOString());
      browserSourceRefreshFailed.current = false;
      setBrowserSourceRefreshError(null);
      setInitialLoadFailed(false);
    } catch (cause) {
      if (isStale()) return;
      setInitialLoadFailed(detail === null);
      setError(toActionableError("Alert sets could not be loaded", cause, "Refresh the page and try again."));
      if (!handleFailure) throw cause;
    } finally {
      if (!isStale()) setLoading(false);
    }
  }

  async function refresh(preferredSetId = selectedSetId) {
    await loadAlertSets(preferredSetId);
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

  function openCreateAlertDialog() {
    const template = alertStarterTemplates[0];
    setCreateAlertEventType(template.eventType);
    setCreateAlertName(template.defaultName);
    setCreateAlertError(null);
    setCreateAlertOpen(true);
  }

  function selectAlertEventType(eventType: AlertCreateInput["eventType"]) {
    const template = alertStarterTemplates.find((candidate) => candidate.eventType === eventType);
    setCreateAlertEventType(eventType);
    if (template !== undefined) setCreateAlertName(template.defaultName);
  }

  async function submitCreateAlert(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (detail === null || createAlertName.trim() === "") return;
    setBusy(true);
    setCreateAlertError(null);
    try {
      const created = await managementApi.createAlert(detail.overview.id, {
        eventType: createAlertEventType,
        name: createAlertName.trim()
      });
      setCreateAlertOpen(false);
      onEditAlert(created);
    } catch (cause) {
      setCreateAlertError(toActionableError(
        "The alert was not created",
        cause,
        "Review the event type and alert name, then try again."
      ));
    } finally {
      setBusy(false);
    }
  }

  function openVariationDialog(alert: AlertInventoryRow) {
    setVariationParent(alert);
    setVariationName(`${alert.name} variation`);
    setVariationError(null);
  }

  async function submitVariation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (variationParent === null || variationName.trim() === "") return;
    setBusy(true);
    setVariationError(null);
    try {
      const created = await managementApi.createAlertVariation(variationParent.id, { name: variationName.trim() });
      await refresh(created.setId);
      setVariationParent(null);
      setNotice(`${created.name} created disabled and marked Needs review.`);
    } catch (cause) {
      setVariationError(toActionableError(
        "The variation was not created",
        cause,
        "Choose a unique name for this alert, then try again."
      ));
    } finally {
      setBusy(false);
    }
  }

  async function duplicateAlert(alert: AlertInventoryRow) {
    setBusy(true);
    setError(null);
    try {
      const created = await managementApi.duplicateManagedAlert(alert.id);
      await refresh(created.setId);
      setNotice(`${created.name} duplicated disabled and marked Needs review.`);
    } catch (cause) {
      setError(toActionableError("The alert was not duplicated", cause, "Review the alert and try again."));
    } finally {
      setBusy(false);
    }
  }

  async function confirmAlertMutation() {
    if (alertMutation === null) return;
    const { action, alert } = alertMutation;
    setBusy(true);
    setError(null);
    try {
      if (action === "reset") {
        await managementApi.resetManagedAlert(alert.id, true);
      } else {
        await managementApi.deleteManagedAlert(alert.id, true);
      }
      await refresh(alert.setId);
      setNotice(action === "reset" ? `${alert.name} reset to its event default and marked Needs review.` : `${alert.name} deleted.`);
      setAlertMutation(null);
    } catch (cause) {
      setError(toActionableError(
        action === "reset" ? "The alert was not reset" : "The alert was not deleted",
        cause,
        action === "reset" ? "Review the alert state and try again." : "Confirm the alert still exists, then try again."
      ));
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

  function requestInlineTest(alert: AlertInventoryRow) {
    if (alert.targetProfileIds.length === 0) {
      setError(toActionableError(
        "The alert test was not sent",
        new Error("The saved alert does not target an enabled profile."),
        "Open the alert, enable and review a target profile, then try again."
      ));
      return;
    }
    if (alert.targetProfileIds.length === 1) {
      void sendInlineTest(alert, alert.targetProfileIds[0]!);
      return;
    }
    setTestMenuAlertId((current) => current === alert.id ? null : alert.id);
  }

  async function sendInlineTest(alert: AlertInventoryRow, targetProfileId: TargetProfileId) {
    setTestingAlertId(alert.id);
    setTestMenuAlertId(null);
    setError(null);
    try {
      const document = await managementApi.getAlertEditorDocument(alert.id);
      const sample = document.samplePayloads.find((candidate) => candidate.kind === "built-in");
      if (sample === undefined) throw new Error("The saved alert has no built-in sample payload.");
      const result = await managementApi.sendAlertEditorTest(alert.id, {
        document,
        targetProfileId,
        samplePayload: sample.payload,
        includeAudio: true,
        includeTts: true
      });
      setNotice(`${alert.name} test queued for ${formatProfile(result.targetProfileId)}. Reference ${result.referenceId}.`);
    } catch (cause) {
      setError(toActionableError(
        "The alert test was not sent",
        cause,
        `Review the alert and connect the ${formatProfile(targetProfileId)} browser source, then try again.`
      ));
    } finally {
      setTestingAlertId(null);
    }
  }

  async function createBrowserSource(source: AlertBrowserSourceView) {
    setBusy(true);
    setError(null);
    try {
      await managementApi.createOverlayOutputKey(outputRequest(source));
      await refresh(detail?.overview.id ?? null);
      setNotice(`${formatProfile(source.targetProfileId)} URL created.`);
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
      setNotice(`${formatProfile(regenerateDialog.source.targetProfileId)} URL regenerated. Update every browser source that used the old URL.`);
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
      setNotice(`${formatProfile(source.targetProfileId)} URL copied.`);
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
  if (initialLoadFailed && error !== null) return <section aria-label="Alert sets" className="alert-sets-page"><ManagementErrorBanner error={error} /><button onClick={() => void loadAlertSets(initialSetId, true)} type="button">Retry loading alert sets</button></section>;

  return (
    <div className="alert-sets-page">
      {error === null ? null : <ManagementErrorBanner error={error} />}
      {notice === null ? null : <p className="alert-sets-page__notice" role="status">{notice}</p>}

      {detail === null ? null : (
        <BrowserSources
          busy={busy}
          expanded={browserSourcesExpanded}
          onCopy={(source) => void copyBrowserSource(source)}
          onCreate={(source) => void createBrowserSource(source)}
          onRegenerate={(source) => {
            setRegenerateConfirmation("");
            setRegenerateDialog({
              source,
              requiresTypedConfirmation: source.connectionState !== "never-connected" || source.lastConnectedAt !== null
            });
          }}
          onToggleReveal={(source) => setRevealedSourceIds((current) => {
            const next = new Set(current);
            if (next.has(source.id)) next.delete(source.id);
            else next.add(source.id);
            return next;
          })}
          onToggle={() => setBrowserSourcesExpanded((current) => !current)}
          profiles={detail.overview.targetProfiles}
          refreshError={browserSourceRefreshError}
          revealedSourceIds={revealedSourceIds}
          sources={detail.browserSources}
          statusUpdatedAt={browserSourceStatusUpdatedAt}
        />
      )}

      <section aria-labelledby="alert-sets-heading" className="alert-sets-page__management">
        <div className="alert-sets-page__toolbar">
          <div>
            <h2 id="alert-sets-heading">Alert sets</h2>
            <p>Prepare collections of alerts, validate their profiles, and choose the one used for live events.</p>
          </div>
          <button onClick={() => openNameDialog("create", null)} type="button">Create set</button>
        </div>

      {sets.length === 0 ? (
        <section className="alert-sets-page__empty">
          <h3>No alert sets</h3>
          <p>Create an alert set to configure stream event responses.</p>
          <button onClick={() => openNameDialog("create", null)} type="button">Create alert set</button>
        </section>
      ) : (
        <section aria-labelledby="available-alert-sets-heading" className="alert-sets-page__set-list">
          <div className="alert-sets-page__section-heading">
            <div><h3 id="available-alert-sets-heading">Available sets</h3><p>{sets.length} configured</p></div>
          </div>
          <div className="alert-sets-page__set-stack">
            {sets.map((set) => {
              const expanded = set.id === expandedSetId && detail?.overview.id === set.id;
              const expandedDetail = expanded ? detail : null;
              return (
                <article aria-label={`${set.name} alert set`} className={`alert-sets-page__set${expanded ? " alert-sets-page__set--expanded" : ""}`} key={set.id} role="region">
                  <div className="alert-sets-page__set-row">
                    <button
                      aria-expanded={expanded}
                      aria-label={`${expanded ? "Collapse" : "Expand"} ${set.name}`}
                      className="alert-sets-page__set-toggle"
                      onClick={() => void toggleSet(set.id)}
                      type="button"
                    >
                      <span aria-hidden="true">{expanded ? "−" : "+"}</span>
                      <strong>{set.name}</strong>
                      {set.starter ? <small>Starter</small> : null}
                    </button>
                    <div className="alert-sets-page__set-state">
                      <StatusBadge label={set.active ? "Active" : "Inactive"} tone={set.active ? "positive" : "neutral"} />
                      <span>{set.enabledAlertCount} enabled</span>
                      <ValidationRollup detail={detail?.overview.id === set.id ? detail : null} set={set} />
                    </div>
                    <div className="alert-sets-page__row-actions alert-sets-page__set-actions">
                      {set.starter && set.starterReviewState === "pending" && expanded ? <button disabled={busy} onClick={() => void markStarterReviewComplete()} type="button">Mark starter review done</button> : null}
                      {set.active ? null : <button aria-label={`Make ${set.name} active`} disabled={busy} onClick={() => void prepareActivation(set)} type="button">Activate</button>}
                      <button aria-label={`Rename ${set.name}`} className="button button--secondary" disabled={busy} onClick={() => openNameDialog("rename", set)} type="button">Rename</button>
                      <button aria-label={`Duplicate ${set.name}`} className="button button--secondary" disabled={busy} onClick={() => openNameDialog("duplicate", set)} type="button">Duplicate</button>
                      <button aria-label={`Delete ${set.name}`} className="button button--danger-quiet" disabled={busy || set.active} onClick={() => setDeleteSet(set)} type="button">Delete</button>
                    </div>
                  </div>
                  {expandedDetail === null ? null : (
                    <AlertInventory
                      alerts={filteredInventory}
                      busy={busy}
                      eventFilter={eventFilter}
                      eventTypes={[...new Set(expandedDetail.inventory.map((alert) => alert.eventType))]}
                      issues={expandedDetail.overview.validationIssues}
                      onEventFilter={setEventFilter}
                      onAdd={openCreateAlertDialog}
                      onCreateVariation={openVariationDialog}
                      onDelete={(alert) => setAlertMutation({ action: "delete", alert })}
                      onDuplicate={(alert) => void duplicateAlert(alert)}
                      onEdit={onEditAlert}
                      onPreview={setPreviewAlert}
                      onProfileFilter={setProfileFilter}
                      onQuery={setQuery}
                      onReset={(alert) => setAlertMutation({ action: "reset", alert })}
                      onStatusFilter={setStatusFilter}
                      onTest={requestInlineTest}
                      onTestProfile={(alert, targetProfileId) => void sendInlineTest(alert, targetProfileId)}
                      onToggle={(alert) => void toggleAlert(alert)}
                      profileFilter={profileFilter}
                      query={query}
                      statusFilter={statusFilter}
                      testMenuAlertId={testMenuAlertId}
                      testingAlertId={testingAlertId}
                      totalCount={expandedDetail.inventory.length}
                    />
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}
      </section>

      <NameDialog busy={busy} draft={nameDraft} onCancel={() => setNameDialog(null)} onChange={setNameDraft} onSubmit={submitNameDialog} state={nameDialog} />
      <CreateAlertDialog
        busy={busy}
        error={createAlertError}
        eventType={createAlertEventType}
        name={createAlertName}
        onCancel={() => setCreateAlertOpen(false)}
        onEventType={selectAlertEventType}
        onName={setCreateAlertName}
        onSubmit={submitCreateAlert}
        open={createAlertOpen}
      />
      <VariationDialog alert={variationParent} busy={busy} error={variationError} name={variationName} onCancel={() => setVariationParent(null)} onName={setVariationName} onSubmit={submitVariation} />
      <ActivationDialog busy={busy} impact={activationImpact} onCancel={() => { setActivationSet(null); setActivationImpact(null); }} onConfirm={() => void confirmActivation()} set={activationSet} />
      <PreviewDialog alert={previewAlert} onCancel={() => setPreviewAlert(null)} />
      <RegenerateDialog busy={busy} confirmation={regenerateConfirmation} onCancel={() => setRegenerateDialog(null)} onChange={setRegenerateConfirmation} onConfirm={() => void regenerateBrowserSource()} state={regenerateDialog} />
      <DeleteDialog busy={busy} onCancel={() => setDeleteSet(null)} onConfirm={() => void confirmDelete()} set={deleteSet} />
      <AlertMutationDialog busy={busy} onCancel={() => setAlertMutation(null)} onConfirm={() => void confirmAlertMutation()} state={alertMutation} />
    </div>
  );
}

function ValidationRollup({ detail, set }: { readonly detail: AlertSetDetail | null; readonly set: AlertSetOverview }) {
  const blockerCount = set.validationIssues.filter((issue) => issue.severity === "blocker").length;
  const warningCount = set.validationIssues.filter((issue) => issue.severity === "warning").length;
  const needsReviewCount = detail === null
    ? set.targetProfiles.filter((profile) => profile.reviewState === "needs-review").length
    : detail.inventory.filter((alert) => alert.reviewState === "needs-review").length;
  const needsReviewLabel = detail === null
    ? `${needsReviewCount} profile${needsReviewCount === 1 ? " needs" : "s need"} review`
    : `${needsReviewCount} need review`;

  if (blockerCount === 0 && warningCount === 0 && needsReviewCount === 0) {
    return <span className="alert-sets-page__validation-rollup alert-sets-page__validation-rollup--ready">Ready</span>;
  }

  return (
    <span aria-label="Validation summary" className="alert-sets-page__validation-rollup">
      {blockerCount > 0 ? <span className="alert-sets-page__validation-count alert-sets-page__validation-count--blocker">{formatCount(blockerCount, "blocker")}</span> : null}
      {warningCount > 0 ? <span className="alert-sets-page__validation-count alert-sets-page__validation-count--warning">{formatCount(warningCount, "warning")}</span> : null}
      {needsReviewCount > 0 ? <span className="alert-sets-page__validation-count alert-sets-page__validation-count--review">{needsReviewLabel}</span> : null}
    </span>
  );
}

function AlertInventory({
  alerts,
  busy,
  eventFilter,
  eventTypes,
  issues,
  onAdd,
  onCreateVariation,
  onDelete,
  onDuplicate,
  onEventFilter,
  onEdit,
  onPreview,
  onProfileFilter,
  onQuery,
  onReset,
  onStatusFilter,
  onTest,
  onTestProfile,
  onToggle,
  profileFilter,
  query,
  statusFilter,
  testMenuAlertId,
  testingAlertId,
  totalCount
}: {
  readonly alerts: readonly AlertInventoryRow[];
  readonly busy: boolean;
  readonly eventFilter: string;
  readonly eventTypes: readonly string[];
  readonly issues: readonly AlertValidationIssue[];
  readonly onAdd: () => void;
  readonly onCreateVariation: (alert: AlertInventoryRow) => void;
  readonly onDelete: (alert: AlertInventoryRow) => void;
  readonly onDuplicate: (alert: AlertInventoryRow) => void;
  readonly onEventFilter: (value: string) => void;
  readonly onEdit: (alert: AlertInventoryRow) => void;
  readonly onPreview: (alert: AlertInventoryRow) => void;
  readonly onProfileFilter: (value: string) => void;
  readonly onQuery: (value: string) => void;
  readonly onReset: (alert: AlertInventoryRow) => void;
  readonly onStatusFilter: (value: string) => void;
  readonly onTest: (alert: AlertInventoryRow) => void;
  readonly onTestProfile: (alert: AlertInventoryRow, targetProfileId: TargetProfileId) => void;
  readonly onToggle: (alert: AlertInventoryRow) => void;
  readonly profileFilter: string;
  readonly query: string;
  readonly statusFilter: string;
  readonly testMenuAlertId: string | null;
  readonly testingAlertId: string | null;
  readonly totalCount: number;
}) {
  const orderedAlerts = orderAlertRows(alerts);
  return (
    <section aria-labelledby="alert-inventory-heading" className="alert-sets-page__inventory">
      <div className="alert-sets-page__section-heading"><div><h3 id="alert-inventory-heading">Alerts</h3><p>{alerts.length} of {totalCount} shown</p></div><button disabled={busy} onClick={onAdd} type="button">Add alert</button></div>
      <div className="alert-sets-page__filters">
        <label><span>Search</span><input onChange={(event) => onQuery(event.currentTarget.value)} placeholder="Name, event, or provider" type="search" value={query} /></label>
        <label><span>Event</span><select onChange={(event) => onEventFilter(event.currentTarget.value)} value={eventFilter}><option value="all">All events</option>{eventTypes.map((eventType) => <option key={eventType} value={eventType}>{formatEventType(eventType)}</option>)}</select></label>
        <label><span>Status</span><select onChange={(event) => onStatusFilter(event.currentTarget.value)} value={statusFilter}><option value="all">All statuses</option><option value="enabled">Enabled</option><option value="disabled">Disabled</option></select></label>
        <label><span>Profile</span><select onChange={(event) => onProfileFilter(event.currentTarget.value)} value={profileFilter}><option value="all">All profiles</option><option value="landscape">Landscape</option><option value="vertical">Vertical</option></select></label>
      </div>
      <div className="alert-sets-page__table-wrap">
        <table className="alert-sets-page__table alert-sets-page__table--inventory">
          <thead><tr><th scope="col">Alert</th><th scope="col">Event</th><th scope="col">Profiles</th><th scope="col">State</th><th scope="col">Validation</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {orderedAlerts.map((alert) => {
              const alertIssues = issues.filter((issue) => issue.alertId === alert.id);
              const blockerCount = alertIssues.filter((issue) => issue.severity === "blocker").length;
              const warningCount = alertIssues.filter((issue) => issue.severity === "warning").length;
              const testMenuOpen = testMenuAlertId === alert.id;
              return (
                <tr className={alert.kind === "variation" ? "alert-sets-page__variation-row" : undefined} key={alert.id}>
                  <th scope="row"><span>{alert.name}</span><small>{alert.kind === "default" ? "Default" : "Variation"}</small></th>
                  <td data-label="Event"><span>{formatEventType(alert.eventType)}</span><small>{formatProvider(alert.providerKind)} catalog</small></td>
                  <td data-label="Profiles">{alert.targetProfileIds.map(formatProfile).join(", ") || "None"}</td>
                  <td data-label="State"><StatusBadge label={alert.enabled ? "Enabled" : "Disabled"} tone={alert.enabled ? "positive" : "neutral"} /></td>
                  <td data-label="Validation">
                    <span className="alert-sets-page__alert-validation">
                      {blockerCount > 0 ? <span className="alert-sets-page__validation-count alert-sets-page__validation-count--blocker">{formatCount(blockerCount, "blocker")}</span> : null}
                      {warningCount > 0 ? <span className="alert-sets-page__validation-count alert-sets-page__validation-count--warning">{formatCount(warningCount, "warning")}</span> : null}
                      {alert.reviewState === "needs-review" ? <span className="alert-sets-page__validation-count alert-sets-page__validation-count--review">Needs review</span> : blockerCount === 0 && warningCount === 0 ? <span className="alert-sets-page__validation-count alert-sets-page__validation-count--ready">Ready</span> : null}
                    </span>
                  </td>
                  <td data-label="Actions">
                    <div className="alert-sets-page__row-actions alert-sets-page__alert-actions">
                      <button aria-label={`Edit ${alert.name}`} className="button button--secondary button--compact" onClick={() => onEdit(alert)} type="button">Edit</button>
                      <button aria-expanded={testMenuOpen} aria-label={`Test ${alert.name}`} className="button button--secondary button--compact" disabled={testingAlertId === alert.id} onClick={() => onTest(alert)} type="button">{testingAlertId === alert.id ? "Testing..." : "Test"}</button>
                      <button aria-label={`${alert.enabled ? "Disable" : "Enable"} ${alert.name}`} className="button button--compact" disabled={busy} onClick={() => onToggle(alert)} type="button">{alert.enabled ? "Disable" : "Enable"}</button>
                      <details className="alert-sets-page__action-menu">
                        <summary aria-label={`More actions for ${alert.name}`}>More</summary>
                        <div role="group" aria-label={`Additional actions for ${alert.name}`}>
                          <button aria-label={`Preview ${alert.name}`} className="button button--secondary button--compact" onClick={() => onPreview(alert)} type="button">Preview</button>
                          {alert.kind === "default" ? <button aria-label={`Add variation to ${alert.name}`} className="button button--secondary button--compact" disabled={busy} onClick={() => onCreateVariation(alert)} type="button">Add variation</button> : null}
                          <button aria-label={`Duplicate ${alert.name}`} className="button button--secondary button--compact" disabled={busy} onClick={() => onDuplicate(alert)} type="button">Duplicate</button>
                          <button aria-label={`Reset ${alert.name}`} className="button button--secondary button--compact" disabled={busy} onClick={() => onReset(alert)} type="button">Reset</button>
                          <button aria-label={`Delete ${alert.name}`} className="button button--danger-quiet button--compact" disabled={busy} onClick={() => onDelete(alert)} type="button">Delete</button>
                        </div>
                      </details>
                    </div>
                    {testMenuOpen ? (
                      <div aria-label={`Choose test profile for ${alert.name}`} className="alert-sets-page__test-profiles" role="group">
                        {alert.targetProfileIds.map((targetProfileId) => (
                          <button aria-label={`Send ${alert.name} test to ${formatProfile(targetProfileId)}`} className="button button--secondary button--compact" key={targetProfileId} onClick={() => onTestProfile(alert, targetProfileId)} type="button">{formatProfile(targetProfileId)}</button>
                        ))}
                      </div>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {alerts.length === 0 ? <p className="alert-sets-page__empty-row">No alerts match these filters.</p> : null}
    </section>
  );
}

function BrowserSources({
  busy,
  expanded,
  onCopy,
  onCreate,
  onRegenerate,
  onToggleReveal,
  onToggle,
  profiles,
  refreshError,
  revealedSourceIds,
  sources,
  statusUpdatedAt
}: {
  readonly busy: boolean;
  readonly expanded: boolean;
  readonly onCopy: (source: AlertBrowserSourceView) => void;
  readonly onCreate: (source: AlertBrowserSourceView) => void;
  readonly onRegenerate: (source: AlertBrowserSourceView) => void;
  readonly onToggleReveal: (source: AlertBrowserSourceView) => void;
  readonly onToggle: () => void;
  readonly profiles: AlertSetOverview["targetProfiles"];
  readonly refreshError: ActionableManagementError | null;
  readonly revealedSourceIds: ReadonlySet<string>;
  readonly sources: readonly AlertBrowserSourceView[];
  readonly statusUpdatedAt: string | null;
}) {
  const readyCount = sources.filter((source) => source.copyableUrlStatus === "available").length;
  const needsSetupCount = sources.length - readyCount;

  return (
    <section aria-label="Browser sources" className="alert-sets-page__browser-source-band" id="browser-sources">
      <div className="alert-sets-page__browser-source-row">
        <div className="alert-sets-page__browser-source-heading">
          <h2>
            <button
              aria-controls="browser-source-details"
              aria-expanded={expanded}
              aria-label={`${expanded ? "Collapse" : "Expand"} browser sources`}
              className="alert-sets-page__browser-source-toggle"
              onClick={onToggle}
              type="button"
            >
              <span aria-hidden="true">{expanded ? "\u2212" : "+"}</span>
              <span>Browser sources</span>
            </button>
          </h2>
          <p>One live URL per target profile.</p>
        </div>
        <div aria-label="Browser source summary" className="alert-sets-page__browser-source-summary">
          <span className="alert-sets-page__browser-source-count alert-sets-page__browser-source-count--ready">{readyCount} ready</span>
          <span className="alert-sets-page__browser-source-count alert-sets-page__browser-source-count--warning">{needsSetupCount} needs setup</span>
          {refreshError === null ? null : <span className="alert-sets-page__browser-source-count alert-sets-page__browser-source-count--error">Status refresh failed</span>}
        </div>
      </div>
      {expanded ? (
        <div className="alert-sets-page__browser-source-details" id="browser-source-details">
          <p className={`alert-sets-page__status-freshness${refreshError === null ? "" : " alert-sets-page__status-freshness--stale"}`} role="status">
            {refreshError === null
              ? statusUpdatedAt === null ? "Connection status has not loaded." : `Connection status updated ${formatDateTime(statusUpdatedAt)}`
              : statusUpdatedAt === null ? "Connection status stale." : `Connection status stale. Last updated ${formatDateTime(statusUpdatedAt)}`}
          </p>
          {refreshError === null ? null : <ManagementErrorBanner error={refreshError} />}
          <div className="alert-sets-page__source-list">
            {sources.map((source) => {
              const label = formatProfile(source.targetProfileId);
              const dimensions = targetProfileDimensions[source.targetProfileId];
              const revealed = revealedSourceIds.has(source.id);
              const profileEnabled = profiles.find((profile) => profile.id === source.targetProfileId)?.enabled === true;
              const ready = source.copyableUrlStatus === "available";
              const listenerStatus = source.connectionState === "connected"
                ? "Listening now"
                : source.lastConnectedAt === null
                  ? "Not listening. No connection recorded."
                  : `Not listening. Last seen ${formatDateTime(source.lastConnectedAt)}`;
              return (
                <article aria-label={`${label} browser source`} className="alert-sets-page__source" key={source.id}>
                  <div className="alert-sets-page__source-heading"><div><strong>{label}</strong><span>{profileEnabled ? "Profile enabled" : "Profile disabled"}</span></div><StatusBadge label={ready ? "Ready" : "Needs setup"} tone={ready ? "positive" : "warning"} /></div>
                  <p className="alert-sets-page__source-telemetry">{listenerStatus}</p>
                  <p className="alert-sets-page__source-dimensions"><strong>{dimensions.width} x {dimensions.height}</strong></p>
                  <p className="alert-sets-page__source-guidance">Add a Browser source in OBS at {dimensions.width} x {dimensions.height}, then paste this URL.</p>
                  {source.url === null ? <p className="alert-sets-page__source-missing">Create a URL before adding this profile to OBS.</p> : revealed ? <input aria-label={`${label} browser source`} readOnly value={source.url} /> : <code className="alert-sets-page__source-masked">{maskRouteKey(source.url)}</code>}
                  <div className="alert-sets-page__row-actions">
                    {source.copyableUrlStatus === "create-required" ? <button disabled={busy} onClick={() => onCreate(source)} type="button">Create URL</button> : null}
                    {source.url === null ? null : <><button aria-label={`${revealed ? "Hide" : "Reveal"} ${label} URL`} className="button button--secondary" onClick={() => onToggleReveal(source)} type="button">{revealed ? "Hide" : "Reveal"}</button><button aria-label={`Copy ${label} URL`} className="button button--secondary" onClick={() => onCopy(source)} type="button">Copy</button></>}
                    {source.copyableUrlStatus !== "create-required" ? <button aria-label={`Regenerate ${label} URL`} className="button button--danger" disabled={busy} onClick={() => onRegenerate(source)} type="button">Regenerate</button> : null}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function NameDialog({ busy, draft, onCancel, onChange, onSubmit, state }: { readonly busy: boolean; readonly draft: string; readonly onCancel: () => void; readonly onChange: (value: string) => void; readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void; readonly state: NameDialogState | null }) {
  const title = state?.action === "create" ? "Create alert set" : state?.action === "rename" ? "Rename alert set" : "Duplicate alert set";
  return <ModalSurface labelledBy="alert-set-name-dialog-title" onCancel={onCancel} open={state !== null}><form className="alert-sets-page__modal" onSubmit={onSubmit}><div><h2 id="alert-set-name-dialog-title">{title}</h2><p>Saving does not change which alert set is active.</p></div><label><span>Alert set name</span><input autoComplete="off" autoFocus maxLength={120} onChange={(event) => onChange(event.currentTarget.value)} required value={draft} /></label><div className="management-modal__actions"><button className="button button--secondary" disabled={busy} onClick={onCancel} type="button">Cancel</button><button disabled={busy || draft.trim() === ""} type="submit">{state?.action === "duplicate" ? "Duplicate" : "Save"}</button></div></form></ModalSurface>;
}

function CreateAlertDialog({ busy, error, eventType, name, onCancel, onEventType, onName, onSubmit, open }: {
  readonly busy: boolean;
  readonly error: ActionableManagementError | null;
  readonly eventType: AlertCreateInput["eventType"];
  readonly name: string;
  readonly onCancel: () => void;
  readonly onEventType: (eventType: AlertCreateInput["eventType"]) => void;
  readonly onName: (name: string) => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly open: boolean;
}) {
  const template = alertStarterTemplates.find((candidate) => candidate.eventType === eventType) ?? alertStarterTemplates[0];
  const groups = [...new Set(alertStarterTemplates.map((candidate) => candidate.group))];
  return (
    <ModalSurface labelledBy="alert-create-dialog-title" onCancel={onCancel} open={open}>
      <form className="alert-sets-page__modal" onSubmit={onSubmit}>
        <div>
          <h2 id="alert-create-dialog-title">Add alert</h2>
          <p>The alert starts disabled. Review both target profiles in the editor before enabling it.</p>
        </div>
        {error === null ? null : <ManagementErrorBanner error={error} />}
        <label>
          <span>Event type</span>
          <select autoFocus onChange={(event) => onEventType(event.currentTarget.value as AlertCreateInput["eventType"])} value={eventType}>
            {groups.map((group) => (
              <optgroup key={group} label={group}>
                {alertStarterTemplates.filter((candidate) => candidate.group === group).map((candidate) => <option key={candidate.eventType} value={candidate.eventType}>{candidate.label}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
        <label>
          <span>Alert name</span>
          <input autoComplete="off" maxLength={120} onChange={(event) => onName(event.currentTarget.value)} required value={name} />
        </label>
        <div className="alert-sets-page__template-preview">
          <span>Starter message</span>
          <p>{template.text}</p>
          <small>{template.description}</small>
        </div>
        <div className="management-modal__actions">
          <button className="button button--secondary" disabled={busy} onClick={onCancel} type="button">Cancel</button>
          <button disabled={busy || name.trim() === ""} type="submit">{busy ? "Creating..." : "Create alert"}</button>
        </div>
      </form>
    </ModalSurface>
  );
}

function VariationDialog({ alert, busy, error, name, onCancel, onName, onSubmit }: {
  readonly alert: AlertInventoryRow | null;
  readonly busy: boolean;
  readonly error: ActionableManagementError | null;
  readonly name: string;
  readonly onCancel: () => void;
  readonly onName: (name: string) => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <ModalSurface labelledBy="alert-variation-dialog-title" onCancel={onCancel} open={alert !== null}>
      <form className="alert-sets-page__modal" onSubmit={onSubmit}>
        <div>
          <h2 id="alert-variation-dialog-title">Add variation to {alert?.name}</h2>
          <p>The variation copies the default design and starts disabled until reviewed.</p>
        </div>
        {error === null ? null : <ManagementErrorBanner error={error} />}
        <label><span>Variation name</span><input autoComplete="off" autoFocus maxLength={120} onChange={(event) => onName(event.currentTarget.value)} required value={name} /></label>
        <div className="management-modal__actions">
          <button className="button button--secondary" disabled={busy} onClick={onCancel} type="button">Cancel</button>
          <button disabled={busy || name.trim() === ""} type="submit">Create variation</button>
        </div>
      </form>
    </ModalSurface>
  );
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
  const label = state === null ? "Browser source" : formatProfile(state.source.targetProfileId);
  const confirmed = !state?.requiresTypedConfirmation || confirmation === "REGENERATE";
  return <ModalSurface labelledBy="regenerate-browser-source-title" onCancel={onCancel} open={state !== null}><div className="alert-sets-page__modal"><div><h2 id="regenerate-browser-source-title">Regenerate {label} URL?</h2><p>The current URL will stop working immediately. Update every browser source that uses it.</p></div>{state?.requiresTypedConfirmation ? <label><span>Type REGENERATE to continue</span><input autoComplete="off" onChange={(event) => onChange(event.currentTarget.value)} value={confirmation} /></label> : null}<div className="management-modal__actions"><button className="button button--secondary" disabled={busy} onClick={onCancel} type="button">Cancel</button><button className="button button--danger" disabled={busy || !confirmed} onClick={onConfirm} type="button">Regenerate URL</button></div></div></ModalSurface>;
}

function DeleteDialog({ busy, onCancel, onConfirm, set }: { readonly busy: boolean; readonly onCancel: () => void; readonly onConfirm: () => void; readonly set: AlertSetOverview | null }) {
  return <ModalSurface labelledBy="delete-alert-set-title" onCancel={onCancel} open={set !== null}><div className="alert-sets-page__modal"><div><h2 id="delete-alert-set-title">Delete {set?.name}?</h2><p>This permanently deletes the set and its alerts. Assets used elsewhere remain available.</p></div><div className="management-modal__actions"><button className="button button--secondary" disabled={busy} onClick={onCancel} type="button">Cancel</button><button className="button button--danger" disabled={busy} onClick={onConfirm} type="button">Delete alert set</button></div></div></ModalSurface>;
}

function AlertMutationDialog({ busy, onCancel, onConfirm, state }: {
  readonly busy: boolean;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
  readonly state: AlertMutationDialogState | null;
}) {
  const reset = state?.action === "reset";
  const title = reset ? `Reset ${state?.alert.name}?` : `Delete ${state?.alert.name}?`;
  return (
    <ModalSurface labelledBy="alert-mutation-dialog-title" onCancel={onCancel} open={state !== null}>
      <div className="alert-sets-page__modal">
        <div>
          <h2 id="alert-mutation-dialog-title">{title}</h2>
          <p>{reset
            ? "The saved design and matching controls will return to the event default. The alert will be disabled and require review."
            : state?.alert.kind === "default"
              ? "This permanently deletes the default alert and all of its variations. Shared assets remain available."
              : "This permanently deletes only this variation. Shared assets remain available."}</p>
          {state?.alert.enabled ? <p><strong>Live impact:</strong> This alert is enabled in the selected set. Confirming can change live output immediately.</p> : null}
        </div>
        <div className="management-modal__actions">
          <button className="button button--secondary" disabled={busy} onClick={onCancel} type="button">Cancel</button>
          <button className={reset ? "button button--primary" : "button button--danger"} disabled={busy} onClick={onConfirm} type="button">{reset ? "Reset alert" : "Delete alert"}</button>
        </div>
      </div>
    </ModalSurface>
  );
}

function orderAlertRows(alerts: readonly AlertInventoryRow[]): readonly AlertInventoryRow[] {
  const defaults = alerts.filter((alert) => alert.kind === "default");
  const attachedIds = new Set<string>();
  const ordered = defaults.flatMap((alert) => {
    const variations = alerts.filter((candidate) => candidate.parentAlertId === alert.id);
    variations.forEach((variation) => attachedIds.add(variation.id));
    return [alert, ...variations];
  });
  return [...ordered, ...alerts.filter((alert) => alert.kind === "variation" && !attachedIds.has(alert.id))];
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

function formatCount(value: number, noun: string): string {
  return formatLocalizedCount(value, { one: noun, other: `${noun}s` });
}

function formatProfile(value: "landscape" | "vertical"): string {
  return value === "landscape" ? "Landscape" : "Vertical";
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
    correction: { label: "Open Diagnostics", route: `/manage/diagnostics?reference=${encodeURIComponent(referenceId)}` }
  };
}
