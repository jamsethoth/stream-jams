import { useEffect, useState, type FormEvent } from "react";
import type { AssetApi, AssetRecord } from "../../assets/asset-api.js";
import { AlertRulesList } from "../../alerts/AlertRulesList.js";
import { AlertCollectionsList } from "../../collections/AlertCollectionsList.js";
import type {
  AlertCollection,
  AlertCondition,
  AlertConfigurationApi,
  AlertEventType,
  AlertRule,
  AlertTestEventInput,
  AlertVariant,
  CreateAlertRuleInput,
  UpdateAlertRuleInput
} from "./alert-api.js";
export type { AlertConfigurationApi } from "./alert-api.js";

export interface AlertConfigurationPanelProps {
  readonly alertApi: AlertConfigurationApi;
  readonly assetApi: AssetApi;
}

type LoadState = "loading" | "ready" | "saving" | "testing";
type ConditionField = AlertCondition["field"];
type ConditionOperator = AlertCondition["operator"];

interface ConditionFieldOption {
  readonly field: ConditionField;
  readonly label: string;
  readonly eventTypes: readonly AlertEventType[];
  readonly operators: readonly ConditionOperator[];
  readonly defaultValue: string;
  readonly valueKind: "number" | "text";
}

interface ConditionDraft {
  readonly field: ConditionField;
  readonly operator: ConditionOperator;
  readonly value: string;
  readonly rangeMax: string;
}

interface VariantDraft {
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
  readonly weight: string;
  readonly priority: string;
  readonly visualAssetId: string;
  readonly audioAssetId: string;
  readonly textTemplate: string;
  readonly durationMs: string;
  readonly layout: {
    readonly x: string;
    readonly y: string;
    readonly width: string;
    readonly height: string;
    readonly zIndex: string;
  };
}

interface RuleDraft {
  readonly id: string;
  readonly name: string;
  readonly eventType: AlertEventType;
  readonly enabled: boolean;
  readonly collectionIds: readonly string[];
  readonly conditions: readonly ConditionDraft[];
  readonly variants: readonly VariantDraft[];
  readonly cooldownSeconds: string;
  readonly priority: string;
}

const alertEventTypes: readonly AlertEventType[] = [
  "follow",
  "subscription",
  "resubscription",
  "cheer",
  "raid",
  "channel_point_redemption"
];

const conditionFieldOptions: readonly ConditionFieldOption[] = [
  {
    field: "amount",
    label: "Amount",
    eventTypes: ["subscription", "resubscription", "cheer", "raid"],
    operators: ["equals", "min", "max", "range"],
    defaultValue: "100",
    valueKind: "number"
  },
  {
    field: "tier",
    label: "Subscription tier",
    eventTypes: ["subscription", "resubscription"],
    operators: ["equals"],
    defaultValue: "1000",
    valueKind: "text"
  },
  {
    field: "rewardId",
    label: "Reward ID",
    eventTypes: ["channel_point_redemption"],
    operators: ["equals", "includes"],
    defaultValue: "reward_hydrate",
    valueKind: "text"
  }
];

