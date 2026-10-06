import { Button, Checkbox, Fieldset, Group, Table, NativeSelect, TextInput } from "@mantine/core";
import { SectionHeading } from "../foundation/ModulePageLayout.js";
import type {
  ActionableManagementError,
  ProviderActivationImpact,
  ProviderCapability,
  ProviderKind,
  ProviderLiveStatus,
  ProviderSetupInput,
  ProviderValidationResult,
  RegisteredProviderDetail,
  RegisteredProviderView,
  StreamerBotSubscriptionCatalog,
  StreamerBotSubscriptionSelection,
  TtsProviderSafetySettings
} from "@stream-jams/core";
import { providerSetupInputSchema } from "@stream-jams/core";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ManagementErrorBanner } from "../foundation/ManagementErrorBanner.js";
import { ManagementErrorToast, ManagementToast, type ManagementToastNotice } from "../foundation/ManagementToast.js";
import { DirtyNavigationDialog } from "../foundation/DirtyNavigationDialog.js";
import { ManagementModalSurface as ModalSurface, ManagementModalTitle } from "../foundation/ManagementModalSurface.js";
import { StatusBadge, type StatusBadgeTone } from "../foundation/StatusBadge.js";
import { formatCount, formatDateTime } from "../foundation/formatters.js";
import type { ManagementApi, TwitchConnectionStatusView } from "../management-api.js";
import { useDirtyNavigationSource, type DirtyNavigationSaveResult } from "../navigation/dirty-navigation.js";
import "./provider-pages.css";

export type ProviderPageApi = Pick<
  ManagementApi,
  | "listRegisteredProviders"
  | "validateProvider"
  | "registerProvider"
  | "getProvider"
  | "getStreamerBotSubscriptions"
  | "updateStreamerBotSubscriptions"
  | "activateProvider"
  | "deactivateProvider"
  | "getProviderActivationImpact"
  | "getTtsProviderSafetySettings"
  | "updateTtsSafety"
  | "testProviderVoice"
  | "getTwitchStatus"
  | "startTwitchAuth"
  | "pollTwitchAuth"
>;

interface ProviderPageProps {
  readonly capability: ProviderCapability;
  readonly initialProviderId?: string | undefined;
  readonly managementApi: ProviderPageApi;
  readonly openSetupOnLoad?: boolean | undefined;
}

interface SetupDraft {
  readonly kind: ProviderKind;
  readonly name: string;
  readonly protocol: "ws" | "wss";
  readonly host: string;
  readonly port: number;
  readonly endpoint: string;
  readonly credential: string;
  readonly allowUnauthenticatedLocalConnection: boolean;
}

interface TwitchAuthorizationViewState {
  readonly authorizationId: string;
  readonly verificationUri: string;
  readonly userCode: string;
  readonly expiresAt: string;
  readonly intervalSeconds: number;
}

type PendingProviderAction =
  | { readonly kind: "activate"; readonly provider: RegisteredProviderView; readonly impact: ProviderActivationImpact }
  | { readonly kind: "deactivate"; readonly provider: RegisteredProviderView; readonly impact: null };

const safeVoiceTestText = "Stream Jams voice test. Your text to speech provider is ready.";

