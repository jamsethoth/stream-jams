import type {
  ActionableManagementError,
  ProviderActivationImpact,
  ProviderCapability,
  ProviderKind,
  ProviderSetupInput,
  ProviderValidationResult,
  RegisteredProviderDetail,
  RegisteredProviderView,
  TtsProviderSafetySettings
} from "@stream-jams/core";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ManagementErrorBanner } from "../foundation/ManagementErrorBanner.js";
import { ModalSurface } from "../foundation/ModalSurface.js";
import { StatusBadge, type StatusBadgeTone } from "../foundation/StatusBadge.js";
import type { ManagementApi } from "../management-api.js";
import "./provider-pages.css";

export type ProviderPageApi = Pick<
  ManagementApi,
  | "listRegisteredProviders"
  | "validateProvider"
  | "registerProvider"
  | "getProvider"
  | "activateProvider"
  | "getProviderActivationImpact"
  | "getTtsProviderSafetySettings"
  | "updateTtsSafety"
  | "testProviderVoice"
>;

interface ProviderPageProps {
  readonly capability: ProviderCapability;
  readonly managementApi: ProviderPageApi;
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

const safeVoiceTestText = "Stream Jams voice test. Your text to speech provider is ready.";

export function ProviderPage({ capability, managementApi }: ProviderPageProps) {
  const copy = capability === "event-source"
    ? { title: "Event sources", add: "Add event source", empty: "No event sources registered." }
    : { title: "TTS providers", add: "Add TTS provider", empty: "No TTS providers registered." };
  const [providers, setProviders] = useState<readonly RegisteredProviderView[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [detail, setDetail] = useState<RegisteredProviderDetail | null>(null);
  const [impact, setImpact] = useState<ProviderActivationImpact | null>(null);
  const [safety, setSafety] = useState<TtsProviderSafetySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<ActionableManagementError | null>(null);
  const [operationError, setOperationError] = useState<ActionableManagementError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [activationOpen, setActivationOpen] = useState(false);

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
          setSelectedProviderId(loaded.find((provider) => provider.active)?.id ?? loaded[0]?.id ?? null);
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
  }, [capability, copy.title, managementApi]);

  const selectedProvider = useMemo(
    () => providers.find((provider) => provider.id === selectedProviderId) ?? null,
    [providers, selectedProviderId]
  );

