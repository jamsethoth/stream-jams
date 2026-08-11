import {
  formatAlertConditionSummary,
  getAlertConditionFieldDefinitions,
  validateAuthoredAlertConditions,
  type AlertConditionFieldDefinition,
  type AlertEditorDocument
} from "@stream-jams/core";
import { useEffect, useRef, useState } from "react";

type EditorCondition = AlertEditorDocument["conditions"][number];

export interface AlertEventInspectorProps {
  readonly document: AlertEditorDocument;
  readonly previewIncludeAudio: boolean;
  readonly previewIncludeTts: boolean;
  readonly sendIncludeAudio: boolean;
  readonly sendIncludeTts: boolean;
  readonly onChange: (update: (document: AlertEditorDocument) => AlertEditorDocument) => void;
  readonly onConditionDraftError: (error: string | null) => void;
  readonly onPreviewIncludeAudio: (value: boolean) => void;
  readonly onPreviewIncludeTts: (value: boolean) => void;
  readonly onSendIncludeAudio: (value: boolean) => void;
  readonly onSendIncludeTts: (value: boolean) => void;
  readonly onPreview: () => void;
  readonly onResetSample: () => void;
  readonly onSample: (sampleId: string) => void;
  readonly onSampleDraft: (value: string) => void;
  readonly onSend: () => void;
  readonly sampleDraft: string;
  readonly sampleError: string | null;
  readonly sampleId: string | null;
  readonly previewDisabled: boolean;
  readonly sendDisabled: boolean;
}

export function AlertEventInspector(props: AlertEventInspectorProps) {
  const [ruleDraftError, setRuleDraftError] = useState<string | null>(null);
  const [variationDraftError, setVariationDraftError] = useState<string | null>(null);
  const conditionDraftError = ruleDraftError ?? variationDraftError;

  useEffect(() => {
    props.onConditionDraftError(conditionDraftError);
  }, [conditionDraftError, props.onConditionDraftError]);

  useEffect(() => () => props.onConditionDraftError(null), [props.onConditionDraftError]);

  return (
    <div className="alert-editor-inspector alert-editor-inspector__controls">
      <h3>Matching and playback</h3>
      <fieldset className="alert-editor-inspector__impact">
        <legend>Affects default and all variations</legend>
        <p>These rule controls are shared by the default and every variation for this event.</p>
        <ConditionList
          conditions={props.document.conditions}
          eventType={props.document.eventType}
          heading="Rule conditions"
          onChange={(conditions) => props.onChange((document) => ({ ...document, conditions: [...conditions] }))}
          onDraftError={setRuleDraftError}
        />
        <label><span>Cooldown (seconds)</span><input min="0" onChange={(event) => { const cooldownSeconds = Number(event.currentTarget.value); props.onChange((document) => ({ ...document, cooldownSeconds })); }} type="number" value={props.document.cooldownSeconds} /></label>
        <label><span>Rule priority</span><input onChange={(event) => { const rulePriority = Number(event.currentTarget.value); props.onChange((document) => ({ ...document, rulePriority })); }} type="number" value={props.document.rulePriority} /></label>
      </fieldset>
      {props.document.kind === "variation" ? (
        <fieldset className="alert-editor-inspector__impact">
          <legend>Affects this variation only</legend>
          <ConditionList
            conditions={props.document.variantConditions}
            eventType={props.document.eventType}
            heading="Variation conditions"
            onChange={(variantConditions) => props.onChange((document) => ({ ...document, variantConditions: [...variantConditions] }))}
            onDraftError={setVariationDraftError}
          />
          <label><span>Relative chance</span><input min="1" onChange={(event) => { const weight = Number(event.currentTarget.value); props.onChange((document) => ({ ...document, weight })); }} type="number" value={props.document.weight} /></label>
        </fieldset>
      ) : null}
      <h3>Event sample</h3>
      <label><span>Sample payload</span><select onChange={(event) => props.onSample(event.currentTarget.value)} value={props.sampleId ?? ""}>{props.document.samplePayloads.map((sample) => <option key={sample.id} value={sample.id}>{sample.label}</option>)}</select></label>
      <label><span>Session payload (JSON)</span><textarea aria-describedby={props.sampleError === null ? undefined : "alert-editor-sample-error"} aria-invalid={props.sampleError !== null} onChange={(event) => props.onSampleDraft(event.currentTarget.value)} rows={12} value={props.sampleDraft} /></label>
      {props.sampleError === null ? <p>Session edits are used only for preview and testing.</p> : <p className="alert-editor-inspector__field-error" id="alert-editor-sample-error" role="alert">{props.sampleError}</p>}
      <button className="button button--secondary" onClick={props.onResetSample} type="button">Reset sample</button>
      <fieldset className="alert-editor-inspector__audio"><legend>Local preview</legend><label className="alert-editor-inspector__check"><input checked={props.previewIncludeAudio} onChange={(event) => props.onPreviewIncludeAudio(event.currentTarget.checked)} type="checkbox" /><span>Preview audio</span></label><label className="alert-editor-inspector__check"><input checked={props.previewIncludeTts} onChange={(event) => props.onPreviewIncludeTts(event.currentTarget.checked)} type="checkbox" /><span>Preview TTS</span></label></fieldset>
      <fieldset className="alert-editor-inspector__audio"><legend>Send test</legend><label className="alert-editor-inspector__check"><input checked={props.sendIncludeAudio} onChange={(event) => props.onSendIncludeAudio(event.currentTarget.checked)} type="checkbox" /><span>Send audio</span></label><label className="alert-editor-inspector__check"><input checked={props.sendIncludeTts} onChange={(event) => props.onSendIncludeTts(event.currentTarget.checked)} type="checkbox" /><span>Send TTS</span></label></fieldset>
      <div className="alert-editor-inspector__actions"><button className="button button--secondary" disabled={props.previewDisabled} onClick={props.onPreview} type="button">Replay preview</button><button className="button button--primary" disabled={props.sendDisabled} onClick={props.onSend} type="button">Send test</button></div>
    </div>
  );
}