export function ProviderPage({
  capability,
  initialProviderId,
  managementApi,
  openSetupOnLoad = false
}: ProviderPageProps) {
  const copy = capability === "event-source"
    ? { title: "Event sources", add: "Add event source", empty: "No event sources registered.", emptyDetail: "An event source such as Twitch or Streamer.bot delivers follows, subscriptions and other stream events to your alerts, Screen Effects and Timers." }
    : { title: "TTS providers", add: "Add TTS provider", empty: "No TTS providers registered.", emptyDetail: "A text-to-speech provider reads alert messages aloud. Add one before enabling TTS layers in alerts." };
  const [providers, setProviders] = useState<readonly RegisteredProviderView[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [detail, setDetail] = useState<RegisteredProviderDetail | null>(null);
  const [impact, setImpact] = useState<ProviderActivationImpact | null>(null);
  const [safety, setSafety] = useState<TtsProviderSafetySettings | null>(null);
  const [savedSafety, setSavedSafety] = useState<TtsProviderSafetySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<ActionableManagementError | null>(null);
  const [refreshError, setRefreshError] = useState<ActionableManagementError | null>(null);
  const [operationError, setOperationError] = useState<ActionableManagementError | null>(null);
  const [notice, setNotice] = useState<ManagementToastNotice | null>(null);
  const [setupOpen, setSetupOpen] = useState(openSetupOnLoad);
  const [reconnectProvider, setReconnectProvider] = useState<RegisteredProviderView | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingProviderAction | null>(null);
  const [actionLoadingProviderId, setActionLoadingProviderId] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [pendingProviderId, setPendingProviderId] = useState<string | null>(null);
  const [selectionError, setSelectionError] = useState<string | ActionableManagementError | null>(null);
  const safetySavePending = useRef(false);
  const [safetyBusy, setSafetyBusy] = useState(false);

  const loadProviders = useCallback(async (preferredProviderId?: string) => {
    const loaded = await managementApi.listRegisteredProviders(capability);
    setProviders(loaded);
    setSelectedProviderId((current) => {
      const preferred = preferredProviderId ?? current;
      return loaded.find((provider) => provider.id === preferred)?.id ?? loaded.find((provider) => provider.active)?.id ?? loaded[0]?.id ?? null;
    });
    setPageError(null);
    setLoading(false);
  }, [capability, managementApi]);

  useEffect(() => {
    let cancelled = false;
    void managementApi
      .listRegisteredProviders(capability)
      .then((loaded) => {
        if (!cancelled) {
          setProviders(loaded);
          setSelectedProviderId(
            loaded.find((provider) => provider.id === initialProviderId)?.id
              ?? loaded.find((provider) => provider.active)?.id
              ?? loaded[0]?.id
              ?? null
          );
          setPageError(null);
          setLoading(false);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setPageError(actionableError(error, `Unable to load ${copy.title.toLowerCase()}`, "Confirm the local service is running, then reload this page."));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [capability, copy.title, initialProviderId, managementApi]);

  useEffect(() => {
    if (capability !== "event-source") return;
    let cancelled = false;
    let refreshing = false;
    const refresh = async () => {
      if (refreshing) return;
      refreshing = true;
      try {
        const loaded = await managementApi.listRegisteredProviders("event-source");
        if (cancelled) return;
        setProviders(loaded);
        setSelectedProviderId((current) =>
          loaded.find((provider) => provider.id === current)?.id
            ?? loaded.find((provider) => provider.active)?.id
            ?? loaded[0]?.id
            ?? null
        );
        setDetail((current) => {
          if (current === null) return null;
          const provider = loaded.find((candidate) => candidate.id === current.provider.id);
          return provider === undefined ? current : { ...current, provider };
        });
        setRefreshError(null);
      } catch (error) {
        if (!cancelled) {
          setRefreshError(actionableError(
            error,
            "Unable to refresh live status",
            "Check the local service and Diagnostics. Live status will retry automatically."
          ));
        }
      } finally {
        refreshing = false;
      }
    };
    const interval = window.setInterval(() => void refresh(), 5_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [capability, managementApi]);

  useEffect(() => {
    if (openSetupOnLoad) setSetupOpen(true);
  }, [openSetupOnLoad]);

  const selectedProvider = useMemo(
    () => providers.find((provider) => provider.id === selectedProviderId) ?? null,
    [providers, selectedProviderId]
  );

  useEffect(() => {
    if (selectedProviderId === null) {
      setDetail(null);
      setImpact(null);
      setSafety(null);
      setSavedSafety(null);
      return;
    }
    let cancelled = false;
    const detailRequest = managementApi.getProvider(selectedProviderId);
    const impactRequest = selectedProvider?.active !== false
      ? Promise.resolve<ProviderActivationImpact | null>(null)
      : managementApi.getProviderActivationImpact(selectedProviderId);
    const safetyRequest = capability === "tts"
      ? managementApi.getTtsProviderSafetySettings(selectedProviderId)
      : Promise.resolve<TtsProviderSafetySettings | null>(null);
    void Promise.all([detailRequest, impactRequest, safetyRequest])
      .then(([loadedDetail, loadedImpact, loadedSafety]) => {
        if (!cancelled) {
          setDetail(loadedDetail);
          setImpact(loadedImpact);
          setSafety(loadedSafety);
          setSavedSafety(loadedSafety);
          setOperationError(null);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setDetail(null);
          setImpact(null);
          setSafety(null);
          setSavedSafety(null);
          setOperationError(actionableError(error, "Unable to load provider details", "Select the provider again or retry after checking Diagnostics."));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [capability, managementApi, selectedProvider?.active, selectedProviderId]);

  async function requestActivation(provider: RegisteredProviderView) {
    setActionLoadingProviderId(provider.id);
    setOperationError(null);
    setNotice(null);
    try {
      const nextImpact = await managementApi.getProviderActivationImpact(provider.id);
      setPendingAction({ kind: "activate", provider, impact: nextImpact });
    } catch (error) {
      setOperationError(actionableError(error, "Unable to review provider activation", "Select the provider, review its connection state, then retry activation."));
    } finally {
      setActionLoadingProviderId(null);
    }
  }

  function requestDeactivation(provider: RegisteredProviderView) {
    setOperationError(null);
    setNotice(null);
    setPendingAction({ kind: "deactivate", provider, impact: null });
  }

  async function confirmProviderAction() {
    if (pendingAction === null) return;
    setActionBusy(true);
    setNotice(null);
    try {
      if (pendingAction.kind === "activate") {
        await managementApi.activateProvider(pendingAction.provider.id, true);
      } else {
        await managementApi.deactivateProvider(pendingAction.provider.id);
      }
      await loadProviders(pendingAction.provider.id);
      setOperationError(null);
      setNotice({ tone: "success", message: `${pendingAction.provider.name} is ${pendingAction.kind === "activate" ? "active" : "inactive"}.` });
      setPendingAction(null);
    } catch (error) {
      const activating = pendingAction.kind === "activate";
      setPendingAction(null);
      setOperationError(actionableError(
        error,
        `Unable to ${activating ? "activate" : "deactivate"} provider`,
        activating
          ? "Review activation impact and resolve blockers before retrying."
          : "Confirm the provider still exists and is active, then retry deactivation."
      ));
    } finally {
      setActionBusy(false);
    }
  }

  const persistSafety = useCallback(async (navigation = false): Promise<DirtyNavigationSaveResult> => {
    if (selectedProvider === null || safety === null || safetySavePending.current) {
      return false;
    }
    safetySavePending.current = true;
    setSafetyBusy(true);
    setNotice(null);
    setOperationError(null);
    try {
      const saved = await managementApi.updateTtsSafety(selectedProvider.id, safety);
      setSafety(saved);
      setSavedSafety(saved);
      setOperationError(null);
      setNotice({ tone: "success", message: "TTS safety settings saved." });
      return true;
    } catch (error) {
      const failure = actionableError(error, "Unable to save TTS safety settings", "Review each safety value, then retry the save.");
      if (!navigation) setOperationError(failure);
      return { saved: false, error: failure };
    } finally {
      safetySavePending.current = false;
      setSafetyBusy(false);
    }
  }, [managementApi, safety, selectedProvider]);
  const saveSafetyBeforeNavigation = useCallback(() => persistSafety(true), [persistSafety]);

  const discardSafety = useCallback(() => {
    setSafety(savedSafety);
  }, [savedSafety]);

  const safetyDirty = safety !== null && savedSafety !== null && JSON.stringify(safety) !== JSON.stringify(savedSafety);
  useDirtyNavigationSource({
    id: "tts-provider-safety",
    dirty: safetyDirty,
    summary: "TTS safety settings have unsaved changes.",
    save: saveSafetyBeforeNavigation,
    discard: discardSafety
  });

  function saveSafety(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void persistSafety();
  }

  function requestProviderSelection(providerId: string) {
    if (safetySavePending.current) return;
    if (providerId === selectedProviderId) return;
    if (safetyDirty) {
      setSelectionError(null);
      setPendingProviderId(providerId);
      return;
    }
    setSelectedProviderId(providerId);
  }

  async function saveAndContinueSelection() {
    if (pendingProviderId === null || safetySavePending.current) return;
    setSelectionError(null);
    const result = await saveSafetyBeforeNavigation();
    if (result !== true) {
      setSelectionError(typeof result === "object" ? result.error : "TTS safety settings were not saved. Review each safety value, then retry the save.");
      return;
    }
    setSelectedProviderId(pendingProviderId);
    setPendingProviderId(null);
  }

  function discardAndContinueSelection() {
    if (pendingProviderId === null || safetySavePending.current) return;
    discardSafety();
    setSelectedProviderId(pendingProviderId);
    setPendingProviderId(null);
    setSelectionError(null);
  }

  async function testVoice() {
    if (selectedProvider === null) {
      return;
    }
    setNotice(null);
    try {
      const result = await managementApi.testProviderVoice(selectedProvider.id);
      if (!result.delivered) {
        setOperationError(result.error ?? actionableError(null, "Voice test was not delivered", "Confirm the provider is connected, then retry the voice test."));
        return;
      }
      setOperationError(null);
      setNotice({ tone: "success", message: "Voice test delivered." });
    } catch (error) {
      setOperationError(actionableError(error, "Unable to test provider voice", "Confirm the provider is connected and its output is available, then retry."));
    }
  }

  return (
    <div className="provider-page">
      <Group gap="sm" wrap="wrap">
        <Button onClick={() => { setReconnectProvider(null); setSetupOpen(true); }} type="button">{copy.add}</Button>
      </Group>

      {pageError === null ? null : <ManagementErrorBanner error={pageError} />}
      {refreshError === null ? null : <ManagementErrorBanner error={refreshError} />}
      {operationError === null ? null : <ManagementErrorToast error={operationError} onDismiss={() => setOperationError(null)} />}
      {notice === null ? null : <ManagementToast notice={notice} onDismiss={() => setNotice(null)} />}

      {loading ? <p className="provider-page__empty" role="status">Loading providers...</p> : null}
      {!loading && pageError === null && providers.length === 0 ? <div className="provider-page__empty"><p><strong>{copy.empty}</strong></p><p>{copy.emptyDetail}</p></div> : null}
      {providers.length > 0 ? (
        <div className="provider-page__workspace">
          <div className="provider-page__table-wrap">
            <Table className="provider-page__table">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th scope="col">Provider</Table.Th>
                  {capability === "event-source" ? (
                    <>
                      <Table.Th scope="col">Usage</Table.Th>
                      <Table.Th scope="col">Live status</Table.Th>
                    </>
                  ) : (
                    <>
                      <Table.Th scope="col">Connection</Table.Th>
                      <Table.Th scope="col">Used by alerts</Table.Th>
                      <Table.Th scope="col">Runtime</Table.Th>
                    </>
                  )}
                  {capability === "event-source" ? <Table.Th scope="col">Actions</Table.Th> : null}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {providers.map((provider) => (
                  <Table.Tr
                    className={provider.id === selectedProviderId ? "provider-page__selected-row" : undefined}
                    key={provider.id}
                    onClick={() => requestProviderSelection(provider.id)}
                  >
                    <Table.Th data-label="Provider" scope="row">
                      <Button variant="subtle"
                        aria-label={`Select ${provider.name}`}
                        aria-pressed={provider.id === selectedProviderId}
                        className="provider-page__provider-select"
                        onClick={(event) => {
                          event.stopPropagation();
                          requestProviderSelection(provider.id);
                        }}
                        type="button"
                      >
                        <span>{provider.name}</span>
                        <small>{formatProviderKind(provider.kind)}</small>
                        {provider.twitchAuthorization?.authorizationState === "update-required" ? <small>Authorization update required</small> : null}
                      </Button>
                    </Table.Th>
                    {capability === "event-source" ? (
                      <>
                        <Table.Td data-label="Usage"><StatusBadge label={provider.active ? "In use" : "Not in use"} tone={provider.active ? "positive" : "neutral"} /></Table.Td>
                        <Table.Td data-label="Live status"><StatusBadge label={formatLiveStatus(eventSourceLiveStatus(provider))} tone={liveStatusTone(eventSourceLiveStatus(provider))} /></Table.Td>
                      </>
                    ) : (
                      <>
                        <Table.Td data-label="Connection"><StatusBadge label={formatState(provider.connectionState)} tone={connectionTone(provider.connectionState)} /></Table.Td>
                        <Table.Td data-label="Used by alerts">{provider.usedByAlertCount}</Table.Td>
                        <Table.Td data-label="Runtime"><StatusBadge label={provider.active ? "Active" : "Inactive"} tone={provider.active ? "positive" : "neutral"} /></Table.Td>
                      </>
                    )}
                    {capability === "event-source" ? (
                      <Table.Td data-label="Actions">
                        <Button
                          aria-label={`${provider.active ? "Deactivate" : "Activate"} ${provider.name}`}
                          variant="default"
                          disabled={actionLoadingProviderId === provider.id}
                          onClick={(event) => {
                            event.stopPropagation();
                            if (provider.active) requestDeactivation(provider);
                            else void requestActivation(provider);
                          }}
                          type="button"
                        >
                          {actionLoadingProviderId === provider.id ? "Checking..." : provider.active ? "Deactivate" : "Activate"}
                        </Button>
                      </Table.Td>
                    ) : null}
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </div>

          {detail === null ? <p className="provider-page__empty provider-page__detail">Loading provider details...</p> : (
            <ProviderDetail
              capability={capability}
              detail={detail}
              impact={impact}
              managementApi={managementApi}
              onActivate={capability === "tts" && selectedProvider !== null ? () => void requestActivation(selectedProvider) : null}
              onReconnect={capability === "event-source" && detail.provider.kind === "twitch" && (
                eventSourceLiveStatus(detail.provider) === "error"
                || detail.provider.twitchAuthorization?.authorizationState === "update-required"
              )
                ? () => setReconnectProvider(detail.provider)
                : null}
              onSafetyChange={setSafety}
              onSafetySubmit={saveSafety}
              onTestVoice={() => void testVoice()}
              safety={safety}
              safetyDirty={safetyDirty}
              safetyBusy={safetyBusy}
            />
          )}
        </div>
      ) : null}

      <DirtyNavigationDialog
        error={selectionError}
        onDismissError={() => setSelectionError(null)}
        onCancel={() => { if (safetySavePending.current) return; setPendingProviderId(null); setSelectionError(null); }}
        onDiscard={discardAndContinueSelection}
        onSave={() => void saveAndContinueSelection()}
        open={pendingProviderId !== null}
        pending={safetyBusy}
        saveAvailable
        saveLabel="Save and continue"
        summary="TTS safety settings have unsaved changes."
        title="Switch providers with unsaved changes?"
      />

      <ProviderSetupWizard
        capability={capability}
        managementApi={managementApi}
        onCancel={() => { setSetupOpen(false); setReconnectProvider(null); }}
        onReconnected={async (providerId, providerName) => {
          await loadProviders(providerId);
          setReconnectProvider(null);
          setOperationError(null);
          setNotice({ tone: "success", message: `${providerName} reconnected. Live status is updating.` });
        }}
        onRegistered={async (providerId, providerName, active) => {
          await loadProviders(providerId);
          setSetupOpen(false);
          setReconnectProvider(null);
          setOperationError(null);
          setNotice(active
            ? { tone: "success", message: `${providerName} registered and active.` }
            : {
                tone: "warning",
                message: `${providerName} registered but inactive.`,
                detail: `Set it active when you are ready to switch ${capability === "event-source" ? "event intake" : "text-to-speech output"}.`
              });
        }}
        open={setupOpen || reconnectProvider !== null}
        reconnectProvider={reconnectProvider}
      />

      <ModalSurface labelledBy="provider-action-title" onCancel={() => { if (!actionBusy) setPendingAction(null); }} open={pendingAction !== null}>
        <div className="provider-page__modal-content">
          <ManagementModalTitle>
            {pendingAction?.kind === "deactivate" ? "Deactivate" : "Activate"} {pendingAction?.provider.name ?? "provider"}?
          </ManagementModalTitle>
          {pendingAction?.kind === "deactivate" ? (
            <>
              <p>Live event intake will stop for {pendingAction.provider.name}. Provider settings and alert mappings will remain saved, and the provider connection can remain connected.</p>
              <p>Activate this or another event source to resume intake.</p>
              <p>
                {formatCount(pendingAction.provider.usedByAlertCount, { one: "alert uses", other: "alerts use" })} this provider type.
              </p>
            </>
          ) : (
            <>
              <p>
                {capability === "event-source"
                  ? providers.some((provider) => provider.active)
                    ? `${providers.find((provider) => provider.active)?.name} will become inactive. Saved configuration will not be deleted.`
                    : `${pendingAction?.provider.name ?? "This event source"} will become the active event source. Saved configuration will not be deleted.`
                  : "This provider will handle text-to-speech output. The current active provider will become inactive."}
              </p>
              <p>{formatActivationImpactSummary(pendingAction?.impact.matchedAlertCount ?? 0, pendingAction?.impact.unmatchedAlertCount ?? 0)}.</p>
              <div className="provider-page__errors">
                {[...(pendingAction?.impact.blockers ?? []), ...(pendingAction?.impact.warnings ?? [])].map((item, index) => (
                  <ManagementErrorBanner error={item} key={item.referenceId ?? `${item.summary}-${index}`} />
                ))}
              </div>
            </>
          )}
          <div className="provider-page__actions">
            <Button variant="default" disabled={actionBusy} onClick={() => setPendingAction(null)} type="button">Cancel</Button>
            <Button
              color={pendingAction?.kind === "deactivate" ? "red" : "teal"}
              disabled={actionBusy || (pendingAction?.impact?.blockers.length ?? 0) > 0}
              onClick={() => void confirmProviderAction()}
              type="button"
            >
              {pendingAction?.kind === "deactivate"
                ? "Deactivate event source"
                : capability === "event-source" ? "Activate event source" : "Activate TTS provider"}
            </Button>
          </div>
        </div>
      </ModalSurface>
    </div>
  );
}

function ProviderDetail({
  capability,
  detail,
  impact,
  managementApi,
  onActivate,
  onReconnect,
  onSafetyChange,
  onSafetySubmit,
  onTestVoice,
  safety,
  safetyDirty,
  safetyBusy
}: {
  readonly capability: ProviderCapability;
  readonly detail: RegisteredProviderDetail;
  readonly impact: ProviderActivationImpact | null;
  readonly managementApi: ProviderPageApi;
  readonly onActivate: (() => void) | null;
  readonly onReconnect: (() => void) | null;
  readonly onSafetyChange: (safety: TtsProviderSafetySettings) => void;
  readonly onSafetySubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly onTestVoice: () => void;
  readonly safety: TtsProviderSafetySettings | null;
  readonly safetyDirty: boolean;
  readonly safetyBusy: boolean;
}) {
  const provider = detail.provider;
  const speakerBotVoiceMissing = provider.kind === "speakerbot" && (safety?.defaultVoiceId?.trim() ?? "") === "";
  const voiceTestDisabled = speakerBotVoiceMissing || (provider.kind === "speakerbot" && safetyDirty);
  return (
    <section aria-labelledby="provider-detail-title" className="provider-page__detail">
      <SectionHeading id="provider-detail-title" level={3} title={provider.name} description={formatProviderKind(provider.kind)} summary={<StatusBadge
          label={capability === "event-source" ? provider.active ? "In use" : "Not in use" : provider.active ? "Active" : "Inactive"}
          tone={provider.active ? "positive" : "neutral"}
        />} />
      {provider.error === null ? null : <ManagementErrorBanner error={provider.error} />}
      {provider.twitchAuthorization?.authorizationState === "update-required" ? (
        <section aria-label="Twitch authorization status" className="provider-page__subsection">
          <h4>Authorization update required</h4>
          <p>Reconnect Twitch to enable Hype Trains, polls, and predictions.</p>
        </section>
      ) : null}
      {onReconnect === null ? null : (
        <div className="provider-page__connection-actions">
          <Button onClick={onReconnect} type="button">Reconnect Twitch</Button>
        </div>
      )}
      <dl className="provider-page__facts">
        {capability === "event-source" ? (
          <>
            <div><dt>Usage</dt><dd>{provider.active ? "In use" : "Not in use"}</dd></div>
            <div><dt>Live status</dt><dd>{formatLiveStatus(eventSourceLiveStatus(provider))}</dd></div>
            {provider.twitchAuthorization?.account === undefined || provider.twitchAuthorization.account === null ? null : (
              <div><dt>Twitch account</dt><dd>{provider.twitchAuthorization.account.displayName} (@{provider.twitchAuthorization.account.login})</dd></div>
            )}
          </>
        ) : <div><dt>Connection</dt><dd>{formatState(provider.connectionState)}</dd></div>}
        <div><dt>Last validated</dt><dd>{provider.validatedAt === null ? "Never" : formatDateTime(provider.validatedAt)}</dd></div>
        <div>
          <dt>Used by alerts</dt>
          <dd>{formatCount(provider.usedByAlertCount, { one: "alert use", other: "alert uses" })}</dd>
        </div>
      </dl>

      {provider.active ? null : (
        <section aria-labelledby="activation-impact-title" className="provider-page__subsection">
          <h4 id="activation-impact-title">Activation impact</h4>
          {impact === null ? <p role="status">Checking alert impact...</p> : (
            <>
              <p>{formatActivationImpactSummary(impact.matchedAlertCount, impact.unmatchedAlertCount)}</p>
              <div className="provider-page__errors">
                {[...impact.blockers, ...impact.warnings].map((item, index) => (
                  <ManagementErrorBanner error={item} key={item.referenceId ?? `${item.summary}-${index}`} />
                ))}
              </div>
              {onActivate === null ? null : (
                <Button disabled={impact.blockers.length > 0} onClick={onActivate} type="button">
                  {impact.blockers.length > 0 ? "Resolve blockers to activate" : "Set active"}
                </Button>
              )}
            </>
          )}
        </section>
      )}

      {capability === "event-source" && provider.kind === "streamerbot" ? (
        <StreamerBotSubscriptionEditor managementApi={managementApi} provider={provider} />
      ) : null}

      {capability === "tts" && safety !== null ? (
        <>
          <section aria-labelledby="tts-safety-title" className="provider-page__subsection">
            <h4 id="tts-safety-title">Safety defaults</h4>
            <form className="provider-page__form" onSubmit={onSafetySubmit}>
              <fieldset className="provider-page__safety-fields" disabled={safetyBusy}>
              <div>
                {detail.provider.kind === "speakerbot" && detail.availableVoices.length === 0 ? (
                  <TextInput label="Default voice alias"
                    onChange={(event) => onSafetyChange({ ...safety, defaultVoiceId: event.currentTarget.value || null })}
                    placeholder="EventVoice"
                    withAsterisk={false} required
                    value={safety.defaultVoiceId ?? ""}
                  />
                ) : (
                  <NativeSelect label={detail.provider.kind === "speakerbot" ? "Default voice alias" : "Default voice"}
                    withAsterisk={false} required={detail.provider.kind === "speakerbot"}
                    value={safety.defaultVoiceId ?? ""}
                    onChange={(event) => onSafetyChange({ ...safety, defaultVoiceId: event.currentTarget.value || null })}
                  >
                    <option value="">{detail.provider.kind === "speakerbot" ? "Select voice alias" : "Provider default"}</option>
                    {detail.availableVoices.map((voice) => <option key={voice.id} value={voice.id}>{voice.label}</option>)}
                  </NativeSelect>
                )}
              </div>
              <TextInput label="Volume (0–1)" description="1 = 100% volume; 0 = silent" max={1} min={0} onChange={(event) => onSafetyChange({ ...safety, volume: Number(event.currentTarget.value) })} withAsterisk={false} required step={0.1} type="number" value={safety.volume} />
              <div className="provider-page__rate-fields">
                <TextInput label="Minimum rate (×)" description="1× is normal speed; 0.5× is half speed; 2× is double speed." min={0.1} onChange={(event) => onSafetyChange({ ...safety, minimumRate: Number(event.currentTarget.value) })} withAsterisk={false} required step={0.1} type="number" value={safety.minimumRate} />
                <TextInput label="Maximum rate (×)" description="1× is normal speed; 0.5× is half speed; 2× is double speed." min={0.1} onChange={(event) => onSafetyChange({ ...safety, maximumRate: Number(event.currentTarget.value) })} withAsterisk={false} required step={0.1} type="number" value={safety.maximumRate} />
              </div>
              <TextInput label="Maximum text length" min={1} onChange={(event) => onSafetyChange({ ...safety, maximumTextLength: Number(event.currentTarget.value) })} withAsterisk={false} required step={1} type="number" value={safety.maximumTextLength} />
              <Button disabled={safetyBusy} type="submit">Save safety settings</Button>
              </fieldset>
            </form>
          </section>
          <section aria-labelledby="voice-test-title" className="provider-page__subsection">
            <h4 id="voice-test-title">Voice test</h4>
            <p>{safeVoiceTestText}</p>
            {speakerBotVoiceMissing ? <p>Save a default voice alias before testing Speaker.bot.</p> : null}
            {!speakerBotVoiceMissing && provider.kind === "speakerbot" && safetyDirty ? <p>Save voice settings before testing Speaker.bot.</p> : null}
            <Button disabled={voiceTestDisabled || safetyBusy} onClick={onTestVoice} type="button">Test voice</Button>
          </section>
        </>
      ) : null}
    </section>
  );
}

function StreamerBotSubscriptionEditor({
  managementApi,
  provider
}: {
  readonly managementApi: ProviderPageApi;
  readonly provider: RegisteredProviderView;
}) {
  const [catalog, setCatalog] = useState<StreamerBotSubscriptionCatalog | null>(null);
  const [selected, setSelected] = useState<readonly StreamerBotSubscriptionSelection[]>([]);
  const [savedSelected, setSavedSelected] = useState<readonly StreamerBotSubscriptionSelection[]>([]);
  const [broadcasterId, setBroadcasterId] = useState<string | null>(null);
  const [savedBroadcasterId, setSavedBroadcasterId] = useState<string | null>(null);
  const [twitchStatus, setTwitchStatus] = useState<TwitchConnectionStatusView | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<ActionableManagementError | null>(null);
  const savePending = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setCatalog(null);
    setError(null);
    setSaveError(null);
    void Promise.all([
      managementApi.getStreamerBotSubscriptions(provider.id),
      managementApi.getTwitchStatus()
    ]).then(([loadedCatalog, loadedTwitch]) => {
      if (cancelled) return;
      setCatalog(loadedCatalog);
      setSelected(loadedCatalog.selected);
      setSavedSelected(loadedCatalog.selected);
      setBroadcasterId(loadedCatalog.twitchBroadcasterId);
      setSavedBroadcasterId(loadedCatalog.twitchBroadcasterId);
      setTwitchStatus(loadedTwitch);
      setConfirmed(false);
    }).catch((cause: unknown) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : "Unable to load Streamer.bot subscriptions.");
    });
    return () => { cancelled = true; };
  }, [managementApi, provider.id]);

  const dirty = JSON.stringify(selected) !== JSON.stringify(savedSelected)
    || broadcasterId !== savedBroadcasterId;

  const persist = useCallback(async (navigation = false): Promise<DirtyNavigationSaveResult> => {
    if (savePending.current) return false;
    if (!dirty) return true;
    setError(null);
    setSaveError(null);
    if (!confirmed) {
      const instruction = "Cancel to review and confirm the live subscription impact before saving.";
      if (!navigation) setError(instruction);
      return { saved: false, error: instruction };
    }
    savePending.current = true;
    setBusy(true);
    try {
      const updated = await managementApi.updateStreamerBotSubscriptions(provider.id, {
        twitchBroadcasterId: broadcasterId,
        externalSubscriptions: selected.map((selection) => ({
          sourceKey: selection.sourceKey,
          eventTypes: [...selection.eventTypes]
        }))
      });
      setCatalog(updated);
      setSelected(updated.selected);
      setSavedSelected(updated.selected);
      setBroadcasterId(updated.twitchBroadcasterId);
      setSavedBroadcasterId(updated.twitchBroadcasterId);
      setConfirmed(false);
      return true;
    } catch (cause) {
      const failure = actionableError(cause, "Unable to update Streamer.bot subscriptions", "Review the selected source and event types, then retry saving. Cancel to review the live subscription impact.");
      if (!navigation) setSaveError(failure);
      return { saved: false, error: failure };
    } finally {
      setBusy(false);
      savePending.current = false;
    }
  }, [broadcasterId, confirmed, dirty, managementApi, provider.id, selected]);
  const saveBeforeNavigation = useCallback(() => persist(true), [persist]);

  const discard = useCallback(() => {
    setSelected(savedSelected);
    setBroadcasterId(savedBroadcasterId);
    setConfirmed(false);
    setError(null);
    setSaveError(null);
  }, [savedBroadcasterId, savedSelected]);

  useDirtyNavigationSource({
    id: `streamerbot-subscriptions-${provider.id}`,
    dirty,
    summary: "Streamer.bot event subscriptions have unsaved changes.",
    save: saveBeforeNavigation,
    discard
  });

  function toggle(sourceKey: string, eventType: string, checked: boolean) {
    setSelected((current) => {
      const existing = current.find((selection) => selection.sourceKey === sourceKey);
      const nextTypes = checked
        ? Array.from(new Set([...(existing?.eventTypes ?? []), eventType])).sort()
        : (existing?.eventTypes ?? []).filter((candidate) => candidate !== eventType);
      const withoutSource = current.filter((selection) => selection.sourceKey !== sourceKey);
      return nextTypes.length === 0
        ? withoutSource
        : [...withoutSource, { sourceKey, eventTypes: nextTypes }].sort((left, right) => left.sourceKey.localeCompare(right.sourceKey));
    });
    setConfirmed(false);
  }

  return (
    <section aria-labelledby="streamerbot-subscriptions-title" className="provider-page__subsection">
      <h4 id="streamerbot-subscriptions-title">Screen Effects event subscriptions</h4>
      <p>Select only the Streamer.bot source and event types that Screen Effects may use. Alert Twitch intake remains subscribed separately.</p>
      {error === null ? null : <p role="alert">{error}</p>}
      {saveError === null ? null : <ManagementErrorBanner error={saveError} />}
      {catalog === null && error === null ? <p>Loading Streamer.bot event catalog...</p> : null}
      {catalog?.available === false ? <p>Activate and connect this Streamer.bot provider to edit subscriptions.</p> : null}
      {catalog?.unavailableSelections.length ? (
        <p role="alert">Some saved event types are no longer advertised. Review and save this configuration.</p>
      ) : null}
      {catalog?.available ? (
        <form className="provider-page__form" onSubmit={(event) => { event.preventDefault(); void persist(); }}>
          <fieldset className="provider-page__subscription-fields" disabled={busy}>
          <NativeSelect label="Twitch reward broadcaster"
              onChange={(event) => { setBroadcasterId(event.currentTarget.value || null); setConfirmed(false); }}
              value={broadcasterId ?? ""}
            >
              <option value="">No verified Twitch reward association</option>
              {twitchStatus?.connected ? (
                <option value={twitchStatus.account.accountId}>
                  {twitchStatus.account.displayName} (@{twitchStatus.account.login})
                </option>
              ) : null}
              {broadcasterId !== null && (!twitchStatus?.connected || twitchStatus.account.accountId !== broadcasterId) ? (
                <option value={broadcasterId}>Unavailable saved broadcaster ({broadcasterId})</option>
              ) : null}
            </NativeSelect>
          <Fieldset legend="Allowed source and event types">
            {catalog.sources.map((source) => (
              <div key={source.sourceKey}>
                <strong>{source.sourceKey}</strong>
                {source.eventTypes.map((eventType) => (
                  <Checkbox key={`${source.sourceKey}:${eventType}`} label={eventType}
                      checked={selected.some((selection) =>
                        selection.sourceKey === source.sourceKey && selection.eventTypes.includes(eventType)
                      )}
                      onChange={(event) => toggle(source.sourceKey, eventType, event.currentTarget.checked)}

                    />
                ))}
              </div>
            ))}
          </Fieldset>
          {catalog.unavailableSelections.length > 0 ? (
            <Fieldset legend="Unavailable saved source and event types">
              <p>Clear entries that Streamer.bot no longer advertises, then save the configuration.</p>
              {catalog.unavailableSelections.map((selection) => (
                <div key={selection.sourceKey}>
                  <strong>{selection.sourceKey}</strong>
                  {selection.eventTypes.map((eventType) => (
                    <Checkbox key={`${selection.sourceKey}:${eventType}`} label={`${eventType} (no longer advertised)`}
                        checked={selected.some((candidate) =>
                          candidate.sourceKey === selection.sourceKey && candidate.eventTypes.includes(eventType)
                        )}
                        onChange={(event) => toggle(selection.sourceKey, eventType, event.currentTarget.checked)}

                      />
                  ))}
                </div>
              ))}
            </Fieldset>
          ) : null}
          {dirty ? (
            <Checkbox label="I understand saving changes the active Streamer.bot subscriptions immediately." checked={confirmed} onChange={(event) => setConfirmed(event.currentTarget.checked)}  />
          ) : null}
          <div className="provider-page__actions">
            <Button variant="default" disabled={!dirty || busy} onClick={discard} type="button">Discard</Button>
            <Button disabled={!dirty || !confirmed || busy} type="submit">{busy ? "Saving..." : "Save subscriptions"}</Button>
          </div>
          </fieldset>
        </form>
      ) : null}
    </section>
  );
}

function ProviderSetupWizard({
  capability,
  managementApi,
  onCancel,
  onReconnected,
  onRegistered,
  open,
  reconnectProvider
}: {
  readonly capability: ProviderCapability;
  readonly managementApi: ProviderPageApi;
  readonly onCancel: () => void;
  readonly onReconnected: (providerId: string, providerName: string) => Promise<void>;
  readonly onRegistered: (providerId: string, providerName: string, active: boolean) => Promise<void>;
  readonly open: boolean;
  readonly reconnectProvider: RegisteredProviderView | null;
}) {
  const defaultKind: ProviderKind = capability === "event-source" ? "twitch" : "speakerbot";
  const reconnecting = reconnectProvider !== null;
  const [step, setStep] = useState<"select" | "configure" | "review">("select");
  const [draft, setDraft] = useState<SetupDraft>(() => createDraft(defaultKind));
  const [validation, setValidation] = useState<ProviderValidationResult | null>(null);
  const [requestError, setRequestError] = useState<ActionableManagementError | null>(null);
  const [twitchStatus, setTwitchStatus] = useState<TwitchConnectionStatusView | null>(null);
  const [twitchAuthorization, setTwitchAuthorization] = useState<TwitchAuthorizationViewState | null>(null);
  const [twitchStatusLoading, setTwitchStatusLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const twitchPollTimeoutRef = useRef<number | null>(null);
  const twitchRequestGenerationRef = useRef(0);
  const clearTwitchPoll = useCallback(() => {
    if (twitchPollTimeoutRef.current !== null) {
      window.clearTimeout(twitchPollTimeoutRef.current);
      twitchPollTimeoutRef.current = null;
    }
  }, []);
  const invalidateTwitchRequest = useCallback(() => {
    twitchRequestGenerationRef.current += 1;
    clearTwitchPoll();
  }, [clearTwitchPoll]);

  useEffect(() => {
    if (open) {
      setStep(reconnecting ? "configure" : "select");
      setDraft(reconnecting
        ? { ...createDraft("twitch"), name: reconnectProvider.name }
        : createDraft(defaultKind));
      setValidation(null);
      setRequestError(null);
      setTwitchStatus(null);
      invalidateTwitchRequest();
      setTwitchAuthorization(null);
      setTwitchStatusLoading(false);
      setBusy(false);
    }
  }, [defaultKind, invalidateTwitchRequest, open, reconnectProvider, reconnecting]);

  useEffect(() => () => invalidateTwitchRequest(), [invalidateTwitchRequest]);

  useEffect(() => {
    if (open) headingRef.current?.focus();
  }, [open, step]);

  useEffect(() => {
    if (!open || step !== "configure" || draft.kind !== "twitch") {
      return;
    }

    let cancelled = false;
    setTwitchStatusLoading(true);
    void managementApi.getTwitchStatus()
      .then((status) => {
        if (!cancelled) {
          setTwitchStatus(status);
          setRequestError(null);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setTwitchStatus(null);
          setRequestError(actionableError(error, "Unable to check Twitch connection", "Confirm the local service is running, then retry."));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setTwitchStatusLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [draft.kind, managementApi, open, step]);

  function updateDraft(next: SetupDraft) {
    setDraft(next);
    setValidation(null);
    setRequestError(null);
  }

  function changeKind(kind: ProviderKind) {
    updateDraft(createDraft(kind));
    setTwitchStatus(null);
    invalidateTwitchRequest();
    setTwitchAuthorization(null);
  }

  async function validate() {
    setBusy(true);
    setRequestError(null);
    try {
      if (draft.kind === "twitch") {
        const status = await managementApi.getTwitchStatus();
        setTwitchStatus(status);
        if (!status.connected) {
          setValidation(null);
          setRequestError(actionableError(
            null,
            "Twitch account is not connected",
            "Choose Connect Twitch, complete authorization in Twitch, then check the connection again."
          ));
          return;
        }
      }

      const setup = providerSetupInputSchema.safeParse(toSetupInput(draft));
      if (!setup.success) {
        setValidation(null);
        setRequestError(actionableError(null, "Provider connection settings are invalid", "Use a loopback host (127.0.0.1, localhost, or ::1), a valid port, and a path-only endpoint without credentials, query strings, or fragments."));
        return;
      }
      const result = await managementApi.validateProvider(setup.data);
      setValidation(result);
      if (result.valid) {
        setStep("review");
      }
    } catch (error) {
      setValidation(null);
      setRequestError(actionableError(error, "Unable to test provider connection", "Check the connection settings and local provider service, then retry."));
    } finally {
      setBusy(false);
    }
  }

  function scheduleTwitchPoll(authorization: TwitchAuthorizationViewState, generation: number) {
    clearTwitchPoll();
    twitchPollTimeoutRef.current = window.setTimeout(() => {
      if (generation !== twitchRequestGenerationRef.current) {
        return;
      }
      void managementApi.pollTwitchAuth({ authorizationId: authorization.authorizationId })
        .then((result) => {
          if (generation !== twitchRequestGenerationRef.current) {
            return;
          }
          if (result.status === "pending") {
            scheduleTwitchPoll(authorization, generation);
            return;
          }
          clearTwitchPoll();
          if (result.status === "connected") {
            setTwitchAuthorization(null);
            setTwitchStatus(result.connection);
            setRequestError(null);
            if (reconnectProvider !== null) {
              setBusy(true);
              void onReconnected(reconnectProvider.id, reconnectProvider.name)
                .catch((error: unknown) => {
                  if (generation === twitchRequestGenerationRef.current) {
                    setRequestError(actionableError(
                      error,
                      "Unable to finish Twitch reconnection",
                      "Refresh the provider status. If it still reports an error, retry Twitch authorization."
                    ));
                  }
                })
                .finally(() => {
                  if (generation === twitchRequestGenerationRef.current) setBusy(false);
                });
            }
            return;
          }
          setRequestError({
            summary: result.code === "TWITCH_OAUTH_DENIED" ? "Twitch authorization was denied" : "Twitch authorization expired",
            cause: result.message,
            nextStep: "Choose Try again, then complete the Twitch authorization before it expires.",
            severity: "error",
            occurredAt: new Date().toISOString(),
            referenceId: null,
            correction: null
          });
        })
        .catch((error: unknown) => {
          if (generation !== twitchRequestGenerationRef.current) {
            return;
          }
          clearTwitchPoll();
          setRequestError(actionableError(error, "Unable to continue Twitch authorization", "Choose Try again to start a new Twitch authorization."));
        });
    }, authorization.intervalSeconds * 1_000);
  }

  async function startTwitchConnection() {
    invalidateTwitchRequest();
    const generation = twitchRequestGenerationRef.current;
    setTwitchAuthorization(null);
    const popup = window.open("about:blank", "stream-jams-twitch-device-auth");
    setBusy(true);
    setRequestError(null);
    try {
      const result = await managementApi.startTwitchAuth();
      if (generation !== twitchRequestGenerationRef.current) {
        popup?.close();
        return;
      }
      const authorization: TwitchAuthorizationViewState = result;
      setTwitchAuthorization(authorization);
      if (popup != null) {
        popup.location.href = authorization.verificationUri;
      }
      scheduleTwitchPoll(authorization, generation);
    } catch (error) {
      if (generation !== twitchRequestGenerationRef.current) {
        popup?.close();
        return;
      }
      popup?.close();
      setRequestError(actionableError(error, "Unable to start Twitch authorization", "Confirm Twitch credentials are configured in the local service, then retry."));
    } finally {
      if (generation === twitchRequestGenerationRef.current) {
        setBusy(false);
      }
    }
  }

  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (validation?.valid !== true) {
      return;
    }
    setBusy(true);
    setRequestError(null);
    try {
      const result = await managementApi.registerProvider(toSetupInput(draft));
      setValidation(result.validation);
      if (result.status === "validation-failed") {
        setStep("configure");
        return;
      }
      await onRegistered(result.provider.provider.id, result.provider.provider.name, result.provider.provider.active);
    } catch (error) {
      setRequestError(actionableError(error, "Unable to register provider", "Retest the connection, then retry registration."));
    } finally {
      setBusy(false);
    }
  }

  const allowedKinds: readonly ProviderKind[] = capability === "event-source"
    ? ["twitch", "streamerbot"]
    : ["speakerbot", "browser-speech"];
  const websocket = draft.kind === "streamerbot" || draft.kind === "speakerbot";
  const stepNumber = step === "select" ? 1 : step === "configure" ? 2 : 3;
  const subject = capability === "event-source" ? "event source" : "TTS provider";
  const heading = step === "select"
    ? `Add ${subject}`
    : step === "configure"
      ? reconnectProvider === null ? `Configure ${formatProviderKind(draft.kind)}` : `Reconnect ${reconnectProvider.name}`
      : `Review ${subject}`;

  function cancelSetup() {
    invalidateTwitchRequest();
    setTwitchAuthorization(null);
    setBusy(false);
    onCancel();
  }

  return (
    <ModalSurface labelledBy="provider-setup-title" onCancel={cancelSetup} open={open}>
      <form className="provider-page__modal-content" onSubmit={(event) => void register(event)}>
        <div>
          <span className="provider-page__eyebrow">{reconnecting ? "Connection recovery" : `Step ${stepNumber} of 3`}</span>
          <ManagementModalTitle ref={headingRef} tabIndex={-1}>{heading}</ManagementModalTitle>
        </div>

        {step === "select" ? (
          <div className="provider-page__form">
            <NativeSelect label="Provider type" value={draft.kind} onChange={(event) => changeKind(event.currentTarget.value as ProviderKind)}>
                {allowedKinds.map((kind) => <option key={kind} value={kind}>{formatProviderKind(kind)}</option>)}
              </NativeSelect>
            <p className="provider-page__setup-description">{providerSetupDescription(draft.kind)}</p>
          </div>
        ) : null}

        {step === "configure" ? (
          <div className="provider-page__form">
            {reconnecting ? null : (
              <TextInput label="Connection name" onChange={(event) => updateDraft({ ...draft, name: event.currentTarget.value })} withAsterisk={false} required value={draft.name} />
            )}
            {draft.kind === "twitch" ? (
              <section aria-labelledby="twitch-account-title" className="provider-page__connection-panel">
                <h3 id="twitch-account-title">Twitch account</h3>
                {twitchStatusLoading ? <p role="status">Checking Twitch connection...</p> : null}
                {!twitchStatusLoading && twitchStatus?.connected === true ? (
                  <p><strong>Connected:</strong> {formatTwitchAccount(twitchStatus)}</p>
                ) : null}
                {twitchStatus?.connected === true && twitchStatus.authorizationState === "update-required" ? (
                  <div className="provider-page__connection-actions">
                    <strong>Authorization update required</strong>
                    <p>Reconnect Twitch to enable Hype Trains, polls, and predictions.</p>
                  </div>
                ) : null}
                {!twitchStatusLoading && twitchStatus?.connected === false ? <p>No Twitch account connected</p> : null}
                {reconnecting || twitchStatus?.connected !== true || twitchStatus.authorizationState !== "ready" ? (
                  <div className="provider-page__connection-actions">
                    {twitchAuthorization === null || requestError !== null ? (
                      <Button disabled={busy} onClick={() => void startTwitchConnection()} type="button">
                        {twitchAuthorization === null ? reconnecting || twitchStatus?.authorizationState === "update-required" ? "Reconnect Twitch" : "Connect Twitch" : "Try again"}
                      </Button>
                    ) : null}
                    {twitchAuthorization === null ? null : (
                      <>
                        <a href={twitchAuthorization.verificationUri} rel="noreferrer" target="_blank">Open Twitch</a>
                        <div className="provider-page__twitch-code" role="status">
                          <span>Code</span>
                          <code>{twitchAuthorization.userCode}</code>
                          <span>Expires {formatDateTime(twitchAuthorization.expiresAt)}</span>
                        </div>
                        {requestError === null ? <p role="status">Waiting for Twitch authorization...</p> : null}
                      </>
                    )}
                  </div>
                ) : null}
              </section>
            ) : null}
            {websocket ? (
              <>
                <p className="provider-page__setup-description">Enable the provider's WebSocket server. Use only 127.0.0.1, localhost, or ::1 and a path-only endpoint. Local ws transport and authentication are separate settings.</p>
                {draft.kind === "speakerbot" ? <p>Speaker.bot documents no native WebSocket authentication. Keep its server restricted to this computer.</p> : null}
                <NativeSelect label="Protocol" value={draft.protocol} onChange={(event) => updateDraft({ ...draft, protocol: event.currentTarget.value as "ws" | "wss" })}>
                    <option value="ws">ws</option>
                    <option value="wss">wss</option>
                  </NativeSelect>
                <TextInput label="Host" onChange={(event) => updateDraft({ ...draft, host: event.currentTarget.value })} withAsterisk={false} required value={draft.host} />
                <TextInput label="Port" max={65535} min={1} onChange={(event) => updateDraft({ ...draft, port: Number(event.currentTarget.value) })} withAsterisk={false} required type="number" value={draft.port} />
                <TextInput label="Endpoint" onChange={(event) => updateDraft({ ...draft, endpoint: event.currentTarget.value })} withAsterisk={false} required value={draft.endpoint} />
              </>
            ) : null}
            {draft.kind === "streamerbot" ? (
              <>
              <p>Enable Authentication and Enforce in Streamer.bot's WebSocket server, then enter its password. Authentication does not encrypt local ws traffic.</p>
              <TextInput label="Password" autoComplete="new-password" onChange={(event) => updateDraft({ ...draft, credential: event.currentTarget.value })} type="password" value={draft.credential} />
              <Checkbox label="Allow an unauthenticated local connection" checked={draft.allowUnauthenticatedLocalConnection} onChange={(event) => updateDraft({ ...draft, allowUnauthenticatedLocalConnection: event.currentTarget.checked })}  />
              <p>Choose this only if you intentionally disabled authentication on the local Streamer.bot server.</p>
              </>
            ) : null}
          </div>
        ) : null}

        {step === "review" ? (
          <div className="provider-page__review">
            <p className="provider-page__notice" role="status">Connection test passed.</p>
            <dl className="provider-page__facts">
              <div><dt>Provider</dt><dd>{formatProviderKind(draft.kind)}</dd></div>
              <div><dt>Connection name</dt><dd>{draft.name}</dd></div>
              {draft.kind === "twitch" && twitchStatus?.connected === true
                ? <div><dt>Twitch account</dt><dd>{formatTwitchAccount(twitchStatus)}</dd></div>
                : null}
              {websocket
                ? <div><dt>Endpoint</dt><dd>{draft.protocol}://{draft.host}:{draft.port}{draft.endpoint}</dd></div>
                : null}
            </dl>
          </div>
        ) : null}

        {requestError === null ? null : <ManagementErrorBanner error={requestError} />}
        {validation?.error === null || validation?.error === undefined ? null : <ManagementErrorBanner error={validation.error} />}

        <div className="provider-page__actions">
          <Button variant="default" onClick={cancelSetup} type="button">Cancel</Button>
          {step === "select" ? (
            <Button onClick={() => setStep("configure")} type="button">Continue</Button>
          ) : null}
          {step === "configure" && !reconnecting ? (
            <>
              <Button variant="default" disabled={busy} onClick={() => setStep("select")} type="button">Back</Button>
              <Button disabled={busy || twitchStatusLoading || draft.name.trim().length === 0 || (draft.kind === "streamerbot" && !draft.credential && !draft.allowUnauthenticatedLocalConnection)} onClick={() => void validate()} type="button">
                {busy ? "Testing..." : draft.kind === "twitch" && twitchStatus?.connected !== true ? "Check connection" : "Test connection"}
              </Button>
            </>
          ) : null}
          {step === "review" ? (
            <>
              <Button variant="default" disabled={busy} onClick={() => setStep("configure")} type="button">Back</Button>
              <Button disabled={busy || validation?.valid !== true} type="submit">Register {subject}</Button>
            </>
          ) : null}
        </div>
      </form>
    </ModalSurface>
  );
}

function formatTwitchAccount(status: Extract<TwitchConnectionStatusView, { readonly connected: true }>): string {
  return `${status.account.displayName} (@${status.account.login})`;
}

function formatActivationImpactSummary(matchedAlertCount: number, unmatchedAlertCount: number): string {
  if (matchedAlertCount === 0 && unmatchedAlertCount === 0) return "No active alerts are affected";
  if (matchedAlertCount === 0) return formatCount(unmatchedAlertCount, { one: "unmatched alert", other: "unmatched alerts" });
  if (unmatchedAlertCount === 0) return formatCount(matchedAlertCount, { one: "matching alert", other: "matching alerts" });
  return `${formatCount(matchedAlertCount, { one: "matching alert", other: "matching alerts" })}, ${formatCount(unmatchedAlertCount, { one: "unmatched alert", other: "unmatched alerts" })}`;
}

function providerSetupDescription(kind: ProviderKind): string {
  switch (kind) {
    case "twitch":
      return "Connect Twitch directly through EventSub authorization.";
    case "streamerbot":
      return "Receive events from Streamer.bot through its WebSocket server.";
    case "speakerbot":
      return "Send text-to-speech output to Speaker.bot through its WebSocket server.";
    case "browser-speech":
      return "Use speech synthesis provided by the browser running the overlay.";
    case "pear-desktop":
      return "Read music playback from Pear Desktop on this computer.";
  }
}

function createDraft(kind: ProviderKind): SetupDraft {
  return {
    kind,
    name: formatProviderKind(kind),
    protocol: "ws",
    host: "127.0.0.1",
    port: kind === "speakerbot" ? 7680 : 8080,
    endpoint: "/",
    credential: "",
    allowUnauthenticatedLocalConnection: false
  };
}

function toSetupInput(draft: SetupDraft): ProviderSetupInput {
  const name = draft.name.trim();
  if (draft.kind === "twitch") {
    return { kind: "twitch", name, configuration: {} };
  }
  if (draft.kind === "browser-speech") {
    return { kind: "browser-speech", name, configuration: {} };
  }
  const configuration = {
    protocol: draft.protocol,
    host: draft.host.trim(),
    port: draft.port,
    endpoint: draft.endpoint.trim()
  };
  return draft.kind === "streamerbot"
    ? { kind: "streamerbot", name, configuration: { ...configuration, allowUnauthenticatedLocalConnection: draft.allowUnauthenticatedLocalConnection }, credential: draft.credential || null }
    : { kind: "speakerbot", name, configuration };
}

function connectionTone(state: RegisteredProviderView["connectionState"]): StatusBadgeTone {
  return state === "connected" ? "positive" : state === "error" ? "negative" : state === "validating" ? "info" : "neutral";
}

function eventSourceLiveStatus(provider: RegisteredProviderView): ProviderLiveStatus {
  if (provider.liveStatus !== undefined) return provider.liveStatus;
  if (!provider.active) return "not-running";
  if (provider.connectionState === "validating") return "starting";
  if (provider.connectionState === "disconnected") return "reconnecting";
  return provider.connectionState === "connected" && provider.intakeState === "active" ? "healthy" : "error";
}

function liveStatusTone(state: ProviderLiveStatus): StatusBadgeTone {
  if (state === "healthy") return "positive";
  if (state === "error") return "negative";
  if (state === "reconnecting") return "warning";
  return state === "starting" ? "info" : "neutral";
}

function formatLiveStatus(state: ProviderLiveStatus): string {
  const labels: Record<ProviderLiveStatus, string> = {
    "not-running": "Not running",
    starting: "Starting",
    healthy: "Healthy",
    reconnecting: "Reconnecting",
    error: "Error"
  };
  return labels[state];
}

function formatProviderKind(kind: ProviderKind): string {
  const labels: Record<ProviderKind, string> = {
    twitch: "Twitch",
    streamerbot: "Streamer.bot",
    speakerbot: "Speaker.bot",
    "browser-speech": "Browser Speech",
    "pear-desktop": "Pear Desktop"
  };
  return labels[kind];
}

function formatState(value: string): string {
  return value
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function actionableError(error: unknown, summary: string, nextStep: string): ActionableManagementError {
  return {
    summary,
    cause: error instanceof Error ? error.message : error === null ? null : "The request failed for an unknown reason.",
    nextStep: typeof error === "object" && error !== null && "nextStep" in error && typeof error.nextStep === "string" && error.nextStep.trim() !== "" ? error.nextStep : nextStep,
    severity: "error",
    occurredAt: new Date().toISOString(),
    referenceId: readReferenceId(error),
    correction: null
  };
}

function readReferenceId(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("referenceId" in error)) {
    return null;
  }
  return typeof error.referenceId === "string" && error.referenceId.length > 0 ? error.referenceId : null;
}