  useEffect(() => {
    if (selectedProvider === null) {
      setDetail(null);
      setImpact(null);
      setSafety(null);
      return;
    }
    let cancelled = false;
    const detailRequest = managementApi.getProvider(selectedProvider.id);
    const impactRequest = selectedProvider.active
      ? Promise.resolve<ProviderActivationImpact | null>(null)
      : managementApi.getProviderActivationImpact(selectedProvider.id);
    const safetyRequest = capability === "tts"
      ? managementApi.getTtsProviderSafetySettings(selectedProvider.id)
      : Promise.resolve<TtsProviderSafetySettings | null>(null);
    void Promise.all([detailRequest, impactRequest, safetyRequest])
      .then(([loadedDetail, loadedImpact, loadedSafety]) => {
        if (!cancelled) {
          setDetail(loadedDetail);
          setImpact(loadedImpact);
          setSafety(loadedSafety);
          setOperationError(null);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setDetail(null);
          setImpact(null);
          setSafety(null);
          setOperationError(actionableError(error, "Unable to load provider details", "Select the provider again or retry after checking Diagnostics."));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [capability, managementApi, selectedProvider]);

  async function activate(confirmWarnings: boolean) {
    if (selectedProvider === null) {
      return;
    }
    try {
      await managementApi.activateProvider(selectedProvider.id, confirmWarnings);
      await loadProviders(selectedProvider.id);
      setActivationOpen(false);
      setOperationError(null);
      setNotice(`${selectedProvider.name} is active.`);
    } catch (error) {
      setActivationOpen(false);
      setOperationError(actionableError(error, "Unable to activate provider", "Review activation impact and resolve blockers before retrying."));
    }
  }

  async function requestActivation() {
    if (impact === null || impact.blockers.length > 0) {
      return;
    }
    if (impact.warnings.length > 0) {
      setActivationOpen(true);
      return;
    }
    await activate(false);
  }

  async function saveSafety(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedProvider === null || safety === null) {
      return;
    }
    try {
      const saved = await managementApi.updateTtsSafety(selectedProvider.id, safety);
      setSafety(saved);
      setOperationError(null);
      setNotice("TTS safety settings saved.");
    } catch (error) {
      setOperationError(actionableError(error, "Unable to save TTS safety settings", "Review each safety value, then retry the save."));
    }
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
        <button onClick={() => setSetupOpen(true)} type="button">{copy.add}</button>
      </div>

      {pageError === null ? null : <ManagementErrorBanner error={pageError} />}
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
                  <th scope="col">Connection</th>
                  {capability === "event-source" ? <th scope="col">Intake</th> : <th scope="col">Used by alerts</th>}
                  <th scope="col">Runtime</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {providers.map((provider) => (
                  <tr className={provider.id === selectedProviderId ? "provider-page__selected-row" : undefined} key={provider.id}>
                    <th scope="row">
                      <span>{provider.name}</span>
                      <small>{formatProviderKind(provider.kind)}</small>
                    </th>
                    <td><StatusBadge label={formatState(provider.connectionState)} tone={connectionTone(provider.connectionState)} /></td>
                    <td>
                      {capability === "event-source"
                        ? <StatusBadge label={formatState(provider.intakeState ?? "inactive")} tone={intakeTone(provider.intakeState)} />
                        : `${provider.usedByAlertCount}`}
                    </td>
                    <td><StatusBadge label={provider.active ? "Active" : "Inactive"} tone={provider.active ? "positive" : "neutral"} /></td>
                    <td>
                      <button aria-label={`View ${provider.name}`} className="provider-page__secondary-action" onClick={() => setSelectedProviderId(provider.id)} type="button">View</button>
                    </td>
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
              onActivate={() => void requestActivation()}
              onSafetyChange={setSafety}
              onSafetySubmit={saveSafety}
              onTestVoice={() => void testVoice()}
              safety={safety}
            />
          )}
        </div>
      ) : null}

      <ProviderSetupWizard
        capability={capability}
        managementApi={managementApi}
        onCancel={() => setSetupOpen(false)}
        onRegistered={async (providerId, providerName) => {
          await loadProviders(providerId);
          setSetupOpen(false);
          setNotice(`${providerName} registered.`);
        }}
        open={setupOpen}
      />

      <ModalSurface labelledBy="provider-activation-title" onCancel={() => setActivationOpen(false)} open={activationOpen}>
        <div className="provider-page__modal-content">
          <h2 id="provider-activation-title">Set {selectedProvider?.name ?? "provider"} active?</h2>
          <p>This changes which {capability === "event-source" ? "event source receives live events" : "TTS provider handles speech"}.</p>
          <div className="provider-page__errors">
            {impact?.warnings.map((item, index) => <ManagementErrorBanner error={item} key={item.referenceId ?? `${item.summary}-${index}`} />)}
          </div>
          <div className="provider-page__actions">
            <button className="provider-page__secondary-action" onClick={() => setActivationOpen(false)} type="button">Cancel</button>
            <button onClick={() => void activate(true)} type="button">Set active provider</button>
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
  onSafetyChange,
  onSafetySubmit,
  onTestVoice,
  safety
}: {
  readonly capability: ProviderCapability;
  readonly detail: RegisteredProviderDetail;
  readonly impact: ProviderActivationImpact | null;
  readonly onActivate: () => void;
  readonly onSafetyChange: (safety: TtsProviderSafetySettings) => void;
  readonly onSafetySubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly onTestVoice: () => void;
  readonly safety: TtsProviderSafetySettings | null;
}) {
  const provider = detail.provider;
  const usageRoute = capability === "tts"
    ? `/modules/alerts?ttsProvider=${encodeURIComponent(provider.id)}`
    : `/modules/alerts?eventSource=${encodeURIComponent(provider.id)}`;
  return (
    <section aria-labelledby="provider-detail-title" className="provider-page__detail">
      <div className="provider-page__section-heading">
        <div>
          <h3 id="provider-detail-title">{provider.name}</h3>
          <p>{formatProviderKind(provider.kind)}</p>
        </div>
        <StatusBadge label={provider.active ? "Active" : "Inactive"} tone={provider.active ? "positive" : "neutral"} />
      </div>
      {provider.error === null ? null : <ManagementErrorBanner error={provider.error} />}
      <dl className="provider-page__facts">
        <div><dt>Connection</dt><dd>{formatState(provider.connectionState)}</dd></div>
        {capability === "event-source" ? <div><dt>Intake</dt><dd>{formatState(provider.intakeState ?? "inactive")}</dd></div> : null}
        <div><dt>Last validated</dt><dd>{provider.validatedAt === null ? "Never" : new Date(provider.validatedAt).toLocaleString()}</dd></div>
        <div>
          <dt>Used by alerts</dt>
          <dd><a href={usageRoute}>View {provider.usedByAlertCount} alert {provider.usedByAlertCount === 1 ? "use" : "uses"}</a></dd>
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
              <button disabled={impact.blockers.length > 0} onClick={onActivate} type="button">
                {impact.blockers.length > 0 ? "Resolve blockers to activate" : "Set active"}
              </button>
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
  onRegistered,
  open
}: {
  readonly capability: ProviderCapability;
  readonly managementApi: ProviderPageApi;
  readonly onCancel: () => void;
  readonly onRegistered: (providerId: string, providerName: string) => Promise<void>;
  readonly open: boolean;
}) {
  const defaultKind: ProviderKind = capability === "event-source" ? "twitch" : "speakerbot";
  const [draft, setDraft] = useState<SetupDraft>(() => createDraft(defaultKind));
  const [validation, setValidation] = useState<ProviderValidationResult | null>(null);
  const [requestError, setRequestError] = useState<ActionableManagementError | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(createDraft(defaultKind));
      setValidation(null);
      setRequestError(null);
      setBusy(false);
    }
  }, [defaultKind, open]);

  function updateDraft(next: SetupDraft) {
    setDraft(next);
    setValidation(null);
    setRequestError(null);
  }

  function changeKind(kind: ProviderKind) {
    updateDraft(createDraft(kind));
  }

  async function validate() {
    setBusy(true);
    setRequestError(null);
    try {
      setValidation(await managementApi.validateProvider(toSetupInput(draft)));
    } catch (error) {
      setValidation(null);
      setRequestError(actionableError(error, "Unable to test provider connection", "Check the connection settings and local provider service, then retry."));
    } finally {
      setBusy(false);
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
        return;
      }
      await onRegistered(result.provider.provider.id, result.provider.provider.name);
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

  return (
    <ModalSurface labelledBy="provider-setup-title" onCancel={onCancel} open={open}>
      <form className="provider-page__modal-content" onSubmit={(event) => void register(event)}>
        <div>
          <span className="provider-page__eyebrow">Step {validation?.valid === true ? "2" : "1"} of 2</span>
          <h2 id="provider-setup-title">Add {capability === "event-source" ? "event source" : "TTS provider"}</h2>
        </div>
        <div className="provider-page__form">
          <label>
            <span>Provider type</span>
            <select value={draft.kind} onChange={(event) => changeKind(event.currentTarget.value as ProviderKind)}>
              {allowedKinds.map((kind) => <option key={kind} value={kind}>{formatProviderKind(kind)}</option>)}
            </select>
          </label>
          <label>
            <span>Provider name</span>
            <input onChange={(event) => updateDraft({ ...draft, name: event.currentTarget.value })} required value={draft.name} />
          </label>
          {websocket ? (
            <>
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

        {requestError === null ? null : <ManagementErrorBanner error={requestError} />}
        {validation?.error === null || validation?.error === undefined ? null : <ManagementErrorBanner error={validation.error} />}
        {validation?.valid === true ? <p className="provider-page__notice" role="status">Connection test passed.</p> : null}

        <div className="provider-page__actions">
          <button className="provider-page__secondary-action" disabled={busy} onClick={onCancel} type="button">Cancel</button>
          <button className="provider-page__secondary-action" disabled={busy || draft.name.trim().length === 0} onClick={() => void validate()} type="button">
            {busy ? "Testing..." : "Test connection"}
          </button>
          <button disabled={busy || validation?.valid !== true} type="submit">Register provider</button>
        </div>
      </form>
    </ModalSurface>
  );
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

function intakeTone(state: RegisteredProviderView["intakeState"]): StatusBadgeTone {
  return state === "active" ? "positive" : state === "error" ? "negative" : "neutral";
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