export function AlertConfigurationPanel({ alertApi, assetApi }: AlertConfigurationPanelProps) {
  const [collections, setCollections] = useState<readonly AlertCollection[]>([]);
  const [rules, setRules] = useState<readonly AlertRule[]>([]);
  const [assets, setAssets] = useState<readonly AssetRecord[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [diagnostic, setDiagnostic] = useState<string | null>(null);
  const [collectionName, setCollectionName] = useState("");
  const [collectionEnabled, setCollectionEnabled] = useState(true);
  const [selectedCollectionId, setSelectedCollectionId] = useState("");
  const [collectionDraftName, setCollectionDraftName] = useState("");
  const [collectionDraftEnabled, setCollectionDraftEnabled] = useState(true);
  const [ruleName, setRuleName] = useState("");
  const [ruleEventType, setRuleEventType] = useState<AlertEventType>("follow");
  const [ruleCollectionId, setRuleCollectionId] = useState("");
  const [ruleTextTemplate, setRuleTextTemplate] = useState("");
  const [selectedRuleId, setSelectedRuleId] = useState("");
  const [ruleDraft, setRuleDraft] = useState<RuleDraft | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadConfiguration() {
      setLoadState("loading");
      try {
        const [loadedCollections, loadedRules, loadedAssets] = await Promise.all([
          alertApi.listCollections(),
          alertApi.listRules(),
          assetApi.listAssets()
        ]);
        if (!cancelled) {
          setCollections(loadedCollections);
          setRules(loadedRules);
          setAssets(loadedAssets);
          setSelectedCollectionId(selectExistingId(loadedCollections, selectedCollectionId));
          setSelectedRuleId(selectExistingId(loadedRules, selectedRuleId));
          syncSelectedCollection(loadedCollections, ruleCollectionId);
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
  }, [alertApi, assetApi]);

  useEffect(() => {
    const selectedCollection = collections.find((collection) => collection.id === selectedCollectionId);
    setCollectionDraftName(selectedCollection?.name ?? "");
    setCollectionDraftEnabled(selectedCollection?.enabled ?? true);
  }, [collections, selectedCollectionId]);

  useEffect(() => {
    const selectedRule = rules.find((rule) => rule.id === selectedRuleId);
    setRuleDraft(selectedRule === undefined ? null : createRuleDraft(selectedRule));
  }, [rules, selectedRuleId]);

  async function refresh(preferredCollectionId = selectedCollectionId, preferredRuleId = selectedRuleId) {
    const [loadedCollections, loadedRules, loadedAssets] = await Promise.all([
      alertApi.listCollections(),
      alertApi.listRules(),
      assetApi.listAssets()
    ]);
    setCollections(loadedCollections);
    setRules(loadedRules);
    setAssets(loadedAssets);
    setSelectedCollectionId(selectExistingId(loadedCollections, preferredCollectionId));
    setSelectedRuleId(selectExistingId(loadedRules, preferredRuleId));
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
      await refresh(created.id, selectedRuleId);
      setDiagnostic("Alert collection created.");
    } catch (error) {
      setDiagnostic(readErrorMessage(error));
    } finally {
      setLoadState("ready");
    }
  }

  async function saveCollection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const selectedCollection = collections.find((collection) => collection.id === selectedCollectionId);
    if (selectedCollection === undefined) {
      setDiagnostic("Choose a collection to edit.");
      return;
    }

    const name = collectionDraftName.trim();
    if (name === "") {
      setDiagnostic("Collection name is required.");
      return;
    }

    setLoadState("saving");
    try {
      await alertApi.updateCollection(selectedCollection.id, {
        name,
        enabled: collectionDraftEnabled
      });
      await refresh(selectedCollection.id, selectedRuleId);
      setDiagnostic("Collection saved.");
    } catch (error) {
      setDiagnostic(readErrorMessage(error));
    } finally {
      setLoadState("ready");
    }
  }

  async function deleteCollection() {
    const selectedCollection = collections.find((collection) => collection.id === selectedCollectionId);
    if (selectedCollection === undefined) {
      setDiagnostic("Choose a collection to delete.");
      return;
    }

    const referencingRules = rules.filter((rule) => rule.collectionIds.includes(selectedCollection.id)).length;
    const confirmed = confirmImpact(
      `Delete collection "${selectedCollection.name}"?\n\nImpact: removes membership links from ${referencingRules} alert rules. Alert rules and variants are not deleted.`
    );
    if (!confirmed) {
      return;
    }

    setLoadState("saving");
    try {
      await alertApi.deleteCollection(selectedCollection.id);
      await refresh("", selectedRuleId);
      setDiagnostic("Collection deleted.");
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
      const created = await alertApi.createRule(createDefaultRuleInput({
        collectionId: ruleCollectionId,
        eventType: ruleEventType,
        name,
        textTemplate
      }));
      setRuleName("");
      setRuleTextTemplate("");
      await refresh(selectedCollectionId, created.id);
      setDiagnostic("Alert rule created.");
    } catch (error) {
      setDiagnostic(readErrorMessage(error));
    } finally {
      setLoadState("ready");
    }
  }

  async function saveRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (ruleDraft === null) {
      setDiagnostic("Choose a rule to edit.");
      return;
    }

    let input: UpdateAlertRuleInput;
    try {
      input = toUpdateRuleInput(ruleDraft);
    } catch (error) {
      setDiagnostic(readErrorMessage(error));
      return;
    }

    setLoadState("saving");
    try {
      await alertApi.updateRule(ruleDraft.id, input);
      await refresh(selectedCollectionId, ruleDraft.id);
      setDiagnostic("Alert rule saved.");
    } catch (error) {
      setDiagnostic(readErrorMessage(error));
    } finally {
      setLoadState("ready");
    }
  }

  async function deleteRule() {
    if (ruleDraft === null) {
      setDiagnostic("Choose a rule to delete.");
      return;
    }

    const confirmed = confirmImpact(
      `Delete rule "${ruleDraft.name}"?\n\nImpact: deletes ${ruleDraft.conditions.length} conditions and ${ruleDraft.variants.length} variants for this rule. Collections are not deleted.`
    );
    if (!confirmed) {
      return;
    }

    setLoadState("saving");
    try {
      await alertApi.deleteRule(ruleDraft.id);
      await refresh(selectedCollectionId, "");
      setDiagnostic("Alert rule deleted.");
    } catch (error) {
      setDiagnostic(readErrorMessage(error));
    } finally {
      setLoadState("ready");
    }
  }

  async function deleteVariant(variant: VariantDraft) {
    if (ruleDraft === null) {
      return;
    }

    if (ruleDraft.variants.length <= 1) {
      setDiagnostic("Alert rules must keep at least one variant.");
      return;
    }

    const confirmed = confirmImpact(
      `Delete variant "${variant.name}"?\n\nImpact: removes only this variant from rule "${ruleDraft.name}".`
    );
    if (!confirmed) {
      return;
    }

    const persisted = rules
      .find((rule) => rule.id === ruleDraft.id)
      ?.variants.some((candidate) => candidate.id === variant.id) ?? false;
    if (!persisted) {
      updateRuleDraft({
        variants: ruleDraft.variants.filter((candidate) => candidate.id !== variant.id)
      });
      return;
    }

    setLoadState("saving");
    try {
      await alertApi.deleteVariant(ruleDraft.id, variant.id);
      await refresh(selectedCollectionId, ruleDraft.id);
      setDiagnostic("Alert variant deleted.");
    } catch (error) {
      setDiagnostic(readErrorMessage(error));
    } finally {
      setLoadState("ready");
    }
  }

  async function testRule() {
    const selectedRule = rules.find((rule) => rule.id === selectedRuleId);
    if (selectedRule === undefined) {
      setDiagnostic("Choose a saved rule to test.");
      return;
    }

    setLoadState("testing");
    try {
      const result = await alertApi.testAlert(createSampleEvent(selectedRule));
      setDiagnostic(formatTestResult(result.status));
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
      await refresh(collectionId, selectedRuleId);
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
      await refresh(selectedCollectionId, ruleId);
      setDiagnostic("Rule updated.");
    } catch (error) {
      setDiagnostic(readErrorMessage(error));
    } finally {
      setLoadState("ready");
    }
  }

  function updateRuleDraft(update: Partial<RuleDraft>) {
    setRuleDraft((current) => current === null ? null : { ...current, ...update });
  }

  function updateCondition(index: number, update: Partial<ConditionDraft>) {
    if (ruleDraft === null) {
      return;
    }

    updateRuleDraft({
      conditions: ruleDraft.conditions.map((condition, candidateIndex) =>
        candidateIndex === index ? { ...condition, ...update } : condition
      )
    });
  }

  function updateVariant(index: number, update: Partial<VariantDraft>) {
    if (ruleDraft === null) {
      return;
    }

    updateRuleDraft({
      variants: ruleDraft.variants.map((variant, candidateIndex) =>
        candidateIndex === index ? { ...variant, ...update } : variant
      )
    });
  }

  function updateVariantLayout(index: number, update: Partial<VariantDraft["layout"]>) {
    if (ruleDraft === null) {
      return;
    }

    const variant = ruleDraft.variants[index];
    if (variant === undefined) {
      return;
    }

    updateVariant(index, {
      layout: {
        ...variant.layout,
        ...update
      }
    });
  }

  function changeConditionField(index: number, field: ConditionField) {
    const option = getConditionFieldOption(field);
    updateCondition(index, {
      field,
      operator: option.operators[0] ?? "equals",
      value: option.defaultValue,
      rangeMax: option.valueKind === "number" ? String(Number(option.defaultValue) + 100) : ""
    });
  }

  const controlsDisabled = loadState === "loading" || loadState === "saving" || loadState === "testing";
  const ruleCreationDisabled = controlsDisabled || collections.length === 0;
  const visualAssets = assets.filter((asset) => asset.mediaType === "image" || asset.mediaType === "gif" || asset.mediaType === "video");
  const audioAssets = assets.filter((asset) => asset.mediaType === "audio");

  return (
    <section className="alert-panel" aria-labelledby="alert-panel-title">
      <div className="management-panel__header">
        <div>
          <h2 id="alert-panel-title">Alerts</h2>
          <p>
            {collections.length} collections, {rules.length} rules, {assets.length} assets
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

      <section className="alert-editor" aria-labelledby="alert-collection-editor-title">
        <h3 id="alert-collection-editor-title">Edit collection</h3>
        {collections.length === 0 ? (
          <p className="management-empty">Create a collection before editing collection details.</p>
        ) : (
          <form className="management-form" onSubmit={saveCollection}>
            <label>
              <span>Collection to edit</span>
              <select
                disabled={controlsDisabled}
                onChange={(event) => setSelectedCollectionId(event.currentTarget.value)}
                value={selectedCollectionId}
              >
                {collections.map((collection) => (
                  <option key={collection.id} value={collection.id}>
                    {collection.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Collection name</span>
              <input
                disabled={controlsDisabled}
                onChange={(event) => setCollectionDraftName(event.currentTarget.value)}
                required
                value={collectionDraftName}
              />
            </label>
            <label className="management-toggle">
              <input
                checked={collectionDraftEnabled}
                disabled={controlsDisabled}
                onChange={(event) => setCollectionDraftEnabled(event.currentTarget.checked)}
                type="checkbox"
              />
              Collection enabled
            </label>
            <div className="management-actions">
              <button disabled={controlsDisabled} type="submit">Save collection</button>
              <button disabled={controlsDisabled} onClick={deleteCollection} type="button">Delete collection</button>
            </div>
          </form>
        )}
      </section>

      <section className="alert-editor" aria-labelledby="alert-rule-editor-title">
        <h3 id="alert-rule-editor-title">Edit rule</h3>
        {ruleDraft === null ? (
          <p className="management-empty">Create a rule before editing rule details.</p>
        ) : (
          <form className="alert-rule-editor" onSubmit={saveRule}>
            <div className="management-form">
              <label>
                <span>Rule to edit</span>
                <select
                  disabled={controlsDisabled}
                  onChange={(event) => setSelectedRuleId(event.currentTarget.value)}
                  value={selectedRuleId}
                >
                  {rules.map((rule) => (
                    <option key={rule.id} value={rule.id}>
                      {rule.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Rule name</span>
                <input
                  disabled={controlsDisabled}
                  onChange={(event) => updateRuleDraft({ name: event.currentTarget.value })}
                  required
                  value={ruleDraft.name}
                />
              </label>
              <label>
                <span>Event type</span>
                <select
                  disabled={controlsDisabled}
                  onChange={(event) =>
                    updateRuleDraft({
                      eventType: event.currentTarget.value as AlertEventType,
                      conditions: []
                    })
                  }
                  value={ruleDraft.eventType}
                >
                  {alertEventTypes.map((eventType) => (
                    <option key={eventType} value={eventType}>
                      {formatEventType(eventType)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="management-toggle">
                <input
                  checked={ruleDraft.enabled}
                  disabled={controlsDisabled}
                  onChange={(event) => updateRuleDraft({ enabled: event.currentTarget.checked })}
                  type="checkbox"
                />
                Rule enabled
              </label>
              <label>
                <span>Cooldown seconds</span>
                <input
                  disabled={controlsDisabled}
                  min="0"
                  onChange={(event) => updateRuleDraft({ cooldownSeconds: event.currentTarget.value })}
                  required
                  type="number"
                  value={ruleDraft.cooldownSeconds}
                />
              </label>
              <label>
                <span>Rule priority</span>
                <input
                  disabled={controlsDisabled}
                  onChange={(event) => updateRuleDraft({ priority: event.currentTarget.value })}
                  required
                  type="number"
                  value={ruleDraft.priority}
                />
              </label>
            </div>

            <fieldset className="alert-fieldset">
              <legend>Collections</legend>
              {collections.map((collection) => (
                <label className="management-toggle" key={collection.id}>
                  <input
                    checked={ruleDraft.collectionIds.includes(collection.id)}
                    disabled={controlsDisabled}
                    onChange={(event) =>
                      updateRuleDraft({
                        collectionIds: event.currentTarget.checked
                          ? [...ruleDraft.collectionIds, collection.id]
                          : ruleDraft.collectionIds.filter((collectionId) => collectionId !== collection.id)
                      })
                    }
                    type="checkbox"
                  />
                  {collection.name}
                </label>
              ))}
            </fieldset>

            {renderConditions(ruleDraft, controlsDisabled, updateCondition, changeConditionField, updateRuleDraft)}

            <fieldset className="alert-fieldset">
              <legend>Variants</legend>
              <div className="management-actions">
                <button
                  disabled={controlsDisabled}
                  onClick={() => updateRuleDraft({ variants: [...ruleDraft.variants, createDefaultVariantDraft()] })}
                  type="button"
                >
                  Add variant
                </button>
              </div>
              {ruleDraft.variants.map((variant, index) => (
                <article className="alert-variant-editor" key={variant.id}>
                  <div className="management-form">
                    <label>
                      <span>Variant name</span>
                      <input
                        disabled={controlsDisabled}
                        onChange={(event) => updateVariant(index, { name: event.currentTarget.value })}
                        required
                        value={variant.name}
                      />
                    </label>
                    <label className="management-toggle">
                      <input
                        checked={variant.enabled}
                        disabled={controlsDisabled}
                        onChange={(event) => updateVariant(index, { enabled: event.currentTarget.checked })}
                        type="checkbox"
                      />
                      Variant enabled
                    </label>
                    <label>
                      <span>Weight</span>
                      <input
                        disabled={controlsDisabled}
                        min="1"
                        onChange={(event) => updateVariant(index, { weight: event.currentTarget.value })}
                        required
                        type="number"
                        value={variant.weight}
                      />
                    </label>
                    <label>
                      <span>Variant priority</span>
                      <input
                        disabled={controlsDisabled}
                        onChange={(event) => updateVariant(index, { priority: event.currentTarget.value })}
                        type="number"
                        value={variant.priority}
                      />
                    </label>
                    <label>
                      <span>Duration milliseconds</span>
                      <input
                        disabled={controlsDisabled}
                        min="1"
                        onChange={(event) => updateVariant(index, { durationMs: event.currentTarget.value })}
                        required
                        type="number"
                        value={variant.durationMs}
                      />
                    </label>
                    <label>
                      <span>Visual asset</span>
                      <select
                        disabled={controlsDisabled}
                        onChange={(event) => updateVariant(index, { visualAssetId: event.currentTarget.value })}
                        value={variant.visualAssetId}
                      >
                        <option value="">No visual asset</option>
                        {visualAssets.map((asset) => (
                          <option key={asset.id} value={asset.id}>
                            {asset.originalFileName} ({asset.mediaType})
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Audio asset</span>
                      <select
                        disabled={controlsDisabled}
                        onChange={(event) => updateVariant(index, { audioAssetId: event.currentTarget.value })}
                        value={variant.audioAssetId}
                      >
                        <option value="">No audio asset</option>
                        {audioAssets.map((asset) => (
                          <option key={asset.id} value={asset.id}>
                            {asset.originalFileName} ({asset.mediaType})
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="management-form__wide-field">
                      <span>Alert text</span>
                      <textarea
                        disabled={controlsDisabled}
                        onChange={(event) => updateVariant(index, { textTemplate: event.currentTarget.value })}
                        required
                        value={variant.textTemplate}
                      />
                    </label>
                  </div>
                  <div className="alert-layout-editor">
                    {(["x", "y", "width", "height", "zIndex"] as const).map((field) => (
                      <label key={field}>
                        <span>{field}</span>
                        <input
                          disabled={controlsDisabled}
                          onChange={(event) => updateVariantLayout(index, { [field]: event.currentTarget.value })}
                          required
                          type="number"
                          value={variant.layout[field]}
                        />
                      </label>
                    ))}
                    <LayoutPreview layout={variant.layout} />
                  </div>
                  <div className="management-actions">
                    <button disabled={controlsDisabled} onClick={() => void deleteVariant(variant)} type="button">
                      Delete variant
                    </button>
                  </div>
                </article>
              ))}
            </fieldset>

            <div className="management-actions">
              <button disabled={controlsDisabled} type="submit">Save rule</button>
              <button disabled={controlsDisabled} onClick={() => void testRule()} type="button">Run saved test alert</button>
              <button disabled={controlsDisabled} onClick={deleteRule} type="button">Delete rule</button>
            </div>
          </form>
        )}
      </section>
    </section>
  );
}

function renderConditions(
  ruleDraft: RuleDraft,
  controlsDisabled: boolean,
  updateCondition: (index: number, update: Partial<ConditionDraft>) => void,
  changeConditionField: (index: number, field: ConditionField) => void,
  updateRuleDraft: (update: Partial<RuleDraft>) => void
) {
  const availableFields = conditionFieldOptions.filter((option) => option.eventTypes.includes(ruleDraft.eventType));
  return (
    <fieldset className="alert-fieldset">
      <legend>Conditions</legend>
      {availableFields.length === 0 ? (
        <p className="management-empty">No minimal condition fields are available for {formatEventType(ruleDraft.eventType)} alerts.</p>
      ) : null}
      <div className="management-actions">
        <button
          disabled={controlsDisabled || availableFields.length === 0}
          onClick={() =>
            updateRuleDraft({
              conditions: [...ruleDraft.conditions, createDefaultConditionDraft(ruleDraft.eventType)]
            })
          }
          type="button"
        >
          Add condition
        </button>
      </div>
      {ruleDraft.conditions.map((condition, index) => {
        const fieldOption = getConditionFieldOption(condition.field);
        return (
          <div className="alert-condition-row" key={`${condition.field}-${index}`}>
            <label>
              <span>Condition field</span>
              <select
                aria-label={`Condition ${index + 1} field`}
                disabled={controlsDisabled}
                onChange={(event) => changeConditionField(index, event.currentTarget.value as ConditionField)}
                value={condition.field}
              >
                {availableFields.map((option) => (
                  <option key={option.field} value={option.field}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Operator</span>
              <select
                aria-label={`Condition ${index + 1} operator`}
                disabled={controlsDisabled}
                onChange={(event) => updateCondition(index, { operator: event.currentTarget.value as ConditionOperator })}
                value={condition.operator}
              >
                {fieldOption.operators.map((operator) => (
                  <option key={operator} value={operator}>
                    {operator}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Value</span>
              <input
                aria-label={`Condition ${index + 1} value`}
                disabled={controlsDisabled}
                onChange={(event) => updateCondition(index, { value: event.currentTarget.value })}
                type={fieldOption.valueKind === "number" ? "number" : "text"}
                value={condition.value}
              />
            </label>
            {condition.operator === "range" ? (
              <label>
                <span>Max value</span>
                <input
                  aria-label={`Condition ${index + 1} max value`}
                  disabled={controlsDisabled}
                  onChange={(event) => updateCondition(index, { rangeMax: event.currentTarget.value })}
                  type="number"
                  value={condition.rangeMax}
                />
              </label>
            ) : null}
            <button
              disabled={controlsDisabled}
              onClick={() =>
                updateRuleDraft({
                  conditions: ruleDraft.conditions.filter((_, candidateIndex) => candidateIndex !== index)
                })
              }
              type="button"
            >
              Remove condition
            </button>
          </div>
        );
      })}
    </fieldset>
  );
}

function LayoutPreview({ layout }: { readonly layout: VariantDraft["layout"] }) {
  const x = readDraftNumber(layout.x, 0);
  const y = readDraftNumber(layout.y, 0);
  const width = readDraftNumber(layout.width, 1);
  const height = readDraftNumber(layout.height, 1);
  const left = clamp((x / 1920) * 100, 0, 98);
  const top = clamp((y / 1080) * 100, 0, 96);
  const previewWidth = clamp((width / 1920) * 100, 2, 100 - left);
  const previewHeight = clamp((height / 1080) * 100, 2, 100 - top);

  return (
    <div className="alert-layout-preview" aria-label="Static layout preview">
      <div
        className="alert-layout-preview__box"
        style={{
          height: `${previewHeight}%`,
          left: `${left}%`,
          top: `${top}%`,
          width: `${previewWidth}%`
        }}
      />
    </div>
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

function createRuleDraft(rule: AlertRule): RuleDraft {
  return {
    id: rule.id,
    name: rule.name,
    eventType: rule.eventType,
    enabled: rule.enabled,
    collectionIds: rule.collectionIds,
    conditions: rule.conditions.map(toConditionDraft),
    variants: rule.variants.map(toVariantDraft),
    cooldownSeconds: String(rule.cooldownSeconds),
    priority: String(rule.priority)
  };
}

function toVariantDraft(variant: AlertVariant): VariantDraft {
  return {
    id: variant.id,
    name: variant.name,
    enabled: variant.enabled,
    weight: String(variant.weight),
    priority: String(variant.priority ?? 0),
    visualAssetId: variant.visualAssetId ?? "",
    audioAssetId: variant.audioAssetId ?? "",
    textTemplate: variant.textTemplate,
    durationMs: String(variant.durationMs),
    layout: {
      x: String(variant.layout.x),
      y: String(variant.layout.y),
      width: String(variant.layout.width),
      height: String(variant.layout.height),
      zIndex: String(variant.layout.zIndex)
    }
  };
}

function toConditionDraft(condition: AlertCondition): ConditionDraft {
  return {
    field: condition.field,
    operator: condition.operator,
    value: Array.isArray(condition.value) ? String(condition.value[0]) : String(condition.value),
    rangeMax: Array.isArray(condition.value) ? String(condition.value[1]) : ""
  };
}

function createDefaultConditionDraft(eventType: AlertEventType): ConditionDraft {
  const option = conditionFieldOptions.find((candidate) => candidate.eventTypes.includes(eventType)) ?? conditionFieldOptions[0]!;
  return {
    field: option.field,
    operator: option.operators[0] ?? "equals",
    value: option.defaultValue,
    rangeMax: option.valueKind === "number" ? String(Number(option.defaultValue) + 100) : ""
  };
}

function createDefaultVariantDraft(): VariantDraft {
  return {
    id: "variant_ui_" + createDraftId(),
    name: "New variant",
    enabled: true,
    weight: "1",
    priority: "0",
    visualAssetId: "",
    audioAssetId: "",
    textTemplate: "Thanks {actor.displayName}!",
    durationMs: "4000",
    layout: {
      x: "40",
      y: "32",
      width: "420",
      height: "96",
      zIndex: "10"
    }
  };
}

function toUpdateRuleInput(draft: RuleDraft): UpdateAlertRuleInput {
  const name = draft.name.trim();
  if (name === "") {
    throw new Error("Rule name is required.");
  }

  if (draft.collectionIds.length === 0) {
    throw new Error("Choose at least one collection for the rule.");
  }

  if (draft.variants.length === 0) {
    throw new Error("Alert rules must keep at least one variant.");
  }

  return {
    name,
    eventType: draft.eventType,
    enabled: draft.enabled,
    collectionIds: draft.collectionIds,
    conditions: draft.conditions.map(toAlertCondition),
    variants: draft.variants.map(toAlertVariant),
    cooldownSeconds: readInteger(draft.cooldownSeconds, "Cooldown seconds", 0),
    priority: readInteger(draft.priority, "Rule priority")
  };
}

function toAlertVariant(draft: VariantDraft): AlertVariant {
  const name = draft.name.trim();
  const textTemplate = draft.textTemplate.trim();
  if (name === "") {
    throw new Error("Variant name is required.");
  }

  if (textTemplate === "") {
    throw new Error("Variant alert text is required.");
  }

  const priority = readInteger(draft.priority, "Variant priority");
  return {
    id: draft.id,
    name,
    enabled: draft.enabled,
    weight: readInteger(draft.weight, "Variant weight", 1),
    ...(priority === 0 ? {} : { priority }),
    visualAssetId: draft.visualAssetId === "" ? null : draft.visualAssetId,
    audioAssetId: draft.audioAssetId === "" ? null : draft.audioAssetId,
    textTemplate,
    ttsConfig: null,
    durationMs: readInteger(draft.durationMs, "Duration milliseconds", 1),
    layout: {
      x: readFiniteNumber(draft.layout.x, "Layout x"),
      y: readFiniteNumber(draft.layout.y, "Layout y"),
      width: readFiniteNumber(draft.layout.width, "Layout width", 1),
      height: readFiniteNumber(draft.layout.height, "Layout height", 1),
      zIndex: readInteger(draft.layout.zIndex, "Layout zIndex")
    }
  };
}

function toAlertCondition(draft: ConditionDraft): AlertCondition {
  if (draft.field === "amount") {
    if (draft.operator === "range") {
      return {
        field: draft.field,
        operator: draft.operator,
        value: [
          readFiniteNumber(draft.value, "Condition minimum"),
          readFiniteNumber(draft.rangeMax, "Condition maximum")
        ]
      };
    }

    return {
      field: draft.field,
      operator: draft.operator,
      value: readFiniteNumber(draft.value, "Condition value")
    };
  }

  const value = draft.value.trim();
  if (value === "") {
    throw new Error("Condition value is required.");
  }

  return {
    field: draft.field,
    operator: draft.operator,
    value
  };
}

function createSampleEvent(rule: AlertRule): AlertTestEventInput {
  const base = {
    id: `test_${rule.id}_${createDraftId()}`,
    providerId: "twitch" as const,
    sourcePlatform: "twitch" as const,
    ingestProvider: "twitch" as const,
    occurredAt: new Date().toISOString(),
    actor: {
      id: "sample-viewer",
      displayName: "Sample Viewer"
    },
    message: "Local test alert",
    metadata: {
      sample: true,
      ruleId: rule.id,
      generatedBy: "management-rule-editor"
    }
  };

  switch (rule.eventType) {
    case "subscription":
      return { ...base, type: "subscription", amount: readSampleNumber(rule, 1), tier: readSampleTier(rule) };
    case "resubscription":
      return { ...base, type: "resubscription", amount: readSampleNumber(rule, 6), tier: readSampleTier(rule), streakMonths: 6 };
    case "cheer":
      return { ...base, type: "cheer", amount: readSampleNumber(rule, 500) };
    case "raid":
      return { ...base, type: "raid", amount: readSampleNumber(rule, 25) };
    case "channel_point_redemption":
      return {
        ...base,
        type: "channel_point_redemption",
        amount: null,
        rewardId: readSampleRewardId(rule),
        rewardTitle: "Hydrate",
        userInput: "Local sample redemption"
      };
    case "follow":
      return { ...base, type: "follow", amount: null };
  }
}

function readSampleNumber(rule: AlertRule, fallback: number): number {
  const condition = rule.conditions.find((candidate) => candidate.field === "amount");
  if (condition === undefined) {
    return fallback;
  }

  if (Array.isArray(condition.value) && typeof condition.value[0] === "number") {
    return condition.value[0];
  }

  return typeof condition.value === "number" ? condition.value : fallback;
}

function readSampleTier(rule: AlertRule): "1000" | "2000" | "3000" | "prime" {
  const value = rule.conditions.find((candidate) => candidate.field === "tier")?.value;
  return value === "2000" || value === "3000" || value === "prime" ? value : "1000";
}

function readSampleRewardId(rule: AlertRule): string {
  const value = rule.conditions.find((candidate) => candidate.field === "rewardId")?.value;
  return typeof value === "string" && value.trim() !== "" ? value.trim() : "reward_hydrate";
}

function formatTestResult(status: string): string {
  switch (status) {
    case "queued":
      return "Test alert queued from local sample data.";
    case "no-matches":
      return "Test alert ran, but no saved rules matched.";
    case "cooldown":
      return "Test alert matched, but cooldown blocked playback.";
    case "duplicate":
      return "Test alert was ignored as a duplicate.";
    default:
      return "Test alert finished.";
  }
}

function getConditionFieldOption(field: ConditionField): ConditionFieldOption {
  return conditionFieldOptions.find((option) => option.field === field) ?? conditionFieldOptions[0]!;
}

function selectExistingId(items: readonly { readonly id: string }[], preferredId: string): string {
  if (items.some((item) => item.id === preferredId)) {
    return preferredId;
  }

  return items[0]?.id ?? "";
}

function readInteger(value: string, label: string, minimum?: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || (minimum !== undefined && parsed < minimum)) {
    throw new Error(`${label} must be ${minimum === undefined ? "an integer" : `at least ${minimum}`}.`);
  }

  return parsed;
}

function readFiniteNumber(value: string, label: string, minimum?: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || (minimum !== undefined && parsed < minimum)) {
    throw new Error(`${label} must be ${minimum === undefined ? "a number" : `at least ${minimum}`}.`);
  }

  return parsed;
}

function readDraftNumber(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function createDraftId(): string {
  return globalThis.crypto?.randomUUID?.() ?? String(Date.now());
}

function confirmImpact(message: string): boolean {
  return globalThis.confirm(message);
}

function formatEventType(eventType: string): string {
  return eventType.replaceAll("_", " ");
}

function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Alert configuration operation failed.";
}
