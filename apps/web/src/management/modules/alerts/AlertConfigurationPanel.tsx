import { useEffect, useState, type FormEvent } from "react";
import { AlertRulesList } from "../../alerts/AlertRulesList.js";
import { AlertCollectionsList } from "../../collections/AlertCollectionsList.js";
import type { AlertCollection, AlertConfigurationApi, AlertEventType, AlertRule, CreateAlertRuleInput } from "./alert-api.js";
export type { AlertConfigurationApi } from "./alert-api.js";

export interface AlertConfigurationPanelProps {
  readonly alertApi: AlertConfigurationApi;
}

type LoadState = "loading" | "ready" | "saving";

const alertEventTypes: readonly AlertEventType[] = [
  "follow",
  "subscription",
  "resubscription",
  "cheer",
  "raid",
  "channel_point_redemption"
];

export function AlertConfigurationPanel({ alertApi }: AlertConfigurationPanelProps) {
  const [collections, setCollections] = useState<readonly AlertCollection[]>([]);
  const [rules, setRules] = useState<readonly AlertRule[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [diagnostic, setDiagnostic] = useState<string | null>(null);
  const [collectionName, setCollectionName] = useState("");
  const [collectionEnabled, setCollectionEnabled] = useState(true);
  const [ruleName, setRuleName] = useState("");
  const [ruleEventType, setRuleEventType] = useState<AlertEventType>("follow");
  const [ruleCollectionId, setRuleCollectionId] = useState("");
  const [ruleTextTemplate, setRuleTextTemplate] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadConfiguration() {
      setLoadState("loading");
      try {
        const [loadedCollections, loadedRules] = await Promise.all([
          alertApi.listCollections(),
          alertApi.listRules()
        ]);
        if (!cancelled) {
          setCollections(loadedCollections);
          setRules(loadedRules);
          syncSelectedCollection(loadedCollections);
          setDiagnostic(null);
          setLoadState("ready");
        }
      } catch (error) {
        if (!cancelled) {
          setDiagnostic(readErrorMessage(error));
          setLoadState("ready");
        }
      }
    }

    void loadConfiguration();

    return () => {
      cancelled = true;
    };
  }, [alertApi]);

  async function refresh() {
    const [loadedCollections, loadedRules] = await Promise.all([alertApi.listCollections(), alertApi.listRules()]);
    setCollections(loadedCollections);
    setRules(loadedRules);
    syncSelectedCollection(loadedCollections);
  }

  function syncSelectedCollection(nextCollections: readonly AlertCollection[], preferredCollectionId = ruleCollectionId) {
    if (nextCollections.length === 0) {
      setRuleCollectionId("");
      return;
    }

    if (nextCollections.some((collection) => collection.id === preferredCollectionId)) {
      setRuleCollectionId(preferredCollectionId);
      return;
    }

    setRuleCollectionId(nextCollections[0]?.id ?? "");
  }

  async function createCollection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = collectionName.trim();
    if (name === "") {
      setDiagnostic("Collection name is required.");
      return;
    }

    setLoadState("saving");
    try {
      const created = await alertApi.createCollection({ name, enabled: collectionEnabled });
      setCollectionName("");
      const loadedCollections = await alertApi.listCollections();
      const loadedRules = await alertApi.listRules();
      setCollections(loadedCollections);
      setRules(loadedRules);
      syncSelectedCollection(loadedCollections, created.id);
      setDiagnostic("Alert collection created.");
    } catch (error) {
      setDiagnostic(readErrorMessage(error));
    } finally {
      setLoadState("ready");
    }
  }

  async function createRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = ruleName.trim();
    const textTemplate = ruleTextTemplate.trim();
    if (name === "") {
      setDiagnostic("Rule name is required.");
      return;
    }

    if (ruleCollectionId === "") {
      setDiagnostic("Rule collection is required.");
      return;
    }

    if (textTemplate === "") {
      setDiagnostic("Alert text is required.");
      return;
    }

    setLoadState("saving");
    try {
      await alertApi.createRule(createDefaultRuleInput({
        collectionId: ruleCollectionId,
        eventType: ruleEventType,
        name,
        textTemplate
      }));
      setRuleName("");
      setRuleTextTemplate("");
      await refresh();
      setDiagnostic("Alert rule created.");
    } catch (error) {
      setDiagnostic(readErrorMessage(error));
    } finally {
      setLoadState("ready");
    }
  }

  async function toggleCollection(collectionId: string, enabled: boolean) {
    setLoadState("saving");
    try {
      await alertApi.setCollectionEnabled(collectionId, enabled);
      await refresh();
      setDiagnostic("Collection updated.");
    } catch (error) {
      setDiagnostic(readErrorMessage(error));
    } finally {
      setLoadState("ready");
    }
  }

  async function toggleRule(ruleId: string, enabled: boolean) {
    setLoadState("saving");
    try {
      await alertApi.setRuleEnabled(ruleId, enabled);
      await refresh();
      setDiagnostic("Rule updated.");
    } catch (error) {
      setDiagnostic(readErrorMessage(error));
    } finally {
      setLoadState("ready");
    }
  }

  const controlsDisabled = loadState === "loading" || loadState === "saving";
  const ruleCreationDisabled = controlsDisabled || collections.length === 0;

  return (
    <section className="alert-panel" aria-labelledby="alert-panel-title">
      <div className="management-panel__header">
        <div>
          <h2 id="alert-panel-title">Alerts</h2>
          <p>
            {collections.length} collections, {rules.length} rules
          </p>
        </div>
      </div>

      {diagnostic !== null ? <p className="management-diagnostic">{diagnostic}</p> : null}
      {loadState === "loading" ? <p className="management-empty">Loading alert configuration...</p> : null}

      <div className="alert-panel__forms">
        <form aria-label="Create alert collection" className="management-form" onSubmit={createCollection}>
          <label>
            <span>Collection name</span>
            <input
              disabled={controlsDisabled}
              onChange={(event) => setCollectionName(event.currentTarget.value)}
              required
              value={collectionName}
            />
          </label>
          <label className="management-toggle">
            <input
              checked={collectionEnabled}
              disabled={controlsDisabled}
              onChange={(event) => setCollectionEnabled(event.currentTarget.checked)}
              type="checkbox"
            />
            Collection enabled
          </label>
          <button disabled={controlsDisabled} type="submit">Create collection</button>
        </form>

        <form aria-label="Create alert rule" className="management-form management-form--wide" onSubmit={createRule}>
          <label>
            <span>Rule name</span>
            <input
              disabled={ruleCreationDisabled}
              onChange={(event) => setRuleName(event.currentTarget.value)}
              required
              value={ruleName}
            />
          </label>
          <label>
            <span>Event type</span>
            <select
              disabled={ruleCreationDisabled}
              onChange={(event) => setRuleEventType(event.currentTarget.value as AlertEventType)}
              value={ruleEventType}
            >
              {alertEventTypes.map((eventType) => (
                <option key={eventType} value={eventType}>
                  {formatEventType(eventType)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Collection for rule</span>
            <select
              disabled={ruleCreationDisabled}
              onChange={(event) => setRuleCollectionId(event.currentTarget.value)}
              required
              value={ruleCollectionId}
            >
              {collections.map((collection) => (
                <option key={collection.id} value={collection.id}>
                  {collection.name}
                </option>
              ))}
            </select>
          </label>
          <label className="management-form__wide-field">
            <span>Alert text</span>
            <input
              disabled={ruleCreationDisabled}
              onChange={(event) => setRuleTextTemplate(event.currentTarget.value)}
              required
              value={ruleTextTemplate}
            />
          </label>
          <button disabled={ruleCreationDisabled} type="submit">Create alert rule</button>
        </form>
      </div>

      <div className="alert-panel__grid">
        <section aria-labelledby="alert-collections-title">
          <h3 id="alert-collections-title">Collections</h3>
          <AlertCollectionsList
            collections={collections}
            disabled={controlsDisabled}
            onToggle={toggleCollection}
          />
        </section>

        <section aria-labelledby="alert-rules-title">
          <h3 id="alert-rules-title">Rules</h3>
          <AlertRulesList disabled={controlsDisabled} onToggle={toggleRule} rules={rules} />
        </section>
      </div>
    </section>
  );
}

function createDefaultRuleInput(input: {
  readonly collectionId: string;
  readonly eventType: AlertEventType;
  readonly name: string;
  readonly textTemplate: string;
}): CreateAlertRuleInput {
  return {
    name: input.name,
    eventType: input.eventType,
    enabled: true,
    collectionIds: [input.collectionId],
    conditions: [],
    variants: [
      {
        name: "Default",
        enabled: true,
        weight: 1,
        visualAssetId: null,
        audioAssetId: null,
        textTemplate: input.textTemplate,
        ttsConfig: null,
        durationMs: 4000,
        layout: {
          x: 40,
          y: 32,
          width: 420,
          height: 96,
          zIndex: 10
        }
      }
    ],
    cooldownSeconds: 0,
    priority: 10
  };
}

function formatEventType(eventType: string): string {
  return eventType.replaceAll("_", " ");
}

function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Alert configuration operation failed.";
}
