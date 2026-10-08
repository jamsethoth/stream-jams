import { Button, Checkbox, NativeSelect, TextInput } from "@mantine/core";
import {
  formatAlertConditionSummary,
  getAlertConditionFieldDefinitions,
  validateAuthoredAlertConditions,
  type AlertConditionFieldDefinition,
  type AlertEditorDocument,
  type ScalarAlertConditionOperator,
  type StreamEventType
} from "@stream-jams/core";
import { useEffect, useRef, useState } from "react";
import "./event-condition-list.css";

/** One editable typed condition, as alert documents and event trigger selectors store it. */
export type EditableEventCondition = AlertEditorDocument["conditions"][number];
type EditorCondition = EditableEventCondition;
type ScalarEditorCondition = Exclude<EditorCondition, { readonly operator: "oneOf" }>;

const noHiddenConditionFields: readonly string[] = [];

/** Edits typed canonical-event conditions; range drafts that fail validation are reported through onDraftError. */
export function EventConditionList({ conditions, eventType, heading, hiddenFields = noHiddenConditionFields, onChange, onDraftError }: {
  readonly conditions: readonly EditorCondition[];
  readonly eventType: StreamEventType;
  readonly heading: string;
  readonly hiddenFields?: readonly string[] | undefined;
  readonly onChange: (conditions: readonly EditorCondition[]) => void;
  readonly onDraftError: (error: string | null) => void;
}) {
  const hiddenFieldSet = new Set(hiddenFields);
  const definitions = getAlertConditionFieldDefinitions(eventType)
    .filter((definition) => !hiddenFieldSet.has(definition.field));
  const available = definitions.filter((definition) => !conditions.some((condition) => condition.field === definition.field));
  const visibleConditions = conditions.flatMap((condition, index) => hiddenFieldSet.has(condition.field)
    ? []
    : [{ condition, index }]);
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
    const operator = scalarOperators(definition)[0];
    if (operator === undefined) return;
    onChange([...conditions, conditionWithDefault(definition, operator)]);
  }

  function removeCondition(index: number) {
    const remaining = conditions.filter((_, candidateIndex) => candidateIndex !== index);
    const remainingVisibleIndexes = remaining.flatMap((condition, candidateIndex) => hiddenFieldSet.has(condition.field)
      ? []
      : [candidateIndex]);
    pendingFocusRef.current = remainingVisibleIndexes[0] ?? "add";
    setRangeDrafts((current) => removeIndexedEntry(current, index));
    setRangeErrors((current) => removeIndexedEntry(current, index));
    onChange(remaining);
  }

  function replaceAuthoredCondition(index: number, condition: EditorCondition) {
    setRangeDrafts((current) => omitIndexedEntry(current, index));
    setRangeErrors((current) => omitIndexedEntry(current, index));
    onChange(replaceCondition(conditions, index, condition));
  }

  function updateRange(index: number, condition: ScalarEditorCondition, definition: AlertConditionFieldDefinition, part: "minimum" | "maximum", value: string) {
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
    <fieldset className="event-condition-list__conditions">
      <legend>{heading}</legend>
      {visibleConditions.length === 0 ? hiddenFields.length === 0 ? (
        <p>No conditions. Every matching {formatEventType(eventType).toLowerCase()} event is eligible.</p>
      ) : (
        <p>No additional conditions. Reward coverage above determines which {formatEventType(eventType).toLowerCase()} events are eligible.</p>
      ) : null}
      {visibleConditions.map(({ condition, index }) => {
        const definition = definitions.find((candidate) => candidate.field === condition.field);
        if (
          definition === undefined
          || condition.operator === "oneOf"
          || !scalarOperators(definition).includes(condition.operator)
        ) {
          return (
            <div className="event-condition-list__condition" key={`${condition.field}-${index}`} ref={(element) => { rowRefs.current[index] = element; }}>
              <div className="event-condition-list__unknown-condition"><strong>Legacy condition</strong><span>{formatAlertConditionSummary(eventType, condition)}</span></div>
              <Button color="red" variant="light" aria-label={`Remove ${condition.field} from ${heading}`} data-condition-primary onClick={() => removeCondition(index)} type="button">Remove</Button>
            </div>
          );
        }

        const issue = validateAuthoredAlertConditions(eventType, [condition])[0];
        const rangeError = rangeErrors[index];
        const validationMessage = rangeError ?? issue?.message ?? null;
        const errorId = `${heading.toLowerCase().replaceAll(" ", "-")}-${index}-error`;
        const fieldOptions = definitions.filter((candidate) => candidate.field === condition.field || !conditions.some((other, otherIndex) => otherIndex !== index && other.field === candidate.field));
        const operators = scalarOperators(definition);
        const rangeValue = Array.isArray(condition.value) ? condition.value : [definition.minimum ?? 0, definition.minimum ?? 0];
        const rangeDraft = rangeDrafts[index] ?? { minimum: String(rangeValue[0]), maximum: String(rangeValue[1]) };
        return (
          <div className="event-condition-list__condition" key={`${condition.field}-${index}`} ref={(element) => { rowRefs.current[index] = element; }}>
            <div className="event-condition-list__condition-controls">
              <NativeSelect label="Field" aria-label={`${heading} condition ${index + 1} field`} data-condition-primary onChange={(event) => {
                const nextDefinition = definitions.find((candidate) => candidate.field === event.currentTarget.value);
                const operator = nextDefinition === undefined ? undefined : scalarOperators(nextDefinition)[0];
                if (nextDefinition !== undefined && operator !== undefined) replaceAuthoredCondition(index, conditionWithDefault(nextDefinition, operator));
              }} value={condition.field}>{fieldOptions.map((option) => <option key={option.field} value={option.field}>{option.label}</option>)}</NativeSelect>
              <NativeSelect label="Operator" aria-label={`${heading} ${definition.label} operator`} onChange={(event) => replaceAuthoredCondition(index, conditionWithDefault(definition, event.currentTarget.value as ScalarAlertConditionOperator))} value={condition.operator}>{operators.map((operator) => <option key={operator} value={operator}>{operatorLabel(operator)}</option>)}</NativeSelect>
              {condition.operator === "range" ? (
                <div className="event-condition-list__range">
                  <TextInput label="Minimum" attributes={{ input: { "aria-describedby": validationMessage === null ? undefined : errorId } }} error={validationMessage !== null} aria-invalid={validationMessage !== null} aria-label={`${heading} ${definition.label} Minimum`} min={definition.minimum} onChange={(event) => updateRange(index, condition, definition, "minimum", event.currentTarget.value)} type="number" value={rangeDraft.minimum} />
                  <TextInput label="Maximum" attributes={{ input: { "aria-describedby": validationMessage === null ? undefined : errorId } }} error={validationMessage !== null} aria-invalid={validationMessage !== null} aria-label={`${heading} ${definition.label} Maximum`} min={definition.minimum} onChange={(event) => updateRange(index, condition, definition, "maximum", event.currentTarget.value)} type="number" value={rangeDraft.maximum} />
                </div>
              ) : <ConditionValueControl condition={condition} definition={definition} errorId={validationMessage === null ? undefined : errorId} heading={heading} onChange={(value) => onChange(replaceCondition(conditions, index, { ...condition, value }))} />}
            </div>
            <Button color="red" variant="light" aria-label={`Remove ${definition.label} from ${heading}`} onClick={() => removeCondition(index)} type="button">Remove</Button>
            {validationMessage === null ? <p>{formatAlertConditionSummary(eventType, condition)}</p> : <p className="event-condition-list__field-error" id={errorId} role="alert">{validationMessage}</p>}
          </div>
        );
      })}
      {available.length === 0 ? null : <Button variant="default" onClick={addCondition} ref={addButtonRef} type="button">Add condition</Button>}
    </fieldset>
  );
}

