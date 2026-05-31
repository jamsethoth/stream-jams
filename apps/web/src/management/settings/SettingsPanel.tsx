import { useEffect, useState, type FormEvent } from "react";
import type { ManagementApi, ModerationSettingsView, ServerConfigView } from "../management-api.js";

export interface SettingsPanelProps {
  readonly managementApi: Pick<
    ManagementApi,
    "getServerConfig" | "updateServerConfig" | "getModerationSettings" | "updateModerationSettings"
  >;
}

const defaultServerConfig: ServerConfigView = { host: "127.0.0.1", port: 39187 };

export function SettingsPanel({ managementApi }: SettingsPanelProps) {
  const [savedConfig, setSavedConfig] = useState<ServerConfigView>(defaultServerConfig);
  const [configDraft, setConfigDraft] = useState<ServerConfigView>(defaultServerConfig);
  const [moderation, setModeration] = useState<ModerationSettingsView>(defaultModerationSettings);
  const [blockedTermsText, setBlockedTermsText] = useState("");
  const [diagnostic, setDiagnostic] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([managementApi.getServerConfig(), managementApi.getModerationSettings()])
      .then(([loadedConfig, loadedModeration]) => {
        if (!cancelled) {
          setSavedConfig(loadedConfig);
          setConfigDraft(loadedConfig);
          setModeration(loadedModeration);
          setBlockedTermsText(loadedModeration.renderedText.blockedTerms.join("\n"));
          setDiagnostic(null);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setDiagnostic(readErrorMessage(error, "Unable to load settings."));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [managementApi]);

  async function handleServerSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const savedServerConfig = await managementApi.updateServerConfig(configDraft);
      setSavedConfig(savedServerConfig);
      setConfigDraft(savedServerConfig);
      setDiagnostic("Server settings saved.");
    } catch (error) {
      setDiagnostic(readErrorMessage(error, "Unable to update server settings."));
    }
  }

  async function handleModerationSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const blockedTerms = parseBlockedTerms(blockedTermsText);
    const nextModeration = {
      renderedText: {
        ...moderation.renderedText,
        blockedTerms
      },
      ttsText: {
        ...moderation.ttsText,
        blockedTerms
      }
    };

    try {
      const savedModeration = await managementApi.updateModerationSettings(nextModeration);
      setModeration(savedModeration);
      setBlockedTermsText(savedModeration.renderedText.blockedTerms.join("\n"));
      setDiagnostic("Moderation settings saved.");
    } catch (error) {
      setDiagnostic(readErrorMessage(error, "Unable to update moderation settings."));
    }
  }

  return (
    <section className="management-panel" aria-labelledby="settings-title">
      <div className="management-panel__header">
        <div>
          <h2 id="settings-title">Settings</h2>
          <p>{savedConfig.host + ":" + savedConfig.port}</p>
        </div>
      </div>
      {diagnostic !== null ? <p className="management-diagnostic">{diagnostic}</p> : null}
      <form className="management-form" onSubmit={handleServerSubmit}>
        <label>
          <span>Host</span>
          <input
            value={configDraft.host}
            onChange={(event) => setConfigDraft({ ...configDraft, host: event.currentTarget.value })}
          />
        </label>
        <label>
          <span>Port</span>
          <input
            min={1}
            max={65535}
            type="number"
            value={configDraft.port}
            onChange={(event) => setConfigDraft({ ...configDraft, port: Number(event.currentTarget.value) })}
          />
        </label>
        <button type="submit">Save server settings</button>
      </form>
      <section className="management-subsection" aria-labelledby="moderation-settings-title">
        <h3 id="moderation-settings-title">Moderation</h3>
        <form className="management-form management-form--wide" onSubmit={handleModerationSubmit}>
          <label className="management-form__wide-field">
            <span>Blocked terms</span>
            <textarea value={blockedTermsText} onChange={(event) => setBlockedTermsText(event.currentTarget.value)} />
          </label>
          <label className="management-toggle">
            <input
              checked={moderation.renderedText.stripUrls}
              onChange={(event) =>
                setModeration({
                  ...moderation,
                  renderedText: { ...moderation.renderedText, stripUrls: event.currentTarget.checked }
                })
              }
              type="checkbox"
            />
            Strip rendered URLs
          </label>
          <label className="management-toggle">
            <input
              checked={moderation.ttsText.stripUrls}
              onChange={(event) =>
                setModeration({
                  ...moderation,
                  ttsText: { ...moderation.ttsText, stripUrls: event.currentTarget.checked }
                })
              }
              type="checkbox"
            />
            Strip TTS URLs
          </label>
          <button type="submit">Save moderation settings</button>
        </form>
      </section>
    </section>
  );
}

function parseBlockedTerms(value: string): readonly string[] {
  const seen = new Set<string>();
  const blockedTerms: string[] = [];

  for (const term of value.split(/\r?\n/).map((candidate) => candidate.trim())) {
    const key = term.toLocaleLowerCase();
    if (term.length === 0 || seen.has(key)) {
      continue;
    }

    seen.add(key);
    blockedTerms.push(term);
  }

  return blockedTerms;
}

function readErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

const defaultModerationSettings: ModerationSettingsView = {
  renderedText: {
    maxLength: 240,
    blockedTerms: [],
    stripUrls: false
  },
  ttsText: {
    maxLength: 180,
    blockedTerms: [],
    stripUrls: true
  }
};