function ConditionList({ conditions, eventType, heading, onChange, onDraftError }: {
  readonly conditions: readonly EditorCondition[];
  readonly eventType: AlertEditorDocument["eventType"];
  readonly heading: string;
  readonly onChange: (conditions: readonly EditorCondition[]) => void;
  readonly onDraftError: (error: string | null) => void;
}) {
  const definitions = getAlertConditionFieldDefinitions(eventType);
  const available = definitions.filter((definition) => !conditions.some((condition) => condition.field === definition.field));
  const [rangeDrafts, setRangeDrafts] = useState<Record<number, { readonly minimum: string; readonly maximum: string }>>({});
  const [rangeErrors, setRangeErrors] = useState<Record<number, string>>({});
  const rowRefs = useRef<Array<HTMLDivElement | null>>([]);
  const addButtonRef = useRef<HTMLButtonElement | null>(null);
  const pendingFocusRef = useRef<number | "add" | null>(null);

  useEffect(() => {
    onDraftError(Object.values(rangeErrors)[0] ?? null);
  }, [onDraftError, rangeErrors]);

  useEffect(() => {
    const pendingFocus = pendingFocusRef.current;
    if (pendingFocus === null) return;
    pendingFocusRef.current = null;
    if (pendingFocus === "add") {
      addButtonRef.current?.focus();
      return;
    }
    rowRefs.current[pendingFocus]?.querySelector<HTMLElement>("[data-condition-primary]")?.focus();
  }, [conditions]);

  function addCondition() {
    const definition = available[0];
    if (definition === undefined) return;
    pendingFocusRef.current = conditions.length;
    const operator = definition.operators[0];
    if (operator === undefined) return;
    onChange([...conditions, conditionWithDefault(definition, operator)]);
  }

  function removeCondition(index: number) {
    const remaining = conditions.filter((_, candidateIndex) => candidateIndex !== index);
    pendingFocusRef.current = remaining.length === 0 ? "add" : Math.min(index, remaining.length - 1);
    setRangeDrafts((current) => removeIndexedEntry(current, index));
    setRangeErrors((current) => removeIndexedEntry(current, index));
    onChange(remaining);
  }

  function replaceAuthoredCondition(index: number, condition: EditorCondition) {
    setRangeDrafts((current) => omitIndexedEntry(current, index));
    setRangeErrors((current) => omitIndexedEntry(current, index));
    onChange(replaceCondition(conditions, index, condition));
  }

  function updateRange(index: number, condition: EditorCondition, definition: AlertConditionFieldDefinition, part: "minimum" | "maximum", value: string) {
    const savedValue = Array.isArray(condition.value) ? condition.value : [definition.minimum ?? 0, definition.minimum ?? 0];
    const current = rangeDrafts[index] ?? { minimum: String(savedValue[0]), maximum: String(savedValue[1]) };
    const next = { ...current, [part]: value };
    setRangeDrafts((drafts) => ({ ...drafts, [index]: next }));
    const candidate = {
      ...condition,
      value: [readNumberDraft(next.minimum), readNumberDraft(next.maximum)] as [number, number]
    };
    const issue = validateAuthoredAlertConditions(eventType, [candidate])[0];
    if (issue !== undefined) {
      setRangeErrors((errors) => ({ ...errors, [index]: issue.message }));
      return;
    }
    setRangeDrafts((drafts) => omitIndexedEntry(drafts, index));
    setRangeErrors((errors) => omitIndexedEntry(errors, index));
    onChange(replaceCondition(conditions, index, candidate));
  }

  return (
    <fieldset className="alert-editor-inspector__conditions">
      <legend>{heading}</legend>
      {conditions.length === 0 ? <p>No conditions. Every matching {formatEventType(eventType).toLowerCase()} event is eligible.</p> : null}
      {conditions.map((condition, index) => {
        const definition = definitions.find((candidate) => candidate.field === condition.field);
        const authored = definition !== undefined && definition.operators.includes(condition.operator);
        if (!authored || definition === undefined) {
          return (
            <div className="alert-editor-inspector__condition" key={`${condition.field}-${index}`} ref={(element) => { rowRefs.current[index] = element; }}>
              <div className="alert-editor-inspector__unknown-condition"><strong>Legacy condition</strong><span>{formatAlertConditionSummary(eventType, condition)}</span></div>
              <button aria-label={`Remove ${condition.field} from ${heading}`} className="button button--danger-quiet button--compact" data-condition-primary onClick={() => removeCondition(index)} type="button">Remove</button>
            </div>
          );
        }

        const issue = validateAuthoredAlertConditions(eventType, [condition])[0];
        const rangeError = rangeErrors[index];
        const validationMessage = rangeError ?? issue?.message ?? null;
        const errorId = `${heading.toLowerCase().replaceAll(" ", "-")}-${index}-error`;
        const fieldOptions = definitions.filter((candidate) => candidate.field === condition.field || !conditions.some((other, otherIndex) => otherIndex !== index && other.field === candidate.field));
        const rangeValue = Array.isArray(condition.value) ? condition.value : [definition.minimum ?? 0, definition.minimum ?? 0];
        const rangeDraft = rangeDrafts[index] ?? { minimum: String(rangeValue[0]), maximum: String(rangeValue[1]) };
        return (
          <div className="alert-editor-inspector__condition" key={`${condition.field}-${index}`} ref={(element) => { rowRefs.current[index] = element; }}>
            <div className="alert-editor-inspector__condition-controls">
              <label><span>Field</span><select aria-label={`${heading} condition ${index + 1} field`} data-condition-primary onChange={(event) => {
                const nextDefinition = definitions.find((candidate) => candidate.field === event.currentTarget.value);
                const operator = nextDefinition?.operators[0];
                if (nextDefinition !== undefined && operator !== undefined) replaceAuthoredCondition(index, conditionWithDefault(nextDefinition, operator));
              }} value={condition.field}>{fieldOptions.map((option) => <option key={option.field} value={option.field}>{option.label}</option>)}</select></label>
              <label><span>Operator</span><select aria-label={`${heading} ${definition.label} operator`} onChange={(event) => replaceAuthoredCondition(index, conditionWithDefault(definition, event.currentTarget.value as EditorCondition["operator"]))} value={condition.operator}>{definition.operators.map((operator) => <option key={operator} value={operator}>{operatorLabel(operator)}</option>)}</select></label>
              {condition.operator === "range" ? (
                <div className="alert-editor-inspector__range">
                  <label><span>Minimum</span><input aria-describedby={validationMessage === null ? undefined : errorId} aria-invalid={validationMessage !== null} aria-label={`${heading} ${definition.label} Minimum`} min={definition.minimum} onChange={(event) => updateRange(index, condition, definition, "minimum", event.currentTarget.value)} type="number" value={rangeDraft.minimum} /></label>
                  <label><span>Maximum</span><input aria-describedby={validationMessage === null ? undefined : errorId} aria-invalid={validationMessage !== null} aria-label={`${heading} ${definition.label} Maximum`} min={definition.minimum} onChange={(event) => updateRange(index, condition, definition, "maximum", event.currentTarget.value)} type="number" value={rangeDraft.maximum} /></label>
                </div>
              ) : <ConditionValueControl condition={condition} definition={definition} errorId={validationMessage === null ? undefined : errorId} heading={heading} onChange={(value) => onChange(replaceCondition(conditions, index, { ...condition, value }))} />}
            </div>
            <button aria-label={`Remove ${definition.label} from ${heading}`} className="button button--danger-quiet button--compact" onClick={() => removeCondition(index)} type="button">Remove</button>
            {validationMessage === null ? <p>{formatAlertConditionSummary(eventType, condition)}</p> : <p className="alert-editor-inspector__field-error" id={errorId} role="alert">{validationMessage}</p>}
          </div>
        );
      })}
      {available.length === 0 ? null : <button className="button button--secondary button--compact" onClick={addCondition} ref={addButtonRef} type="button">Add condition</button>}
    </fieldset>
  );
}

