import { actionableError } from "../foundation/actionable-error.js";
import { DestructiveConfirmationDialog } from "../foundation/DestructiveConfirmationDialog.js";
import { Button, Checkbox, NativeSelect, TextInput } from "@mantine/core";
import { DisclosureIcon, ModulePageLayout, ModuleControls, SectionHeading } from "../foundation/ModulePageLayout.js";
import { BrowserSourceRow } from "../foundation/BrowserSourceRow.js";
import { BrowserSourcesPanel } from "../foundation/BrowserSourcesPanel.js";
import {
  alertStarterTemplates,
  type ActionableManagementError,
  type AlertBrowserSourceView,
  type AlertEditorDocument,
  type AlertInventoryRow,
  type AlertSetActivationImpact,
  type AlertSetDetail,
  type AlertSetOverview,
  type AlertValidationIssue,
  type ChannelPointRewardSelection,
  type StreamEventType,
  type TargetProfileId
} from "@stream-jams/core";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ActionMenu, type ActionMenuItem } from "../foundation/ActionMenu.js";
import { ManagementErrorBanner } from "../foundation/ManagementErrorBanner.js";
import { ManagementErrorToast, ManagementToast, type ManagementToastNotice } from "../foundation/ManagementToast.js";
import { ManagementModalSurface as ModalSurface, ManagementModalTitle } from "../foundation/ManagementModalSurface.js";
import { StatusBadge } from "../foundation/StatusBadge.js";
import { formatCount, formatDateTime } from "../foundation/formatters.js";
import { formatEventLabel } from "../foundation/presentation-labels.js";
import type { ManagementApi } from "../management-api.js";
import { alertTestNotice } from "./alert-test-notice.js";
import { TwitchRewardPicker } from "./TwitchRewardPicker.js";
import {
  buildAlertEventGroups,
  filterAlertEventGroups,
  summarizeAlertInventoryRow,
  type AlertEventGroup,
  type FilteredAlertEventGroup,
  type FilteredAlertEventGroups
} from "./alert-event-groups.js";
import { findOverlappingChannelPointAlertNames } from "./channel-point-reward-overlap.js";
import "./alert-sets-page.css";