function ConditionValueControl({ condition, definition, errorId, heading, onChange }: {
  readonly condition: ScalarEditorCondition;
  readonly definition: AlertConditionFieldDefinition;
  readonly errorId: string | undefined;
  readonly heading: string;
  readonly onChange: (value: ScalarEditorCondition["value"]) => void;
}) {
  const label = `${heading} ${definition.label} value`;
  if (definition.valueKind === "enum") {
    return <NativeSelect label="Value" attributes={{ input: { "aria-describedby": errorId } }} error={errorId === undefined ? undefined : true} aria-invalid={errorId === undefined ? undefined : true} aria-label={label} onChange={(event) => onChange(event.currentTarget.value)} value={String(condition.value)}>{definition.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</NativeSelect>;
  }
  if (definition.valueKind === "boolean") {
    return <Checkbox label="Value" aria-describedby={errorId} error={errorId === undefined ? undefined : true} aria-invalid={errorId === undefined ? undefined : true} aria-label={label} checked={condition.value === true} onChange={(event) => onChange(event.currentTarget.checked)} />;
  }
  if (definition.valueKind === "number") {
    return <TextInput label="Value" attributes={{ input: { "aria-describedby": errorId } }} error={errorId === undefined ? undefined : true} aria-invalid={errorId === undefined ? undefined : true} aria-label={label} min={definition.minimum} onChange={(event) => onChange(event.currentTarget.valueAsNumber)} type="number" value={typeof condition.value === "number" && Number.isFinite(condition.value) ? condition.value : ""} />;
  }
  return <TextInput label="Value" attributes={{ input: { "aria-describedby": errorId } }} error={errorId === undefined ? undefined : true} aria-invalid={errorId === undefined ? undefined : true} aria-label={label} onChange={(event) => onChange(event.currentTarget.value)} type="text" value={typeof condition.value === "string" ? condition.value : ""} />;
}

function conditionWithDefault(definition: AlertConditionFieldDefinition, operator: ScalarAlertConditionOperator): ScalarEditorCondition {
  return { field: definition.field, operator, value: defaultConditionValue(definition, operator) };
}

function defaultConditionValue(definition: AlertConditionFieldDefinition, operator: ScalarAlertConditionOperator): ScalarEditorCondition["value"] {
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

function operatorLabel(operator: ScalarAlertConditionOperator): string {
  switch (operator) {
    case "equals": return "Equals";
    case "includes": return "Includes";
    case "min": return "Minimum";
    case "max": return "Maximum";
    case "range": return "Range";
  }
}

function scalarOperators(definition: AlertConditionFieldDefinition): readonly ScalarAlertConditionOperator[] {
  return definition.operators.filter(
    (operator): operator is ScalarAlertConditionOperator => operator !== "oneOf"
  );
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