function ConditionValueControl({ condition, definition, errorId, heading, onChange }: {
  readonly condition: EditorCondition;
  readonly definition: AlertConditionFieldDefinition;
  readonly errorId: string | undefined;
  readonly heading: string;
  readonly onChange: (value: EditorCondition["value"]) => void;
}) {
  const label = `${heading} ${definition.label} value`;
  if (definition.valueKind === "enum") {
    return <label><span>Value</span><select aria-describedby={errorId} aria-invalid={errorId === undefined ? undefined : true} aria-label={label} onChange={(event) => onChange(event.currentTarget.value)} value={String(condition.value)}>{definition.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
  }
  if (definition.valueKind === "boolean") {
    return <label className="alert-editor-inspector__check"><input aria-describedby={errorId} aria-invalid={errorId === undefined ? undefined : true} aria-label={label} checked={condition.value === true} onChange={(event) => onChange(event.currentTarget.checked)} type="checkbox" /><span>Value</span></label>;
  }
  if (definition.valueKind === "number") {
    return <label><span>Value</span><input aria-describedby={errorId} aria-invalid={errorId === undefined ? undefined : true} aria-label={label} min={definition.minimum} onChange={(event) => onChange(event.currentTarget.valueAsNumber)} type="number" value={typeof condition.value === "number" && Number.isFinite(condition.value) ? condition.value : ""} /></label>;
  }
  return <label><span>Value</span><input aria-describedby={errorId} aria-invalid={errorId === undefined ? undefined : true} aria-label={label} onChange={(event) => onChange(event.currentTarget.value)} type="text" value={typeof condition.value === "string" ? condition.value : ""} /></label>;
}

export function alertDocumentConditionError(document: AlertEditorDocument): string | null {
  const definitions = getAlertConditionFieldDefinitions(document.eventType);
  for (const condition of [...document.conditions, ...document.variantConditions]) {
    const definition = definitions.find((candidate) => candidate.field === condition.field);
    if (definition === undefined || !definition.operators.includes(condition.operator)) continue;
    const issue = validateAuthoredAlertConditions(document.eventType, [condition])[0];
    if (issue !== undefined) return issue.message;
  }
  return null;
}

function conditionWithDefault(definition: AlertConditionFieldDefinition, operator: EditorCondition["operator"]): EditorCondition {
  return { field: definition.field, operator, value: defaultConditionValue(definition, operator) };
}

function defaultConditionValue(definition: AlertConditionFieldDefinition, operator: EditorCondition["operator"]): EditorCondition["value"] {
  if (operator === "range") {
    const minimum = definition.minimum ?? 0;
    return [minimum, minimum];
  }
  if (definition.valueKind === "number") return definition.minimum ?? 0;
  if (definition.valueKind === "boolean") return false;
  if (definition.valueKind === "enum") return definition.options?.[0]?.value ?? "value";
  return definition.label;
}

function replaceCondition(conditions: readonly EditorCondition[], index: number, condition: EditorCondition): readonly EditorCondition[] {
  return conditions.map((candidate, candidateIndex) => candidateIndex === index ? condition : candidate);
}

function operatorLabel(operator: EditorCondition["operator"]): string {
  switch (operator) {
    case "equals": return "Equals";
    case "includes": return "Includes";
    case "min": return "Minimum";
    case "max": return "Maximum";
    case "range": return "Range";
  }
}

function readNumberDraft(value: string): number {
  return value.trim() === "" ? Number.NaN : Number(value);
}

function omitIndexedEntry<T>(record: Readonly<Record<number, T>>, index: number): Record<number, T> {
  return Object.fromEntries(Object.entries(record).filter(([key]) => Number(key) !== index)) as Record<number, T>;
}

function removeIndexedEntry<T>(record: Readonly<Record<number, T>>, index: number): Record<number, T> {
  return Object.fromEntries(Object.entries(record).flatMap(([key, value]) => {
    const numericKey = Number(key);
    if (numericKey === index) return [];
    return [[numericKey > index ? numericKey - 1 : numericKey, value]];
  })) as Record<number, T>;
}

function formatEventType(value: string): string {
  return value.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}
