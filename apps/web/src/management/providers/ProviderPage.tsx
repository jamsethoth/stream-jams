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
  TtsProviderSafetySettings
} from "@stream-jams/core";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ManagementErrorBanner } from "../foundation/ManagementErrorBanner.js";
import { DirtyNavigationDialog } from "../foundation/DirtyNavigationDialog.js";
import { ModalSurface } from "../foundation/ModalSurface.js";
import { StatusBadge, type StatusBadgeTone } from "../foundation/StatusBadge.js";
import type { ManagementApi, TwitchConnectionStatusView } from "../management-api.js";
import { useDirtyNavigationSource } from "../navigation/dirty-navigation.js";
import "./provider-pages.css";

export type ProviderPageApi = Pick<
  ManagementApi,
  | "listRegisteredProviders"
  | "validateProvider"
  | "registerProvider"
  | "getProvider"
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
    ? { title: "Event sources", add: "Add event source", empty: "No event sources registered." }
    : { title: "TTS providers", add: "Add TTS provider", empty: "No TTS providers registered." };
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
  const [notice, setNotice] = useState<string | null>(null);
  const [setupOpen, setSetupOpen] = useState(openSetupOnLoad);
  const [reconnectProvider, setReconnectProvider] = useState<RegisteredProviderView | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingProviderAction | null>(null);
  const [actionLoadingProviderId, setActionLoadingProviderId] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [pendingProviderId, setPendingProviderId] = useState<string | null>(null);
  const [selectionError, setSelectionError] = useState<string | null>(null);

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
    setPendingAction({ kind: "deactivate", provider, impact: null });
  }

  async function confirmProviderAction() {
    if (pendingAction === null) return;
    setActionBusy(true);
    try {
      if (pendingAction.kind === "activate") {
        await managementApi.activateProvider(pendingAction.provider.id, true);
      } else {
        await managementApi.deactivateProvider(pendingAction.provider.id);
      }
      await loadProviders(pendingAction.provider.id);
      setOperationError(null);
      setNotice(`${pendingAction.provider.name} is ${pendingAction.kind === "activate" ? "active" : "inactive"}.`);
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

  const persistSafety = useCallback(async (): Promise<boolean> => {
    if (selectedProvider === null || safety === null) {
      return false;
    }
    try {
      const saved = await managementApi.updateTtsSafety(selectedProvider.id, safety);
      setSafety(saved);
      setSavedSafety(saved);
      setOperationError(null);
      setNotice("TTS safety settings saved.");
      return true;
    } catch (error) {
      setOperationError(actionableError(error, "Unable to save TTS safety settings", "Review each safety value, then retry the save."));
      return false;
    }
  }, [managementApi, safety, selectedProvider]);

  const discardSafety = useCallback(() => {
    setSafety(savedSafety);
  }, [savedSafety]);

  const safetyDirty = safety !== null && savedSafety !== null && JSON.stringify(safety) !== JSON.stringify(savedSafety);
  useDirtyNavigationSource({
    id: "tts-provider-safety",
    dirty: safetyDirty,
    summary: "TTS safety settings have unsaved changes.",
    save: persistSafety,
    discard: discardSafety
  });

  function saveSafety(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void persistSafety();
  }

  function requestProviderSelection(providerId: string) {
    if (providerId === selectedProviderId) return;
    if (safetyDirty) {
      setSelectionError(null);
      setPendingProviderId(providerId);
      return;
    }
    setSelectedProviderId(providerId);
  }

  async function saveAndContinueSelection() {
    if (pendingProviderId === null) return;
    setSelectionError(null);
    if (!await persistSafety()) {
      setSelectionError("TTS safety settings were not saved. Review each safety value, then retry the save.");
      return;
    }
    setSelectedProviderId(pendingProviderId);
    setPendingProviderId(null);
  }

  function discardAndContinueSelection() {
    if (pendingProviderId === null) return;
    discardSafety();
    setSelectedProviderId(pendingProviderId);
    setPendingProviderId(null);
    setSelectionError(null);
  }

  async function testVoice() {
    if (selectedProvider === null) {
      return;
    }
    try {
      const result = await managementApi.testProviderVoice(selectedProvider.id);
      if (!result.delivered) {
        setOperationError(result.error ?? actionableError(null, "Voice test was not delivered", "Confirm the provider is connected, then retry the voice test."));
        return;
      }
      setOperationError(null);
      setNotice("Voice test delivered.");
    } catch (error) {
      setOperationError(actionableError(error, "Unable to test provider voice", "Confirm the provider is connected and its output is available, then retry."));
    }
  }

  return (
    <div className="provider-page">
      <div className="provider-page__toolbar">
        <div>
          <h2>{copy.title}</h2>
          <p>Register providers, validate connections, and choose which provider is active.</p>
        </div>
        <button onClick={() => { setReconnectProvider(null); setSetupOpen(true); }} type="button">{copy.add}</button>
      </div>

      {pageError === null ? null : <ManagementErrorBanner error={pageError} />}
      {refreshError === null ? null : <ManagementErrorBanner error={refreshError} />}
      {operationError === null ? null : <ManagementErrorBanner error={operationError} />}
      {notice === null ? null : <p className="provider-page__notice" role="status">{notice}</p>}

      {loading ? <p className="provider-page__empty" role="status">Loading providers...</p> : null}
      {!loading && pageError === null && providers.length === 0 ? <p className="provider-page__empty">{copy.empty}</p> : null}
      {providers.length > 0 ? (
        <div className="provider-page__workspace">
          <div className="provider-page__table-wrap">
            <table className="provider-page__table">
              <thead>
                <tr>
                  <th scope="col">Provider</th>
                  {capability === "event-source" ? (
                    <>
                      <th scope="col">Usage</th>
                      <th scope="col">Live status</th>
                    </>
                  ) : (
                    <>
                      <th scope="col">Connection</th>
                      <th scope="col">Used by alerts</th>
                      <th scope="col">Runtime</th>
                    </>
                  )}
                  {capability === "event-source" ? <th scope="col">Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {providers.map((provider) => (
                  <tr
                    className={provider.id === selectedProviderId ? "provider-page__selected-row" : undefined}
                    key={provider.id}
                    onClick={() => requestProviderSelection(provider.id)}
                  >
                    <th scope="row">
                      <button
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
                      </button>
                    </th>
                    {capability === "event-source" ? (
                      <>
                        <td><StatusBadge label={provider.active ? "In use" : "Not in use"} tone={provider.active ? "positive" : "neutral"} /></td>
                        <td><StatusBadge label={formatLiveStatus(eventSourceLiveStatus(provider))} tone={liveStatusTone(eventSourceLiveStatus(provider))} /></td>
                      </>
                    ) : (
                      <>
                        <td><StatusBadge label={formatState(provider.connectionState)} tone={connectionTone(provider.connectionState)} /></td>
                        <td>{provider.usedByAlertCount}</td>
                        <td><StatusBadge label={provider.active ? "Active" : "Inactive"} tone={provider.active ? "positive" : "neutral"} /></td>
                      </>
                    )}
                    {capability === "event-source" ? (
                      <td>
                        <button
                          aria-label={`${provider.active ? "Deactivate" : "Activate"} ${provider.name}`}
                          className="provider-page__secondary-action"
                          disabled={actionLoadingProviderId === provider.id}
                          onClick={(event) => {
                            event.stopPropagation();
                            if (provider.active) requestDeactivation(provider);
                            else void requestActivation(provider);
                          }}
                          type="button"
                        >
                          {actionLoadingProviderId === provider.id ? "Checking..." : provider.active ? "Deactivate" : "Activate"}
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {detail === null ? <p className="provider-page__empty provider-page__detail">Loading provider details...</p> : (
            <ProviderDetail
              capability={capability}
              detail={detail}
              impact={impact}
              onActivate={capability === "tts" && selectedProvider !== null ? () => void requestActivation(selectedProvider) : null}
              onReconnect={capability === "event-source" && detail.provider.kind === "twitch" && eventSourceLiveStatus(detail.provider) === "error"
                ? () => setReconnectProvider(detail.provider)
                : null}
              onSafetyChange={setSafety}
              onSafetySubmit={saveSafety}
              onTestVoice={() => void testVoice()}
              safety={safety}
            />
          )}
        </div>
      ) : null}

      <DirtyNavigationDialog
        error={selectionError}
        onCancel={() => { setPendingProviderId(null); setSelectionError(null); }}
        onDiscard={discardAndContinueSelection}
        onSave={() => void saveAndContinueSelection()}
        open={pendingProviderId !== null}
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
          setNotice(`${providerName} reconnected. Live status is updating.`);
        }}
        onRegistered={async (providerId, providerName, active) => {
          await loadProviders(providerId);
          setSetupOpen(false);
          setReconnectProvider(null);
          setNotice(active
            ? `${providerName} registered and active.`
            : `${providerName} registered but inactive. Set it active when you are ready to switch ${capability === "event-source" ? "event intake" : "text-to-speech output"}.`);
        }}
        open={setupOpen || reconnectProvider !== null}
        reconnectProvider={reconnectProvider}
      />

      <ModalSurface labelledBy="provider-action-title" onCancel={() => { if (!actionBusy) setPendingAction(null); }} open={pendingAction !== null}>
        <div className="provider-page__modal-content">
          <h2 id="provider-action-title">
            {pendingAction?.kind === "deactivate" ? "Deactivate" : "Activate"} {pendingAction?.provider.name ?? "provider"}?
          </h2>
          {pendingAction?.kind === "deactivate" ? (
            <>
              <p>Live event intake will stop for {pendingAction.provider.name}. Provider settings and alert mappings will remain saved, and the provider connection can remain connected.</p>
              <p>Activate this or another event source to resume intake.</p>
              <p>
                {pendingAction.provider.usedByAlertCount} {pendingAction.provider.usedByAlertCount === 1 ? "alert uses" : "alerts use"} this provider type.
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
              <p>{pendingAction?.impact.matchedAlertCount ?? 0} matching alerts, {pendingAction?.impact.unmatchedAlertCount ?? 0} unmatched alerts.</p>
              <div className="provider-page__errors">
                {[...(pendingAction?.impact.blockers ?? []), ...(pendingAction?.impact.warnings ?? [])].map((item, index) => (
                  <ManagementErrorBanner error={item} key={item.referenceId ?? `${item.summary}-${index}`} />
                ))}
              </div>
            </>
          )}
          <div className="provider-page__actions">
            <button className="provider-page__secondary-action" disabled={actionBusy} onClick={() => setPendingAction(null)} type="button">Cancel</button>
            <button
              className={pendingAction?.kind === "deactivate" ? "button button--danger" : undefined}
              disabled={actionBusy || (pendingAction?.impact?.blockers.length ?? 0) > 0}
              onClick={() => void confirmProviderAction()}
              type="button"
            >
              {pendingAction?.kind === "deactivate"
                ? "Deactivate event source"
                : capability === "event-source" ? "Activate event source" : "Activate TTS provider"}
            </button>
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
  onActivate,
  onReconnect,
  onSafetyChange,
  onSafetySubmit,
  onTestVoice,
  safety
}: {
  readonly capability: ProviderCapability;
  readonly detail: RegisteredProviderDetail;
  readonly impact: ProviderActivationImpact | null;
  readonly onActivate: (() => void) | null;
  readonly onReconnect: (() => void) | null;
  readonly onSafetyChange: (safety: TtsProviderSafetySettings) => void;
  readonly onSafetySubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly onTestVoice: () => void;
  readonly safety: TtsProviderSafetySettings | null;
}) {
  const provider = detail.provider;
  return (
    <section aria-labelledby="provider-detail-title" className="provider-page__detail">
      <div className="provider-page__section-heading">
        <div>
          <h3 id="provider-detail-title">{provider.name}</h3>
          <p>{formatProviderKind(provider.kind)}</p>
        </div>
        <StatusBadge
          label={capability === "event-source" ? provider.active ? "In use" : "Not in use" : provider.active ? "Active" : "Inactive"}
          tone={provider.active ? "positive" : "neutral"}
        />
      </div>
      {provider.error === null ? null : <ManagementErrorBanner error={provider.error} />}
      {onReconnect === null ? null : (
        <div className="provider-page__connection-actions">
          <button onClick={onReconnect} type="button">Reconnect Twitch</button>
        </div>
      )}
      <dl className="provider-page__facts">
        {capability === "event-source" ? (
          <>
            <div><dt>Usage</dt><dd>{provider.active ? "In use" : "Not in use"}</dd></div>
            <div><dt>Live status</dt><dd>{formatLiveStatus(eventSourceLiveStatus(provider))}</dd></div>
          </>
        ) : <div><dt>Connection</dt><dd>{formatState(provider.connectionState)}</dd></div>}
        <div><dt>Last validated</dt><dd>{provider.validatedAt === null ? "Never" : new Date(provider.validatedAt).toLocaleString()}</dd></div>
        <div>
          <dt>Used by alerts</dt>
          <dd>{provider.usedByAlertCount} alert {provider.usedByAlertCount === 1 ? "use" : "uses"}</dd>
        </div>
      </dl>

      {provider.active ? null : (
        <section aria-labelledby="activation-impact-title" className="provider-page__subsection">
          <h4 id="activation-impact-title">Activation impact</h4>
          {impact === null ? <p role="status">Checking alert impact...</p> : (
            <>
              <p>{impact.matchedAlertCount} matching alerts, {impact.unmatchedAlertCount} unmatched alerts</p>
              <div className="provider-page__errors">
                {[...impact.blockers, ...impact.warnings].map((item, index) => (
                  <ManagementErrorBanner error={item} key={item.referenceId ?? `${item.summary}-${index}`} />
                ))}
              </div>
              {onActivate === null ? null : (
                <button disabled={impact.blockers.length > 0} onClick={onActivate} type="button">
                  {impact.blockers.length > 0 ? "Resolve blockers to activate" : "Set active"}
                </button>
              )}
            </>
          )}
        </section>
      )}

      {capability === "tts" && safety !== null ? (
        <>
          <section aria-labelledby="tts-safety-title" className="provider-page__subsection">
            <h4 id="tts-safety-title">Safety defaults</h4>
            <form className="provider-page__form" onSubmit={onSafetySubmit}>
              <label>
                <span>Default voice</span>
                <select value={safety.defaultVoiceId ?? ""} onChange={(event) => onSafetyChange({ ...safety, defaultVoiceId: event.currentTarget.value || null })}>
                  <option value="">Provider default</option>
                  {detail.availableVoices.map((voice) => <option key={voice.id} value={voice.id}>{voice.label}</option>)}
                </select>
              </label>
              <label>
                <span>Volume</span>
                <input max={1} min={0} onChange={(event) => onSafetyChange({ ...safety, volume: Number(event.currentTarget.value) })} required step={0.1} type="number" value={safety.volume} />
              </label>
              <label>
                <span>Minimum rate</span>
                <input min={0.1} onChange={(event) => onSafetyChange({ ...safety, minimumRate: Number(event.currentTarget.value) })} required step={0.1} type="number" value={safety.minimumRate} />
              </label>
              <label>
                <span>Maximum rate</span>
                <input min={0.1} onChange={(event) => onSafetyChange({ ...safety, maximumRate: Number(event.currentTarget.value) })} required step={0.1} type="number" value={safety.maximumRate} />
              </label>
              <label>
                <span>Maximum text length</span>
                <input min={1} onChange={(event) => onSafetyChange({ ...safety, maximumTextLength: Number(event.currentTarget.value) })} required step={1} type="number" value={safety.maximumTextLength} />
              </label>
              <button type="submit">Save safety settings</button>
            </form>
          </section>
          <section aria-labelledby="voice-test-title" className="provider-page__subsection">
            <h4 id="voice-test-title">Voice test</h4>
            <p>{safeVoiceTestText}</p>
            <button onClick={onTestVoice} type="button">Test voice</button>
          </section>
        </>
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

      const result = await managementApi.validateProvider(toSetupInput(draft));
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
          <h2 id="provider-setup-title" ref={headingRef} tabIndex={-1}>{heading}</h2>
        </div>

        {step === "select" ? (
          <div className="provider-page__form">
            <label>
              <span>Provider type</span>
              <select value={draft.kind} onChange={(event) => changeKind(event.currentTarget.value as ProviderKind)}>
                {allowedKinds.map((kind) => <option key={kind} value={kind}>{formatProviderKind(kind)}</option>)}
              </select>
            </label>
            <p className="provider-page__setup-description">{providerSetupDescription(draft.kind)}</p>
          </div>
        ) : null}

        {step === "configure" ? (
          <div className="provider-page__form">
            {reconnecting ? null : (
              <label>
                <span>Connection name</span>
                <input onChange={(event) => updateDraft({ ...draft, name: event.currentTarget.value })} required value={draft.name} />
              </label>
            )}
            {draft.kind === "twitch" ? (
              <section aria-labelledby="twitch-account-title" className="provider-page__connection-panel">
                <h3 id="twitch-account-title">Twitch account</h3>
                {twitchStatusLoading ? <p role="status">Checking Twitch connection...</p> : null}
                {!twitchStatusLoading && twitchStatus?.connected === true ? (
                  <p><strong>Connected:</strong> {formatTwitchAccount(twitchStatus)}</p>
                ) : null}
                {!twitchStatusLoading && twitchStatus?.connected === false ? <p>No Twitch account connected</p> : null}
                {!reconnecting && twitchStatus?.connected === true ? null : (
                  <div className="provider-page__connection-actions">
                    {twitchAuthorization === null || requestError !== null ? (
                      <button disabled={busy} onClick={() => void startTwitchConnection()} type="button">
                        {twitchAuthorization === null ? reconnecting ? "Reconnect Twitch" : "Connect Twitch" : "Try again"}
                      </button>
                    ) : null}
                    {twitchAuthorization === null ? null : (
                      <>
                        <a href={twitchAuthorization.verificationUri} rel="noreferrer" target="_blank">Open Twitch</a>
                        <div className="provider-page__twitch-code" role="status">
                          <span>Code</span>
                          <code>{twitchAuthorization.userCode}</code>
                          <span>Expires {new Date(twitchAuthorization.expiresAt).toLocaleTimeString()}</span>
                        </div>
                        {requestError === null ? <p role="status">Waiting for Twitch authorization...</p> : null}
                      </>
                    )}
                  </div>
                )}
              </section>
            ) : null}
            {websocket ? (
              <>
                <p className="provider-page__setup-description">Enable the provider's WebSocket server before testing this connection.</p>
                <label>
                  <span>Protocol</span>
                  <select value={draft.protocol} onChange={(event) => updateDraft({ ...draft, protocol: event.currentTarget.value as "ws" | "wss" })}>
                    <option value="ws">ws</option>
                    <option value="wss">wss</option>
                  </select>
                </label>
                <label>
                  <span>Host</span>
                  <input onChange={(event) => updateDraft({ ...draft, host: event.currentTarget.value })} required value={draft.host} />
                </label>
                <label>
                  <span>Port</span>
                  <input max={65535} min={1} onChange={(event) => updateDraft({ ...draft, port: Number(event.currentTarget.value) })} required type="number" value={draft.port} />
                </label>
                <label>
                  <span>Endpoint</span>
                  <input onChange={(event) => updateDraft({ ...draft, endpoint: event.currentTarget.value })} required value={draft.endpoint} />
                </label>
              </>
            ) : null}
            {draft.kind === "streamerbot" ? (
              <label>
                <span>Password (optional)</span>
                <input autoComplete="new-password" onChange={(event) => updateDraft({ ...draft, credential: event.currentTarget.value })} type="password" value={draft.credential} />
              </label>
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
          <button className="provider-page__secondary-action" onClick={cancelSetup} type="button">Cancel</button>
          {step === "select" ? (
            <button onClick={() => setStep("configure")} type="button">Continue</button>
          ) : null}
          {step === "configure" && !reconnecting ? (
            <>
              <button className="provider-page__secondary-action" disabled={busy} onClick={() => setStep("select")} type="button">Back</button>
              <button disabled={busy || twitchStatusLoading || draft.name.trim().length === 0} onClick={() => void validate()} type="button">
                {busy ? "Testing..." : draft.kind === "twitch" && twitchStatus?.connected !== true ? "Check connection" : "Test connection"}
              </button>
            </>
          ) : null}
          {step === "review" ? (
            <>
              <button className="provider-page__secondary-action" disabled={busy} onClick={() => setStep("configure")} type="button">Back</button>
              <button disabled={busy || validation?.valid !== true} type="submit">Register {subject}</button>
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
    credential: ""
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
    ? { kind: "streamerbot", name, configuration, credential: draft.credential || null }
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
    "browser-speech": "Browser Speech"
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
    nextStep,
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