export type AlertSetsPageApi = Pick<
  ManagementApi,
  | "listAlertSets"
  | "getAlertSet"
  | "getTwitchCustomRewards"
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
  | "getOverlayModuleEnabled"
  | "setOverlayModuleEnabled"
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
  const [notice, setNotice] = useState<ManagementToastNotice | null>(null);
  const [nameDialog, setNameDialog] = useState<NameDialogState | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [createAlertOpen, setCreateAlertOpen] = useState(false);
  const [createAlertEventLocked, setCreateAlertEventLocked] = useState(false);
  const [createAlertEventType, setCreateAlertEventType] = useState<StreamEventType>(alertStarterTemplates[0].eventType);
  const [createAlertName, setCreateAlertName] = useState<string>(alertStarterTemplates[0].defaultName);
  const [createAlertRewardSelection, setCreateAlertRewardSelection] = useState<ChannelPointRewardSelection>({ mode: "all" });
  const [createAlertError, setCreateAlertError] = useState<ActionableManagementError | null>(null);
  const [variationParent, setVariationParent] = useState<AlertInventoryRow | null>(null);
  const [variationName, setVariationName] = useState("");
  const [variationError, setVariationError] = useState<ActionableManagementError | null>(null);
  const [alertMutation, setAlertMutation] = useState<AlertMutationDialogState | null>(null);
  const [activationImpact, setActivationImpact] = useState<AlertSetActivationImpact | null>(null);
  const [activationSet, setActivationSet] = useState<AlertSetOverview | null>(null);
  const [previewAlert, setPreviewAlert] = useState<AlertInventoryRow | null>(null);
  const [testMenuAlertId, setTestMenuAlertId] = useState<string | null>(null);
  const [testMenuProfileIds, setTestMenuProfileIds] = useState<readonly TargetProfileId[]>([]);
  const [testingAlertId, setTestingAlertId] = useState<string | null>(null);
  const [regenerateDialog, setRegenerateDialog] = useState<RegenerateDialogState | null>(null);
  const [deleteSet, setDeleteSet] = useState<AlertSetOverview | null>(null);
  const [revealedSourceIds, setRevealedSourceIds] = useState<ReadonlySet<string>>(() => new Set());
  const [query, setQuery] = useState("");
  const [eventFilter, setEventFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [profileFilter, setProfileFilter] = useState("all");
  const [showUnusedEventTypes, setShowUnusedEventTypes] = useState(false);
  const [browserSourceStatusUpdatedAt, setBrowserSourceStatusUpdatedAt] = useState<string | null>(null);
  const [browserSourceRefreshError, setBrowserSourceRefreshError] = useState<ActionableManagementError | null>(null);
  const [browserSourcesExpanded, setBrowserSourcesExpanded] = useState(false);
  const [moduleEnabled, setModuleEnabled] = useState<boolean | null>(null);
  const confirmationInFlight = useRef(false);
  const [confirmationError, setConfirmationError] = useState<ActionableManagementError | null>(null);
  const [moduleConfirmation, setModuleConfirmation] = useState<boolean | null>(null);
  const [manualExpandedEventKeys, setManualExpandedEventKeys] = useState<ReadonlySet<string>>(() => new Set());
  const [rewardTitleContext, setRewardTitleContext] = useState<{ readonly setId: string; readonly key: string; readonly titles: ReadonlyMap<string, string> } | null>(null);
  const browserSourceRefreshFailed = useRef(false);
  const effectLoadGeneration = useRef(0);
  const disclosureSetId = useRef<string | null>(null);
  const pendingFocus = useRef<{ readonly alertId: string | null; readonly groupKey: string } | null>(null);

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
    if (selectedSetId === null) return;
    const revealCorrection = () => {
      if (window.location.hash !== "#browser-sources") return;
      setBrowserSourcesExpanded(true);
      const region = document.getElementById("browser-sources");
      region?.scrollIntoView?.({ block: "start" });
      region?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    };
    revealCorrection();
    window.addEventListener("hashchange", revealCorrection);
    return () => window.removeEventListener("hashchange", revealCorrection);
  }, [selectedSetId]);

  const eventGroups = useMemo(() => buildAlertEventGroups(
    detail?.inventory ?? [],
    detail?.overview.validationIssues ?? []
  ), [detail]);
  const visibleEventGroups = useMemo(() => showUnusedEventTypes
    ? eventGroups
    : eventGroups.filter((group) => group.defaultCount + group.variationCount > 0), [eventGroups, showUnusedEventTypes]);
  const filteredEventGroups = useMemo(() => filterAlertEventGroups(visibleEventGroups, {
    query,
    eventType: eventFilter,
    ...(statusFilter === "all" ? {} : { status: statusFilter as "enabled" | "disabled" }),
    ...(profileFilter === "all" ? {} : { profileId: profileFilter as TargetProfileId })
  }), [eventFilter, profileFilter, query, statusFilter, visibleEventGroups]);
  const expandedEventKeys = useMemo(() => new Set([
    ...manualExpandedEventKeys,
    ...filteredEventGroups.forcedOpenKeys
  ]), [filteredEventGroups.forcedOpenKeys, manualExpandedEventKeys]);
  const createAlertOverlapNames = useMemo(() => findOverlappingChannelPointAlertNames(
    detail?.inventory ?? [],
    createAlertRewardSelection,
    null
  ), [createAlertRewardSelection, detail]);
  const rewardIdsKey = useMemo(() => [...new Set((detail?.inventory ?? []).flatMap((alert) => alert.conditions.flatMap((condition) =>
    condition.field === "channelPointReward" && Array.isArray(condition.value) ? condition.value.map(String) : []
  )))].sort().join("\u0000"), [detail?.inventory]);
  const rewardSetId = detail?.overview.id ?? null;
  const rewardTitles = rewardTitleContext?.setId === rewardSetId && rewardTitleContext.key === rewardIdsKey
    ? rewardTitleContext.titles
    : null;
  const loadTwitchCustomRewards = useCallback(
    () => managementApi.getTwitchCustomRewards(),
    [managementApi]
  );

  useEffect(() => {
    setRewardTitleContext(null);
    if (rewardIdsKey === "" || rewardSetId === null) return;
    let cancelled = false;
    void managementApi.getTwitchCustomRewards()
      .then(({ rewards }) => {
        if (!cancelled) setRewardTitleContext({ setId: rewardSetId, key: rewardIdsKey, titles: new Map(rewards.map((reward) => [reward.id, reward.title])) });
      })
      .catch(
      // error-provenance: allow expected -- failure is intentionally converted to the bounded fallback at this boundary
      () => { if (!cancelled) setRewardTitleContext({ setId: rewardSetId, key: rewardIdsKey, titles: new Map() }); });
    return () => { cancelled = true; };
  }, [managementApi, rewardIdsKey, rewardSetId]);

  useEffect(() => {
    const setId = detail?.overview.id ?? null;
    if (setId === null || disclosureSetId.current === setId) return;
    disclosureSetId.current = setId;
    setManualExpandedEventKeys(new Set(eventGroups
      .filter((group) => group.defaultCount + group.variationCount > 0)
      .map(({ key }) => key)));
  }, [detail?.overview.id, eventGroups]);

  useEffect(() => {
    const target = pendingFocus.current;
    if (target === null) return;
    const element = target.alertId === null
      ? document.getElementById(eventGroupButtonId(target.groupKey))
      : document.getElementById(alertRowFocusId(target.alertId));
    if (element === null && target.alertId !== null && detail?.inventory.some(({ id }) => id === target.alertId)) return;
    pendingFocus.current = null;
    (element
      ?? document.getElementById(eventGroupButtonId(target.groupKey))
      ?? document.getElementById("alert-inventory-add"))?.focus();
  }, [detail, expandedEventKeys]);

  function revealMutationTarget(groupKey: string) {
    setQuery("");
    setEventFilter("all");
    setStatusFilter("all");
    setProfileFilter("all");
    setManualExpandedEventKeys((current) => new Set([...current, groupKey]));
  }

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
    setNotice(null);
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
    setNotice(null);
    try {
      const [loadedSets, loadedModuleEnabled] = await Promise.all([
        managementApi.listAlertSets(),
        managementApi.getOverlayModuleEnabled("alerts")
      ]);
      const selected = loadedSets.find((candidate) => candidate.id === preferredSetId)
        ?? loadedSets.find((candidate) => candidate.active)
        ?? loadedSets[0]
        ?? null;
      const loadedDetail = selected === null ? null : await managementApi.getAlertSet(selected.id);
      if (isStale()) return;
      setSets(loadedSets);
      setModuleEnabled(loadedModuleEnabled);
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

  async function confirmModuleEnablement() {
    if (moduleConfirmation === null || confirmationInFlight.current) return;
    confirmationInFlight.current = true;
    setConfirmationError(null);
    setBusy(true);
    setError(null);
    try {
      const nextEnabled = await managementApi.setOverlayModuleEnabled("alerts", moduleConfirmation);
      setModuleEnabled(nextEnabled);
      setNotice({ tone: "success", message: `Alerts module is now ${nextEnabled ? "enabled" : "disabled"}.` });
      setModuleConfirmation(null);
    } catch (cause) {
      setConfirmationError(toActionableError("Alerts module could not be updated", cause, "Try again or open Diagnostics for the server reference."));
    } finally {
      confirmationInFlight.current = false;
      setBusy(false);
    }
  }

  function openNameDialog(action: NameAction, set: AlertSetOverview | null) {
    setError(null);
    setNotice(null);
    setNameDraft(action === "rename" ? set?.name ?? "" : action === "duplicate" ? `${set?.name ?? "Alert set"} copy` : "");
    setNameDialog({ action, set });
  }

  async function submitNameDialog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = nameDraft.trim();
    if (name === "" || nameDialog === null) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = nameDialog.action === "create"
        ? await managementApi.createAlertSet({ name })
        : nameDialog.action === "rename"
          ? await managementApi.renameAlertSet(nameDialog.set?.id ?? "", { name })
          : await managementApi.duplicateAlertSet(nameDialog.set?.id ?? "", { name });
      await refresh(result.id);
      setNotice({
        tone: nameDialog.action === "duplicate" ? "warning" : "success",
        message: nameDialog.action === "create" ? "Alert set created." : nameDialog.action === "rename" ? "Alert set renamed." : "Alert set duplicated."
      });
      setNameDialog(null);
    } catch (cause) {
      setError(toActionableError("The alert set was not saved", cause, "Check the name and try again."));
    } finally {
      setBusy(false);
    }
  }

  function openCreateAlertDialog(eventType?: StreamEventType) {
    const template = alertStarterTemplates.find((candidate) => candidate.eventType === eventType) ?? alertStarterTemplates[0];
    setCreateAlertEventType(template.eventType);
    setCreateAlertName(template.defaultName);
    setCreateAlertRewardSelection({ mode: "all" });
    setCreateAlertEventLocked(eventType !== undefined);
    setCreateAlertError(null);
    setCreateAlertOpen(true);
  }

  function selectAlertEventType(eventType: StreamEventType) {
    const template = alertStarterTemplates.find((candidate) => candidate.eventType === eventType);
    setCreateAlertEventType(eventType);
    setCreateAlertRewardSelection({ mode: "all" });
    if (template !== undefined) setCreateAlertName(template.defaultName);
  }

  async function submitCreateAlert(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      detail === null
      || createAlertName.trim() === ""
      || (
        createAlertEventType === "channel_point_redemption"
        && createAlertRewardSelection.mode === "selected"
        && createAlertRewardSelection.rewardIds.length === 0
      )
    ) return;
    setBusy(true);
    setCreateAlertError(null);
    try {
      const created = await managementApi.createAlert(detail.overview.id, {
        eventType: createAlertEventType,
        name: createAlertName.trim(),
        ...(createAlertEventType === "channel_point_redemption"
          ? { channelPointRewardSelection: createAlertRewardSelection }
          : {})
      });
      const groupKey = `event:${created.eventType}`;
      revealMutationTarget(groupKey);
      await refresh(created.setId);
      pendingFocus.current = { alertId: created.id, groupKey };
      setManualExpandedEventKeys((current) => new Set([...current, groupKey]));
      setCreateAlertOpen(false);
      setNotice({ tone: "warning", message: `${created.name} created disabled and marked Needs review.` });
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
      const groupKey = `event:${created.eventType}`;
      revealMutationTarget(groupKey);
      await refresh(created.setId);
      pendingFocus.current = { alertId: created.id, groupKey };
      setManualExpandedEventKeys((current) => new Set([...current, groupKey]));
      setVariationParent(null);
      setNotice({ tone: "warning", message: `${created.name} created disabled and marked Needs review.` });
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
    setNotice(null);
    try {
      const created = await managementApi.duplicateManagedAlert(alert.id);
      const groupKey = `event:${created.eventType}`;
      revealMutationTarget(groupKey);
      await refresh(created.setId);
      pendingFocus.current = { alertId: created.id, groupKey };
      setManualExpandedEventKeys((current) => new Set([...current, groupKey]));
      setNotice({ tone: "warning", message: `${created.name} duplicated disabled and marked Needs review.` });
    } catch (cause) {
      setError(toActionableError("The alert was not duplicated", cause, "Review the alert and try again."));
    } finally {
      setBusy(false);
    }
  }

  async function confirmAlertMutation() {
    if (alertMutation === null || confirmationInFlight.current) return;
    confirmationInFlight.current = true;
    setConfirmationError(null);
    const { action, alert } = alertMutation;
    const deleteFocus = action === "delete" ? focusTargetAfterDelete(eventGroups, alert) : null;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (action === "reset") {
        await managementApi.resetManagedAlert(alert.id, true);
      } else {
        await managementApi.deleteManagedAlert(alert.id, true);
        if (deleteFocus !== null) revealMutationTarget(deleteFocus.groupKey);
      }
      await refresh(alert.setId);
      if (deleteFocus !== null) {
        pendingFocus.current = deleteFocus;
        setManualExpandedEventKeys((current) => new Set([...current, deleteFocus.groupKey]));
      }
      setNotice({
        tone: action === "reset" ? "warning" : "success",
        message: action === "reset" ? `${alert.name} reset to its event default and marked Needs review.` : `${alert.name} deleted.`
      });
      setAlertMutation(null);
    } catch (cause) {
      setConfirmationError(toActionableError(
        action === "reset" ? "The alert was not reset" : "The alert was not deleted",
        cause,
        action === "reset" ? "Review the alert state and try again." : "Confirm the alert still exists, then try again."
      ));
    } finally {
      confirmationInFlight.current = false;
      setBusy(false);
    }
  }

  async function prepareActivation(set: AlertSetOverview) {
    setConfirmationError(null);
    setBusy(true);
    setError(null);
    setNotice(null);
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
    if (activationSet === null || activationImpact === null || activationImpact.blockers.length > 0 || confirmationInFlight.current) return;
    confirmationInFlight.current = true;
    setConfirmationError(null);
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await managementApi.activateAlertSet(activationSet.id, activationImpact.warnings.length > 0);
      await refresh(activationSet.id);
      setNotice({ tone: "success", message: `${activationSet.name} is now active.` });
      setActivationSet(null);
      setActivationImpact(null);
    } catch (cause) {
      setConfirmationError(toActionableError("The alert set was not activated", cause, "Resolve blockers or review warnings, then try again."));
    } finally {
      confirmationInFlight.current = false;
      setBusy(false);
    }
  }

  async function markStarterReviewComplete() {
    if (detail === null) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const overview = await managementApi.markStarterAlertSetReviewComplete(detail.overview.id);
      setDetail({ ...detail, overview });
      replaceOverview(overview);
      setNotice({ tone: "warning", message: "Starter review marked complete.", detail: "Alerts remain disabled until you enable them." });
    } catch (cause) {
      setError(toActionableError("Starter review was not updated", cause, "Try the action again."));
    } finally {
      setBusy(false);
    }
  }

  async function toggleAlert(alert: AlertInventoryRow) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await managementApi.setManagedAlertEnabled(alert.id, !alert.enabled);
      setDetail(updated);
      replaceOverview(updated.overview);
      setNotice({ tone: "success", message: `${alert.name} ${alert.enabled ? "disabled" : "enabled"}.` });
    } catch (cause) {
      setError(toActionableError("The alert was not updated", cause, "Review its validation state and try again."));
    } finally {
      setBusy(false);
    }
  }

  async function requestInlineTest(alert: AlertInventoryRow) {
    if (testMenuAlertId === alert.id) { setTestMenuAlertId(null); return; }
    setTestingAlertId(alert.id);
    setError(null);
    setNotice(null);
    try {
      const saved = await managementApi.getAlertEditorDocument(alert.id);
      const profiles = saved.targetProfiles.filter((profile) => profile.enabled && profile.reviewState === "ready");
      if (profiles.length <= 1) {
        await sendInlineTest(alert, profiles[0]?.id ?? null, saved);
      } else {
        setTestMenuProfileIds(profiles.map(({ id }) => id));
        setTestMenuAlertId(alert.id);
      }
    } catch (cause) {
      setError(toActionableError("The alert test was not sent", cause, "Reload the saved alert and review its audio outputs and browser sources, then retry."));
    } finally {
      setTestingAlertId(null);
    }
  }

  async function sendInlineTest(alert: AlertInventoryRow, targetProfileId: TargetProfileId | null, preparedDocument?: AlertEditorDocument) {
    setTestingAlertId(alert.id);
    setTestMenuAlertId(null);
    setError(null);
    setNotice(null);
    try {
      const document = preparedDocument ?? await managementApi.getAlertEditorDocument(alert.id);
      const sample = document.samplePayloads.find((candidate) => candidate.kind === "built-in");
      if (sample === undefined) throw new Error("The saved alert has no built-in sample payload.");
      const result = await managementApi.sendAlertEditorTest(alert.id, {
        document,
        targetProfileId,
        samplePayload: sample.payload,
        includeAudio: true,
        includeTts: true
      });
      setNotice(alertTestNotice(result));
    } catch (cause) {
      setError(toActionableError(
        "The alert test was not sent",
        cause,
        "Review the alert's selected Audio outputs in Settings, or connect and review its browser source, then try again."
      ));
    } finally {
      setTestingAlertId(null);
    }
  }

  async function createBrowserSource(source: AlertBrowserSourceView) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await managementApi.createOverlayOutputKey(outputRequest(source));
      await refresh(detail?.overview.id ?? null);
      setNotice({ tone: "success", message: `${formatProfile(source.targetProfileId)} URL created.` });
    } catch (cause) {
      setError(toActionableError("The browser-source URL was not created", cause, "Check Diagnostics, then try again."));
    } finally {
      setBusy(false);
    }
  }

  async function regenerateBrowserSource() {
    if (regenerateDialog === null || confirmationInFlight.current) return;
    confirmationInFlight.current = true;
    setConfirmationError(null);
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await managementApi.regenerateOverlayOutputKey(outputRequest(regenerateDialog.source));
      await refresh(detail?.overview.id ?? null);
      setNotice({
        tone: "warning",
        message: `${formatProfile(regenerateDialog.source.targetProfileId)} URL regenerated.`,
        detail: "Update every browser source that used the old URL."
      });
      setRegenerateDialog(null);
    } catch (cause) {
      setConfirmationError(toActionableError("The browser-source URL was not regenerated", cause, "Keep the current URL and retry after checking Diagnostics."));
    } finally {
      confirmationInFlight.current = false;
      setBusy(false);
    }
  }

  async function copyBrowserSource(source: AlertBrowserSourceView) {
    if (source.url === null) return;
    setError(null);
    setNotice(null);
    try {
      if (navigator.clipboard === undefined) throw new Error("Clipboard access is unavailable in this browser.");
      await navigator.clipboard.writeText(source.url);
      setNotice({ tone: "success", message: `${formatProfile(source.targetProfileId)} URL copied.` });
    } catch (cause) {
      setError(toActionableError("The browser-source URL was not copied", cause, "Reveal the URL and copy it manually."));
    }
  }

  async function confirmDelete() {
    if (deleteSet === null || confirmationInFlight.current) return;
    confirmationInFlight.current = true;
    setConfirmationError(null);
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await managementApi.deleteAlertSet(deleteSet.id);
      await refresh(null);
      setNotice({ tone: "success", message: `${deleteSet.name} deleted.` });
      setDeleteSet(null);
    } catch (cause) {
      setConfirmationError(toActionableError("The alert set was not deleted", cause, "Activate another set first, then retry."));
    } finally {
      confirmationInFlight.current = false;
      setBusy(false);
    }
  }

  function replaceOverview(overview: AlertSetOverview) {
    setSets((current) => current.map((set) => set.id === overview.id ? overview : set));
  }

  if (loading && detail === null) {
    return <p className="management-empty" role="status">Loading alert sets...</p>;
  }
  if (initialLoadFailed && error !== null) return <section aria-label="Alert sets" className="alert-sets-page"><ManagementErrorBanner error={error} /><Button onClick={() => void loadAlertSets(initialSetId, true)} type="button">Retry loading alert sets</Button></section>;

  return (
    <ModulePageLayout className="alert-sets-page" controls={<ModuleControls status={moduleEnabled === null ? null : <StatusBadge label={moduleEnabled ? "Module enabled" : "Module disabled"} tone={moduleEnabled ? "positive" : "neutral"} />} description="Saved module enablement controls rendering for new live events."><Button variant="default" disabled={busy || moduleEnabled === null} onClick={() => { setConfirmationError(null); setModuleConfirmation(!moduleEnabled); }}>{moduleEnabled ? "Disable Alerts module" : "Enable Alerts module"}</Button></ModuleControls>} outputs={detail === null ? null : (
        <BrowserSources
          busy={busy}
          expanded={browserSourcesExpanded}
          onCopy={(source) => void copyBrowserSource(source)}
          onCreate={(source) => void createBrowserSource(source)}
          onRegenerate={(source) => {
            setConfirmationError(null);
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
          refreshError={browserSourceRefreshError}
          revealedSourceIds={revealedSourceIds}
          sources={detail.browserSources}
          statusUpdatedAt={browserSourceStatusUpdatedAt}
        />
      )}>
      {error === null || nameDialog !== null ? null : <ManagementErrorToast error={error} onDismiss={() => setError(null)} />}
      {notice === null ? null : <ManagementToast notice={notice} onDismiss={() => setNotice(null)} />}


      <section aria-labelledby="alert-sets-heading" className="alert-sets-page__management">
        <SectionHeading id="alert-sets-heading" title="Alert sets" description="Prepare collections of alerts, validate their profiles, and choose the one used for live events." actions={<Button onClick={() => openNameDialog("create", null)}>Create set</Button>} />

      {sets.length === 0 ? (
        <section className="alert-sets-page__empty">
          <h3>No alert sets</h3>
          <p>Create an alert set to configure stream event responses.</p>
          <Button onClick={() => openNameDialog("create", null)} type="button">Create alert set</Button>
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
                      <DisclosureIcon expanded={expanded} />
                      <strong>{set.name}</strong>
                      {set.starter ? <small>Starter</small> : null}
                    </button>
                    <div className="alert-sets-page__set-state">
                      <StatusBadge label={set.active ? "Active" : "Inactive"} tone={set.active ? "positive" : "neutral"} />
                      <span>{set.enabledAlertCount} enabled</span>
                      <ValidationRollup set={set} />
                    </div>
                    <div className="alert-sets-page__row-actions alert-sets-page__set-actions">
                      {set.starter && set.starterReviewState === "pending" && expanded ? <Button disabled={busy} onClick={() => void markStarterReviewComplete()} type="button">Mark starter review done</Button> : null}
                      {set.active ? null : <Button aria-label={`Make ${set.name} active`} disabled={busy} onClick={() => void prepareActivation(set)} type="button">Activate</Button>}
                      <Button aria-label={`Rename ${set.name}`} variant="default" disabled={busy} onClick={() => openNameDialog("rename", set)} type="button">Rename</Button>
                      <Button aria-label={`Duplicate ${set.name}`} variant="default" disabled={busy} onClick={() => openNameDialog("duplicate", set)} type="button">Duplicate</Button>
                      <Button aria-label={`Delete ${set.name}`} color="red" variant="light" disabled={busy || set.active} onClick={() => { setConfirmationError(null); setDeleteSet(set); }} type="button">Delete</Button>
                    </div>
                  </div>
                  {expandedDetail === null ? null : (
                    <AlertInventory
                      busy={busy}
                      eventFilter={eventFilter}
                      eventTypes={eventGroups.map(({ eventType }) => eventType)}
                      expandedKeys={expandedEventKeys}
                      filtered={filteredEventGroups}
                      groups={eventGroups}
                      issues={expandedDetail.overview.validationIssues}
                      rewardTitles={rewardTitles}
                      onEventFilter={setEventFilter}
                      onAdd={() => openCreateAlertDialog()}
                      onAddForEvent={openCreateAlertDialog}
                      onCreateVariation={openVariationDialog}
                      onDelete={(alert) => { setConfirmationError(null); setAlertMutation({ action: "delete", alert }); }}
                      onDuplicate={(alert) => void duplicateAlert(alert)}
                      onEdit={onEditAlert}
                      onPreview={setPreviewAlert}
                      onProfileFilter={setProfileFilter}
                      onQuery={setQuery}
                      onReset={(alert) => { setConfirmationError(null); setAlertMutation({ action: "reset", alert }); }}
                      onStatusFilter={setStatusFilter}
                      onShowUnusedEventTypes={setShowUnusedEventTypes}
                      onTest={requestInlineTest}
                      onTestProfile={(alert, targetProfileId) => void sendInlineTest(alert, targetProfileId)}
                      onToggle={(alert) => void toggleAlert(alert)}
                      onToggleGroup={(key) => setManualExpandedEventKeys((current) => {
                        const next = new Set(current);
                        if (next.has(key)) next.delete(key);
                        else next.add(key);
                        return next;
                      })}
                      profileFilter={profileFilter}
                      query={query}
                      statusFilter={statusFilter}
                      showUnusedEventTypes={showUnusedEventTypes}
                      testMenuAlertId={testMenuAlertId}
                      testMenuProfileIds={testMenuProfileIds}
                      testingAlertId={testingAlertId}
                    />
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}
      </section>

      <NameDialog busy={busy} error={error} onDismissError={() => setError(null)} draft={nameDraft} onCancel={() => { setNameDialog(null); setError(null); }} onChange={setNameDraft} onSubmit={submitNameDialog} state={nameDialog} />
      <CreateAlertDialog
        busy={busy}
        error={createAlertError}
        eventType={createAlertEventType}
        eventTypeLocked={createAlertEventLocked}
        loadTwitchCustomRewards={loadTwitchCustomRewards}
        name={createAlertName}
        onCancel={() => setCreateAlertOpen(false)}
        onEventType={selectAlertEventType}
        onName={setCreateAlertName}
        onRewardSelection={setCreateAlertRewardSelection}
        onSubmit={submitCreateAlert}
        open={createAlertOpen}
        overlapAlertNames={createAlertOverlapNames}
        rewardSelection={createAlertRewardSelection}
      />
      <VariationDialog alert={variationParent} busy={busy} error={variationError} name={variationName} onCancel={() => setVariationParent(null)} onName={setVariationName} onSubmit={submitVariation} />
      <ActivationDialog error={confirmationError} busy={busy} impact={activationImpact} onCancel={() => { setActivationSet(null); setActivationImpact(null); setConfirmationError(null); }} onConfirm={() => void confirmActivation()} set={activationSet} />
      <PreviewDialog alert={previewAlert} onCancel={() => setPreviewAlert(null)} />
      <DestructiveConfirmationDialog actionLabel="Regenerate URL" title={`Regenerate ${regenerateDialog === null ? "browser-source" : formatProfile(regenerateDialog.source.targetProfileId)} URL?`} scope="Alerts browser source" targetId={regenerateDialog?.source.id ?? "closed"} open={regenerateDialog !== null} pending={busy} error={confirmationError} {...(regenerateDialog?.requiresTypedConfirmation ? { confirmText: "REGENERATE" } : {})} consequences="The current URL will stop working immediately. Update every browser source that uses it." recovery={null} onCancel={() => { setRegenerateDialog(null); setConfirmationError(null); }} onConfirm={regenerateBrowserSource} />
      <DeleteDialog error={confirmationError} busy={busy} onCancel={() => { setDeleteSet(null); setConfirmationError(null); }} onConfirm={() => void confirmDelete()} set={deleteSet} />
      <AlertMutationDialog error={confirmationError} busy={busy} onCancel={() => { setAlertMutation(null); setConfirmationError(null); }} onConfirm={() => void confirmAlertMutation()} state={alertMutation} />
      <DestructiveConfirmationDialog actionLabel="Confirm change" title={`${moduleConfirmation ? "Enable" : "Disable"} Alerts module?`} scope="Alerts module" targetId={`alerts-${String(moduleConfirmation)}`} open={moduleConfirmation !== null} pending={busy} error={confirmationError} consequences={moduleConfirmation ? "Enabled alerts in the active set may render for new live events." : "Saved alert sets and individual alert settings remain unchanged, but Alerts stop rendering until the module is enabled again."} recovery="Change saved module enablement again when ready." onCancel={() => { setModuleConfirmation(null); setConfirmationError(null); }} onConfirm={confirmModuleEnablement} />
    </ModulePageLayout>
  );
}

function ValidationRollup({ set }: { readonly set: AlertSetOverview }) {
  const blockerCount = set.validationIssues.filter((issue) => issue.severity === "blocker").length;
  const warningCount = set.validationIssues.filter((issue) => issue.severity === "warning").length;
  const needsReviewCount = set.profileUsage.reduce(
    (count, profile) => count + profile.enabledAlertCount - profile.playableAlertCount,
    0
  );
  const needsReviewLabel = formatCount(
    needsReviewCount,
    { one: "alert profile needs review", other: "alert profiles need review" }
  );

  if (blockerCount === 0 && warningCount === 0 && needsReviewCount === 0) {
    return <span className="alert-sets-page__validation-rollup alert-sets-page__validation-rollup--ready">Ready</span>;
  }

  return (
    <span aria-label="Validation summary" className="alert-sets-page__validation-rollup">
      {blockerCount > 0 ? <span className="alert-sets-page__validation-count alert-sets-page__validation-count--blocker">{formatCount(blockerCount, { one: "blocker", other: "blockers" })}</span> : null}
      {warningCount > 0 ? <span className="alert-sets-page__validation-count alert-sets-page__validation-count--warning">{formatCount(warningCount, { one: "warning", other: "warnings" })}</span> : null}
      {needsReviewCount > 0 ? <span className="alert-sets-page__validation-count alert-sets-page__validation-count--review">{needsReviewLabel}</span> : null}
    </span>
  );
}

function AlertInventory({
  busy,
  eventFilter,
  eventTypes,
  expandedKeys,
  filtered,
  groups,
  issues,
  rewardTitles,
  onAdd,
  onAddForEvent,
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
  onShowUnusedEventTypes,
  onTest,
  onTestProfile,
  onToggle,
  onToggleGroup,
  profileFilter,
  query,
  statusFilter,
  showUnusedEventTypes,
  testMenuAlertId,
  testMenuProfileIds,
  testingAlertId,
}: {
  readonly busy: boolean;
  readonly eventFilter: string;
  readonly eventTypes: readonly string[];
  readonly expandedKeys: ReadonlySet<string>;
  readonly filtered: FilteredAlertEventGroups;
  readonly groups: readonly AlertEventGroup[];
  readonly issues: readonly AlertValidationIssue[];
  readonly rewardTitles: ReadonlyMap<string, string> | null;
  readonly onAdd: () => void;
  readonly onAddForEvent: (eventType: StreamEventType) => void;
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
  readonly onShowUnusedEventTypes: (value: boolean) => void;
  readonly onTest: (alert: AlertInventoryRow) => void;
  readonly onTestProfile: (alert: AlertInventoryRow, targetProfileId: TargetProfileId) => void;
  readonly onToggle: (alert: AlertInventoryRow) => void;
  readonly onToggleGroup: (key: string) => void;
  readonly profileFilter: string;
  readonly query: string;
  readonly statusFilter: string;
  readonly showUnusedEventTypes: boolean;
  readonly testMenuAlertId: string | null;
  readonly testMenuProfileIds: readonly TargetProfileId[];
  readonly testingAlertId: string | null;
}) {
  return (
    <section aria-labelledby="alert-inventory-heading" className="alert-sets-page__inventory">
      <div className="alert-sets-page__section-heading"><div><h3 id="alert-inventory-heading">Alerts</h3><p>{filtered.matchingAlertCount} of {filtered.totalAlertCount} shown</p></div><Button disabled={busy} id="alert-inventory-add" onClick={onAdd} type="button">Add alert</Button></div>
      <div className="alert-sets-page__filters">
        <TextInput label="Search" aria-label="Search" onChange={(event) => onQuery(event.currentTarget.value)} placeholder="Name, event, or provider" type="search" value={query} />
        <NativeSelect label="Event" onChange={(event) => onEventFilter(event.currentTarget.value)} value={eventFilter}><option value="all">All events</option>{eventTypes.map((eventType) => <option key={eventType} value={eventType}>{formatEventType(eventType)}</option>)}</NativeSelect>
        <NativeSelect label="Status" onChange={(event) => onStatusFilter(event.currentTarget.value)} value={statusFilter}><option value="all">All statuses</option><option value="enabled">Enabled</option><option value="disabled">Disabled</option></NativeSelect>
        <NativeSelect label="Profile" onChange={(event) => onProfileFilter(event.currentTarget.value)} value={profileFilter}><option value="all">All profiles</option><option value="landscape">Landscape</option><option value="vertical">Vertical</option></NativeSelect>
        <Checkbox className="alert-sets-page__unused-events" checked={showUnusedEventTypes} onChange={(event) => onShowUnusedEventTypes(event.currentTarget.checked)} label="Show unused event types" />
      </div>
      <div className="alert-sets-page__event-groups">
        {filtered.groups.map((group) => {
          const expanded = expandedKeys.has(group.key);
          const contentId = eventGroupContentId(group.key);
          const fullGroup = groups.find(({ key }) => key === group.key) ?? group;
          return (
            <section className="alert-sets-page__event-group" data-catalog-group={group.catalogGroup} key={group.key}>
              <header className="alert-sets-page__event-header">
                <button
                  aria-controls={contentId}
                  aria-expanded={expanded}
                  aria-label={`${expanded ? "Collapse" : "Expand"} ${group.label} alerts`}
                  className="alert-sets-page__event-toggle"
                  id={eventGroupButtonId(group.key)}
                  onClick={() => onToggleGroup(group.key)}
                  type="button"
                >
                  <DisclosureIcon expanded={expanded} />
                  <span className="alert-sets-page__event-identity"><strong>{group.label}</strong><small>{group.catalogGroup}</small></span>
                  <span className="alert-sets-page__event-counts">
                    {formatCount(group.defaultCount, { one: "default", other: "defaults" })}
                    {" · "}{formatCount(group.variationCount, { one: "variation", other: "variations" })}
                    {" · "}{group.enabledCount} enabled
                    {filtered.hasActiveFilters ? ` · ${group.matchingDefaultCount + group.matchingVariationCount} matching` : ""}
                  </span>
                  <span className={`alert-sets-page__event-status alert-sets-page__event-status--${group.status}`}>{eventStatusLabel(group.status)}</span>
                </button>
                {group.known ? <Button variant="default" size="xs" disabled={busy} onClick={() => onAddForEvent(group.eventType as StreamEventType)} type="button">Add alert for {group.label}</Button> : null}
              </header>
              {expanded ? (
                <div className="alert-sets-page__event-content" id={contentId}>
                  {group.defaults.length === 0 && group.orphanVariations.length === 0 ? <p className="alert-sets-page__event-empty">No alerts configured for {group.label}.</p> : null}
                  {group.defaults.length === 0 ? null : (
                    <AlertRowsTable
                      busy={busy}
                      defaults={group.defaults}
                      fullGroup={fullGroup}
                      issues={issues}
                      rewardTitles={rewardTitles}
                      onCreateVariation={onCreateVariation}
                      onDelete={onDelete}
                      onDuplicate={onDuplicate}
                      onEdit={onEdit}
                      onPreview={onPreview}
                      onReset={onReset}
                      onTest={onTest}
                      onTestProfile={onTestProfile}
                      onToggle={onToggle}
                      testMenuAlertId={testMenuAlertId}
                      testMenuProfileIds={testMenuProfileIds}
                      testingAlertId={testingAlertId}
                    />
                  )}
                  {group.orphanVariations.length === 0 ? null : (
                    <section aria-labelledby={`${contentId}-orphans`} className="alert-sets-page__orphans">
                      <h4 id={`${contentId}-orphans`}>Orphan variations</h4>
                      <p>These saved variations have no available owning default. They remain visible for diagnosis and recovery.</p>
                      <AlertRowsTable
                        busy={busy}
                        defaults={[]}
                        fullGroup={fullGroup}
                        issues={issues}
                        rewardTitles={rewardTitles}
                        onCreateVariation={onCreateVariation}
                        onDelete={onDelete}
                        onDuplicate={onDuplicate}
                        onEdit={onEdit}
                        onPreview={onPreview}
                        onReset={onReset}
                        onTest={onTest}
                        onTestProfile={onTestProfile}
                        onToggle={onToggle}
                        orphanVariations={group.orphanVariations}
                        testMenuAlertId={testMenuAlertId}
                        testMenuProfileIds={testMenuProfileIds}
                        testingAlertId={testingAlertId}
                      />
                    </section>
                  )}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
      {filtered.groups.length === 0 ? <div className="alert-sets-page__empty-row">{groups.every((group) => group.defaultCount + group.variationCount === 0) && !filtered.hasActiveFilters ? <p>No alerts configured yet.</p> : <><p>No alerts match these filters.</p><Button onClick={() => { onQuery(""); onEventFilter("all"); onStatusFilter("all"); onProfileFilter("all"); }} type="button">Clear filters</Button></>}</div> : null}
    </section>
  );
}

function AlertRowsTable({
  busy,
  defaults,
  fullGroup,
  issues,
  rewardTitles,
  onCreateVariation,
  onDelete,
  onDuplicate,
  onEdit,
  onPreview,
  onReset,
  onTest,
  onTestProfile,
  onToggle,
  orphanVariations = [],
  testMenuAlertId,
  testMenuProfileIds,
  testingAlertId
}: {
  readonly busy: boolean;
  readonly defaults: FilteredAlertEventGroup["defaults"];
  readonly fullGroup: AlertEventGroup;
  readonly issues: readonly AlertValidationIssue[];
  readonly rewardTitles: ReadonlyMap<string, string> | null;
  readonly onCreateVariation: (alert: AlertInventoryRow) => void;
  readonly onDelete: (alert: AlertInventoryRow) => void;
  readonly onDuplicate: (alert: AlertInventoryRow) => void;
  readonly onEdit: (alert: AlertInventoryRow) => void;
  readonly onPreview: (alert: AlertInventoryRow) => void;
  readonly onReset: (alert: AlertInventoryRow) => void;
  readonly onTest: (alert: AlertInventoryRow) => void;
  readonly onTestProfile: (alert: AlertInventoryRow, targetProfileId: TargetProfileId) => void;
  readonly onToggle: (alert: AlertInventoryRow) => void;
  readonly orphanVariations?: readonly AlertInventoryRow[];
  readonly testMenuAlertId: string | null;
  readonly testMenuProfileIds: readonly TargetProfileId[];
  readonly testingAlertId: string | null;
}) {
  const rows = [
    ...defaults.flatMap(({ alert, variations }) => [
      { alert, siblings: [] as readonly AlertInventoryRow[] },
      ...variations.map((variation) => ({
        alert: variation,
        siblings: fullGroup.defaults.find(({ alert: candidate }) => candidate.id === alert.id)?.variations ?? variations
      }))
    ]),
    ...orphanVariations.map((alert) => ({ alert, siblings: fullGroup.orphanVariations }))
  ];
  return (
    <div className="alert-sets-page__table-wrap">
      <table className="alert-sets-page__table alert-sets-page__table--inventory">
        <thead><tr><th scope="col">Alert</th><th scope="col">Profiles</th><th scope="col">State</th><th scope="col">Validation</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>
          {rows.map(({ alert, siblings }) => {
            const alertIssues = issues.filter((issue) => issue.alertId !== null
              ? issue.alertId === alert.id
              : issue.eventType === alert.eventType);
            const blockerCount = alertIssues.filter((issue) => issue.severity === "blocker").length;
            const warningCount = alertIssues.filter((issue) => issue.severity === "warning").length;
            const testMenuOpen = testMenuAlertId === alert.id;
            const summary = summarizeAlertInventoryRow(alert, siblings, fullGroup.known, rewardTitles);
            return (
              <tr className={alert.kind === "variation" ? "alert-sets-page__variation-row" : undefined} key={alert.id}>
                <th scope="row">
                  <span>{alert.name}</span><small>{alert.kind === "default" ? "Default" : "Variation"} · {formatProvider(alert.providerKind)} catalog</small>
                  {summary.conditionSummaries.map((condition, index) => <small key={`${condition}-${index}`}>{condition}{summary.conditionDetails[index] === null ? null : <span className="alert-sets-page__condition-detail">{summary.conditionDetails[index]}</span>}</small>)}
                  {summary.prioritySummary === null ? null : <small>{summary.prioritySummary}</small>}
                  {summary.weightSummary === null ? null : <small>{summary.weightSummary}</small>}
                </th>
                <td data-label="Profiles">{alert.targetProfileIds.map(formatProfile).join(", ") || "None"}</td>
                <td data-label="State"><StatusBadge label={alert.enabled ? "Enabled" : "Disabled"} tone={alert.enabled ? "positive" : "neutral"} /></td>
                <td data-label="Validation"><span className="alert-sets-page__alert-validation">
                  {blockerCount > 0 ? <span className="alert-sets-page__validation-count alert-sets-page__validation-count--blocker">{formatCount(blockerCount, { one: "blocker", other: "blockers" })}</span> : null}
                  {warningCount > 0 ? <span className="alert-sets-page__validation-count alert-sets-page__validation-count--warning">{formatCount(warningCount, { one: "warning", other: "warnings" })}</span> : null}
                  {alert.reviewState === "needs-review" ? <span className="alert-sets-page__validation-count alert-sets-page__validation-count--review">Needs review</span> : blockerCount === 0 && warningCount === 0 ? <span className="alert-sets-page__validation-count alert-sets-page__validation-count--ready">Ready</span> : null}
                </span></td>
                <td data-label="Actions">
                  <div className="alert-sets-page__row-actions alert-sets-page__alert-actions">
                    <Button aria-label={`Edit ${alert.name}`} variant="default" size="xs" id={alertRowFocusId(alert.id)} onClick={() => onEdit(alert)} type="button">Edit</Button>
                    <Button aria-expanded={testMenuOpen} aria-label={`Test saved ${alert.name}`} variant="default" size="xs" disabled={testingAlertId === alert.id} onClick={() => onTest(alert)} type="button">{testingAlertId === alert.id ? "Testing..." : "Test saved"}</Button>
                    <Button aria-label={`${alert.enabled ? "Disable" : "Enable"} ${alert.name}`} size="xs" className="alert-sets-page__toggle-action" disabled={busy} onClick={() => onToggle(alert)} type="button">{alert.enabled ? "Disable" : "Enable"}</Button>
                    <ActionMenu
                      items={[
                        { accessibleLabel: `Sample message ${alert.name}`, label: "Sample message", onSelect: () => onPreview(alert) },
                        ...(alert.kind === "default" ? [{ accessibleLabel: `Add variation to ${alert.name}`, disabled: busy, label: "Add variation", onSelect: () => onCreateVariation(alert) } satisfies ActionMenuItem] : []),
                        { accessibleLabel: `Duplicate ${alert.name}`, disabled: busy, label: "Duplicate", onSelect: () => onDuplicate(alert) },
                        { accessibleLabel: `Reset ${alert.name}`, disabled: busy, label: "Reset", onSelect: () => onReset(alert) },
                        { accessibleLabel: `Delete ${alert.name}`, disabled: busy, label: "Delete", onSelect: () => onDelete(alert), tone: "danger" }
                      ]}
                      label={`More actions for ${alert.name}`}
                      triggerSize="xs"
                    />
                  </div>
                  <small className="alert-sets-page__test-summary">Saved input · Browser {alert.targetProfileIds.map(formatProfile).join(", ") || "none"}{alert.targetProfileIds.includes("landscape") ? " · Desktop Landscape when ready" : ""} · Selected device outputs · Audio and TTS included</small>
                  {testMenuOpen ? <div aria-label={`Choose test profile for ${alert.name}`} className="alert-sets-page__test-profiles" role="group">{testMenuProfileIds.map((targetProfileId) => <Button aria-label={`Send ${alert.name} saved test to ${formatProfile(targetProfileId)}`} variant="default" size="xs" key={targetProfileId} onClick={() => onTestProfile(alert, targetProfileId)} type="button">{formatProfile(targetProfileId)}</Button>)}</div> : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
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
  readonly refreshError: ActionableManagementError | null;
  readonly revealedSourceIds: ReadonlySet<string>;
  readonly sources: readonly AlertBrowserSourceView[];
  readonly statusUpdatedAt: string | null;
}) {
  const readyCount = sources.filter((source) => source.copyableUrlStatus === "available").length;
  const needsSetupCount = sources.length - readyCount;

  return (
    <BrowserSourcesPanel id="browser-sources" detailsId="browser-source-details" expanded={expanded} onToggle={onToggle} readyCount={readyCount} needsSetupCount={needsSetupCount} refreshFailed={refreshError !== null}>
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
          const ready = source.copyableUrlStatus === "available";
          const listenerStatus = source.connectionState === "connected"
            ? "Listening now"
            : source.lastConnectedAt === null
              ? "Not listening. No connection recorded."
              : `Not listening. Last seen ${formatDateTime(source.lastConnectedAt)}`;
          return (
            <BrowserSourceRow key={source.id} label={label} ready={ready} telemetry={listenerStatus} metadata={<strong><bdi dir="ltr">{dimensions.width} x {dimensions.height}</bdi></strong>} guidance={<>Add a Browser source in OBS at {dimensions.width} x {dimensions.height}, then paste this URL.</>} url={source.url === null ? <p className="browser-source-row__missing">Create a URL before adding this profile to OBS.</p> : revealed ? <input aria-label={`${label} browser source`} readOnly value={source.url} /> : <code>{maskRouteKey(source.url)}</code>} actions={<>

                {source.copyableUrlStatus === "create-required" ? <Button disabled={busy} onClick={() => onCreate(source)} type="button">Create URL</Button> : null}
                {source.url === null ? null : <><Button aria-label={`${revealed ? "Hide" : "Reveal"} ${label} URL`} variant="default" onClick={() => onToggleReveal(source)} type="button">{revealed ? "Hide" : "Reveal"}</Button><Button aria-label={`Copy ${label} URL`} variant="default" onClick={() => onCopy(source)} type="button">Copy</Button></>}
                {source.copyableUrlStatus !== "create-required" ? <Button aria-label={`Regenerate ${label} URL`} color="red" disabled={busy} onClick={() => onRegenerate(source)} type="button">Regenerate</Button> : null}
            </>} />
          );
        })}
      </div>
    </BrowserSourcesPanel>
  );
}

function NameDialog({ busy, error, onDismissError, draft, onCancel, onChange, onSubmit, state }: { readonly error: ActionableManagementError | null; readonly onDismissError: () => void; readonly busy: boolean; readonly draft: string; readonly onCancel: () => void; readonly onChange: (value: string) => void; readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void; readonly state: NameDialogState | null }) {
  const title = state?.action === "create" ? "Create alert set" : state?.action === "rename" ? "Rename alert set" : "Duplicate alert set";
  return <ModalSurface pending={busy} labelledBy="alert-set-name-dialog-title" onCancel={onCancel} open={state !== null}><form className="alert-sets-page__modal" onSubmit={onSubmit}>{error === null ? null : <ManagementErrorToast error={error} onDismiss={onDismissError} />}<div><ManagementModalTitle>{title}</ManagementModalTitle><p>Saving does not change which alert set is active.</p></div><TextInput label="Alert set name" autoComplete="off" autoFocus maxLength={120} onChange={(event) => onChange(event.currentTarget.value)} required withAsterisk={false} value={draft} /><div className="management-modal__actions"><Button variant="default" disabled={busy} onClick={onCancel} type="button">Cancel</Button><Button disabled={busy || draft.trim() === ""} type="submit">{state?.action === "duplicate" ? "Duplicate" : "Save"}</Button></div></form></ModalSurface>;
}

function CreateAlertDialog({ busy, error, eventType, eventTypeLocked, loadTwitchCustomRewards, name, onCancel, onEventType, onName, onRewardSelection, onSubmit, open, overlapAlertNames, rewardSelection }: {
  readonly busy: boolean;
  readonly error: ActionableManagementError | null;
  readonly eventType: StreamEventType;
  readonly eventTypeLocked: boolean;
  readonly loadTwitchCustomRewards: () => ReturnType<AlertSetsPageApi["getTwitchCustomRewards"]>;
  readonly name: string;
  readonly onCancel: () => void;
  readonly onEventType: (eventType: StreamEventType) => void;
  readonly onName: (name: string) => void;
  readonly onRewardSelection: (selection: ChannelPointRewardSelection) => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly open: boolean;
  readonly overlapAlertNames: readonly string[];
  readonly rewardSelection: ChannelPointRewardSelection;
}) {
  const groups = [...new Set(alertStarterTemplates.map((candidate) => candidate.group))];
  const rewardSelectionInvalid = eventType === "channel_point_redemption"
    && rewardSelection.mode === "selected"
    && rewardSelection.rewardIds.length === 0;
  return (
    <ModalSurface pending={busy} labelledBy="alert-create-dialog-title" onCancel={onCancel} open={open}>
      <form className="alert-sets-page__modal" onSubmit={onSubmit}>
        <div>
          <ManagementModalTitle>Add alert</ManagementModalTitle>
          <p>The alert starts empty and disabled. Add its content, then review both target profiles in the editor before enabling it.</p>
        </div>
        {error === null ? null : <ManagementErrorBanner error={error} />}
        <NativeSelect label="Event type" autoFocus={!eventTypeLocked} disabled={eventTypeLocked || busy} onChange={(event) => onEventType(event.currentTarget.value as StreamEventType)} value={eventType}>
            {groups.map((group) => (
              <optgroup key={group} label={group}>
                {alertStarterTemplates.filter((candidate) => candidate.group === group).map((candidate) => <option key={candidate.eventType} value={candidate.eventType}>{candidate.label}</option>)}
              </optgroup>
            ))}
        </NativeSelect>
        <TextInput label="Alert name" autoComplete="off" autoFocus={eventTypeLocked} disabled={busy} maxLength={120} onChange={(event) => onName(event.currentTarget.value)} required withAsterisk={false} value={name} />
        {eventType === "channel_point_redemption" ? (
          <TwitchRewardPicker
            disabled={busy}
            loadRewards={loadTwitchCustomRewards}
            onChange={onRewardSelection}
            overlapAlertNames={overlapAlertNames}
            selection={rewardSelection}
          />
        ) : null}
        <div className="management-modal__actions">
          <Button variant="default" disabled={busy} onClick={onCancel} type="button">Cancel</Button>
          <Button disabled={busy || name.trim() === "" || rewardSelectionInvalid} type="submit">{busy ? "Creating..." : "Create alert"}</Button>
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
    <ModalSurface pending={busy} labelledBy="alert-variation-dialog-title" onCancel={onCancel} open={alert !== null}>
      <form className="alert-sets-page__modal" onSubmit={onSubmit}>
        <div>
          <ManagementModalTitle>Add variation to {alert?.name}</ManagementModalTitle>
          <p>The variation copies the default design and starts disabled until reviewed.</p>
        </div>
        {error === null ? null : <ManagementErrorBanner error={error} />}
        <TextInput label="Variation name" autoComplete="off" autoFocus maxLength={120} onChange={(event) => onName(event.currentTarget.value)} required withAsterisk={false} value={name} />
        <div className="management-modal__actions">
          <Button variant="default" disabled={busy} onClick={onCancel} type="button">Cancel</Button>
          <Button disabled={busy || name.trim() === ""} type="submit">Create variation</Button>
        </div>
      </form>
    </ModalSurface>
  );
}

function ActivationDialog({ busy, error, impact, onCancel, onConfirm, set }: { readonly error: ActionableManagementError | null; readonly busy: boolean; readonly impact: AlertSetActivationImpact | null; readonly onCancel: () => void; readonly onConfirm: () => void; readonly set: AlertSetOverview | null }) {
  return <ModalSurface pending={busy} labelledBy="alert-set-activation-title" onCancel={onCancel} open={set !== null && impact !== null}><div className="alert-sets-page__modal">{error === null ? null : <ManagementErrorBanner error={error} />}<div><ManagementModalTitle>Activate {set?.name}?</ManagementModalTitle><p>{impact?.replacingActiveSetName === null ? "This set will receive live events." : `${impact?.replacingActiveSetName} will become inactive. Saved configuration will not be deleted.`}</p></div><ImpactFacts impact={impact} />{(impact?.blockers.length ?? 0) > 0 ? <IssueGroup heading="Resolve before activation" issues={impact?.blockers ?? []} /> : null}{(impact?.warnings.length ?? 0) > 0 ? <IssueGroup heading="Review before activation" issues={impact?.warnings ?? []} /> : null}<div className="management-modal__actions"><Button variant="default" disabled={busy} onClick={onCancel} type="button">Cancel</Button><Button disabled={busy || (impact?.blockers.length ?? 0) > 0} onClick={onConfirm} type="button">{(impact?.warnings.length ?? 0) > 0 ? "Activate with warnings" : "Activate"}</Button></div></div></ModalSurface>;
}

function ImpactFacts({ impact }: { readonly impact: AlertSetActivationImpact | null }) {
  if (impact === null) return null;
  return <dl className="alert-sets-page__facts"><div><dt>Enabled alerts</dt><dd>{impact.enabledAlertCount}</dd></div><div><dt>Profiles</dt><dd>{impact.affectedTargetProfileIds.map(formatProfile).join(", ") || "None"}</dd></div><div><dt>Event types</dt><dd>{impact.affectedEventTypes.map(formatEventType).join(", ") || "None"}</dd></div></dl>;
}

function IssueGroup({ heading, issues }: { readonly heading: string; readonly issues: readonly AlertValidationIssue[] }) {
  return <section className="alert-sets-page__modal-issues"><h3>{heading}</h3><ul>{issues.map((issue) => <li key={issue.id}><strong>{issue.message}</strong><span>{issue.nextStep}</span></li>)}</ul></section>;
}

function PreviewDialog({ alert, onCancel }: { readonly alert: AlertInventoryRow | null; readonly onCancel: () => void }) {
  return <ModalSurface labelledBy="alert-preview-title" onCancel={onCancel} open={alert !== null}><div className="alert-sets-page__modal"><div><span className="alert-sets-page__eyebrow">Text-only sample</span><ManagementModalTitle>Sample message for {alert?.name}</ManagementModalTitle></div><div className="alert-sets-page__preview"><span>{alert?.previewText}</span></div><p>This is sample text, not the rendered alert design. Template variables may remain unresolved. It does not send a test or play media.</p><div className="management-modal__actions"><Button onClick={onCancel} type="button">Close</Button></div></div></ModalSurface>;
}

function DeleteDialog({ busy, error, onCancel, onConfirm, set }: { readonly error: ActionableManagementError | null; readonly busy: boolean; readonly onCancel: () => void; readonly onConfirm: () => void; readonly set: AlertSetOverview | null }) {
  return <ModalSurface pending={busy} labelledBy="delete-alert-set-title" onCancel={onCancel} open={set !== null}><div className="alert-sets-page__modal">{error === null ? null : <ManagementErrorBanner error={error} />}<div><ManagementModalTitle>Delete {set?.name}?</ManagementModalTitle><p>This permanently deletes the set and its alerts. Assets used elsewhere remain available.</p></div><div className="management-modal__actions"><Button variant="default" disabled={busy} onClick={onCancel} type="button">Cancel</Button><Button color="red" disabled={busy} onClick={onConfirm} type="button">Delete alert set</Button></div></div></ModalSurface>;
}

function AlertMutationDialog({ busy, error, onCancel, onConfirm, state }: {
  readonly error: ActionableManagementError | null; readonly busy: boolean;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
  readonly state: AlertMutationDialogState | null;
}) {
  const reset = state?.action === "reset";
  const title = reset ? `Reset ${state?.alert.name}?` : `Delete ${state?.alert.name}?`;
  return (
    <ModalSurface pending={busy} labelledBy="alert-mutation-dialog-title" onCancel={onCancel} open={state !== null}>
      <div className="alert-sets-page__modal">
        {error === null ? null : <ManagementErrorBanner error={error} />}
        <div>
          <ManagementModalTitle>{title}</ManagementModalTitle>
          <p>{reset
            ? "The saved design and matching controls will return to the event default. The alert will be disabled and require review."
            : state?.alert.kind === "default"
              ? "This permanently deletes the default alert and all of its variations. Shared assets remain available."
              : "This permanently deletes only this variation. Shared assets remain available."}</p>
          {state?.alert.enabled ? <p><strong>Live impact:</strong> This alert is enabled in the selected set. Confirming can change live output immediately.</p> : null}
        </div>
        <div className="management-modal__actions">
          <Button variant="default" disabled={busy} onClick={onCancel} type="button">Cancel</Button>
          <Button {...(reset ? {} : { color: "red" })} disabled={busy} onClick={onConfirm} type="button">{reset ? "Reset alert" : "Delete alert"}</Button>
        </div>
      </div>
    </ModalSurface>
  );
}

function eventGroupButtonId(key: string): string {
  return `alert-event-toggle-${domId(key)}`;
}

function eventGroupContentId(key: string): string {
  return `alert-event-content-${domId(key)}`;
}

function alertRowFocusId(alertId: string): string {
  return `alert-row-focus-${domId(alertId)}`;
}

function domId(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/gu, "-");
}

function eventStatusLabel(status: AlertEventGroup["status"]): string {
  return status === "needs-review" ? "Needs review" : `${status[0]?.toUpperCase() ?? ""}${status.slice(1)}`;
}

function focusTargetAfterDelete(
  groups: readonly AlertEventGroup[],
  alert: AlertInventoryRow
): { readonly alertId: string | null; readonly groupKey: string } {
  const group = groups.find(({ eventType }) => eventType === alert.eventType);
  const groupKey = group?.key ?? `event:${alert.eventType}`;
  if (group === undefined) return { alertId: null, groupKey };
  const siblings = alert.kind === "default"
    ? group.defaults.map(({ alert: candidate }) => candidate)
    : group.defaults.find(({ alert: candidate }) => candidate.id === alert.parentAlertId)?.variations
      ?? group.orphanVariations;
  const index = siblings.findIndex(({ id }) => id === alert.id);
  return {
    alertId: siblings[index + 1]?.id ?? siblings[index - 1]?.id ?? null,
    groupKey
  };
}

function outputRequest(source: AlertBrowserSourceView) {
  return { overlayId: "default", scope: "module" as const, moduleId: "alerts", purpose: source.purpose, targetProfileId: source.targetProfileId };
}

function maskRouteKey(url: string): string {
  return url.replace(/(\/(?:live|test)\/)[^?]+/u, "$1********");
}

function formatEventType(value: string): string {
  return formatEventLabel(value);
}

function formatProvider(value: string): string {
  return value === "streamerbot" ? "Streamer.bot" : value === "speakerbot" ? "Speaker.bot" : value === "browser-speech" ? "Browser Speech" : "Twitch";
}

function formatProfile(value: "landscape" | "vertical"): string {
  return value === "landscape" ? "Landscape" : "Vertical";
}

function toActionableError(summary: string, cause: unknown, nextStep: string): ActionableManagementError {
  // Legacy alert clients may carry the server reference in their message.
  const legacyReference = cause instanceof Error ? /\b(?:ref|err)[_-][A-Za-z0-9_-]+\b/u.exec(cause.message)?.[0] : undefined;
  const contextualCause = cause instanceof Error && legacyReference !== undefined && !("referenceId" in cause)
    ? Object.assign(new Error(cause.message), cause, { referenceId: legacyReference }) : cause;
  return actionableError(contextualCause, summary, nextStep);
}
