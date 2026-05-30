import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { ManagementApi, TtsProviderView, TtsTestRequestView, TtsTestResultView } from "../management-api.js";

export interface TtsPanelProps {
  readonly managementApi: Pick<ManagementApi, "listTtsProviders" | "testTts">;
}

export function TtsPanel({ managementApi }: TtsPanelProps) {
  const [providers, setProviders] = useState<readonly TtsProviderView[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<string>("");
  const [sampleText, setSampleText] = useState("Sample cheer from Viewer for 500 bits");
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>("");
  const [rate, setRate] = useState(1);
  const [pitch, setPitch] = useState(1);
  const [volume, setVolume] = useState(1);
  const [lastResult, setLastResult] = useState<TtsTestResultView | null>(null);
  const [diagnostic, setDiagnostic] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void managementApi
      .listTtsProviders()
      .then((loadedProviders) => {
        if (!cancelled) {
          setProviders(loadedProviders);
          setSelectedProviderId((currentProviderId) => currentProviderId || loadedProviders[0]?.id || "");
          setDiagnostic(null);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setDiagnostic(readErrorMessage(error, "Unable to load TTS providers."));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [managementApi]);

  const selectedProvider = useMemo(
    () => providers.find((provider) => provider.id === selectedProviderId) ?? providers[0] ?? null,
    [providers, selectedProviderId]
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedProvider === null) {
      return;
    }

    const request: TtsTestRequestView = {
      providerId: selectedProvider.id,
      text: sampleText,
      metadata: {
        sampleEventType: "cheer",
        sampleAmount: 500,
        sampleActor: "Viewer"
      },
      ...(selectedProvider.capabilities.supportsVoices && selectedVoiceId !== "" ? { voiceId: selectedVoiceId } : {}),
      ...(selectedProvider.capabilities.supportsRate ? { rate } : {}),
      ...(selectedProvider.capabilities.supportsPitch ? { pitch } : {}),
      ...(selectedProvider.capabilities.supportsVolume ? { volume } : {})
    };

    try {
      const result = await managementApi.testTts(request);
      setLastResult(result);
      setDiagnostic("TTS test ready: " + result.instruction.mode + ".");
    } catch (error) {
      setLastResult(null);
      setDiagnostic(readErrorMessage(error, "Unable to run TTS test."));
    }
  }

  return (
    <section className="management-panel" aria-labelledby="tts-title">
      <div className="management-panel__header">
        <div>
          <h2 id="tts-title">TTS</h2>
          <p>{formatProviderCount(providers.length)}</p>
        </div>
      </div>
      {diagnostic !== null ? <p className="management-diagnostic">{diagnostic}</p> : null}
      {selectedProvider === null ? <p className="management-empty">No TTS providers registered.</p> : null}
      {selectedProvider === null ? null : (
        <>
          <div className="management-module-list">
            {providers.map((provider) => (
              <article className="management-module" key={provider.id}>
                <div className="management-row">
                  <div>
                    <h3>{provider.label}</h3>
                    <p>{provider.id}</p>
                  </div>
                  <strong>{provider.capabilities.playbackMode}</strong>
                </div>
                <ul className="management-list">
                  <li>
                    <span>Voices</span>
                    <strong>{provider.capabilities.supportsVoices ? provider.voices.length + " available" : "Unavailable"}</strong>
                  </li>
                  <li>
                    <span>Rate</span>
                    <strong>{provider.capabilities.supportsRate ? "Supported" : "Unavailable"}</strong>
                  </li>
                  <li>
                    <span>Pitch</span>
                    <strong>{provider.capabilities.supportsPitch ? "Supported" : "Unavailable"}</strong>
                  </li>
                  <li>
                    <span>Volume</span>
                    <strong>{provider.capabilities.supportsVolume ? "Supported" : "Unavailable"}</strong>
                  </li>
                </ul>
              </article>
            ))}
          </div>
          <section className="management-subsection" aria-labelledby="tts-test-title">
            <h3 id="tts-test-title">Test Action</h3>
            <form className="management-form management-form--wide" onSubmit={handleSubmit}>
              <label>
                <span>Provider</span>
                <select value={selectedProvider.id} onChange={(event) => setSelectedProviderId(event.currentTarget.value)}>
                  {providers.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="management-form__wide-field">
                <span>Sample text</span>
                <textarea value={sampleText} onChange={(event) => setSampleText(event.currentTarget.value)} />
              </label>
              {selectedProvider.capabilities.supportsVoices && selectedProvider.voices.length > 0 ? (
                <label>
                  <span>Voice</span>
                  <select value={selectedVoiceId} onChange={(event) => setSelectedVoiceId(event.currentTarget.value)}>
                    <option value="">Default</option>
                    {selectedProvider.voices.map((voice) => (
                      <option key={voice.id} value={voice.id}>
                        {voice.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {selectedProvider.capabilities.supportsRate ? (
                <label>
                  <span>Rate</span>
                  <input
                    max={2}
                    min={0.5}
                    onChange={(event) => setRate(Number(event.currentTarget.value))}
                    step={0.1}
                    type="number"
                    value={rate}
                  />
                </label>
              ) : null}
              {selectedProvider.capabilities.supportsPitch ? (
                <label>
                  <span>Pitch</span>
                  <input
                    max={2}
                    min={0}
                    onChange={(event) => setPitch(Number(event.currentTarget.value))}
                    step={0.1}
                    type="number"
                    value={pitch}
                  />
                </label>
              ) : null}
              {selectedProvider.capabilities.supportsVolume ? (
                <label>
                  <span>Volume</span>
                  <input
                    max={1}
                    min={0}
                    onChange={(event) => setVolume(Number(event.currentTarget.value))}
                    step={0.1}
                    type="number"
                    value={volume}
                  />
                </label>
              ) : null}
              <button type="submit">Run TTS test</button>
            </form>
          </section>
          {lastResult === null ? null : (
            <p className="management-diagnostic">Last instruction text: {lastResult.instruction.text}</p>
          )}
        </>
      )}
    </section>
  );
}

function formatProviderCount(count: number): string {
  if (count === 0) {
    return "No providers loaded";
  }

  return count === 1 ? "1 provider available" : count + " providers available";
}

function readErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
