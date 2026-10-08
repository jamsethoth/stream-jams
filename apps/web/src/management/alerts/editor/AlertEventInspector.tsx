import { Button, Checkbox, NativeSelect, TextInput, Textarea } from "@mantine/core";
import {
  formatAlertConditionSummary,
  getAlertConditionFieldDefinitions,
  readChannelPointRewardSelection,
  replaceChannelPointRewardSelection,
  validateAuthoredAlertConditions,
  type AlertCondition,
  type AlertEditorDocument,
  type AlertPriorityGroup,
  type TwitchCustomRewardCatalog,
  type AlertVariationAuthoringContext,
  type AlertVariationSampleEvaluation
} from "@stream-jams/core";
import { useEffect, useState } from "react";
import { EventConditionList } from "../../conditions/EventConditionList.js";
import { TwitchRewardPicker, type TwitchRewardSampleChoice } from "../TwitchRewardPicker.js";

type EditorCondition = AlertEditorDocument["conditions"][number];
type VariationCandidatePresentation = AlertVariationAuthoringContext["candidates"][number];

const channelPointRewardField = ["channelPointReward"] as const;
const noHiddenConditionFields: readonly string[] = [];

export interface AlertEventInspectorProps {
  readonly document: AlertEditorDocument;
  readonly loadTwitchCustomRewards: () => Promise<TwitchCustomRewardCatalog>;
  readonly overlapAlertNames: readonly string[];
  readonly previewIncludeAudio: boolean;
  readonly previewIncludeTts: boolean;
  readonly sendIncludeAudio: boolean;
  readonly sendIncludeTts: boolean;
  readonly onChange: (update: (document: AlertEditorDocument) => AlertEditorDocument) => void;
  readonly onDraftError: (error: string | null) => void;
  readonly onPreviewIncludeAudio: (value: boolean) => void;
  readonly onPreviewIncludeTts: (value: boolean) => void;
  readonly onSendIncludeAudio: (value: boolean) => void;
  readonly onSendIncludeTts: (value: boolean) => void;
  readonly onPreview: () => void;
  readonly onMovePriorityGroup: (fromIndex: number, toIndex: number) => void;
  readonly onMoveVariation: (variationId: string, targetIndex: number | "new-last") => void;
  readonly onResetSample: () => void;
  readonly onSample: (sampleId: string) => void;
  readonly onSampleDraft: (value: string) => void;
  readonly onUseRewardSample: (sample: TwitchRewardSampleChoice) => void;
  readonly onSend: () => void;
  readonly sampleDraft: string;
  readonly sampleError: string | null;
  readonly sampleId: string | null;
  readonly sampleRewardId: string | undefined;
  readonly previewDisabled: boolean;
  readonly priorityGroups: readonly AlertPriorityGroup[];
  readonly sendDisabled: boolean;
  readonly selectionExplanationCorrection: "event" | "sample" | null;
  readonly variationContext: AlertVariationAuthoringContext;
  readonly variationEvaluation: AlertVariationSampleEvaluation | null;
}

export function AlertEventInspector(props: AlertEventInspectorProps) {
  const [ruleDraftError, setRuleDraftError] = useState<string | null>(null);
  const [variationDraftError, setVariationDraftError] = useState<string | null>(null);
  const [relativeChanceDraft, setRelativeChanceDraft] = useState<string | null>(null);
  const relativeChanceError = relativeChanceDraft === null
    ? null
    : "Relative chance must be a positive whole number.";
  const eventDraftError = ruleDraftError ?? variationDraftError ?? relativeChanceError;
  const rewardSelection = props.document.kind === "default" && props.document.eventType === "channel_point_redemption"
    ? readChannelPointRewardSelection(props.document.conditions)
    : null;
  const relativeChanceControl = (
    <>
      <TextInput label="Relative chance" attributes={{ input: { "aria-describedby": relativeChanceError === null ? "alert-editor-relative-chance-help" : "alert-editor-relative-chance-error" } }} error={relativeChanceError === null ? undefined : true} aria-invalid={relativeChanceError === null ? undefined : true} min="1" onChange={(event) => {
        const value = event.currentTarget.value;
        const weight = Number(value);
        if (value.trim() === "" || !Number.isInteger(weight) || weight <= 0) {
          setRelativeChanceDraft(value);
          return;
        }
        setRelativeChanceDraft(null);
        props.onChange((document) => ({ ...document, weight }));
      }} step="1" type="number" value={relativeChanceDraft ?? props.document.weight} />
      {relativeChanceError === null
        ? <p id="alert-editor-relative-chance-help">Used when this alert shares the first eligible priority group.</p>
        : <p className="alert-editor-inspector__field-error" id="alert-editor-relative-chance-error" role="alert">{relativeChanceError}</p>}
    </>
  );

  useEffect(() => {
    props.onDraftError(eventDraftError);
  }, [eventDraftError, props.onDraftError]);

  useEffect(() => () => props.onDraftError(null), [props.onDraftError]);

  const candidatePresentations = selectedCandidatePresentations(props.variationContext, props.document);

  return (
    <div className="alert-editor-inspector alert-editor-inspector__controls">
      <h3>Matching and playback</h3>
      <fieldset className="alert-editor-inspector__impact">
        <legend>Affects default and all variations</legend>
        <p>These rule controls are shared by the default and every variation for this event.</p>
        {rewardSelection === null ? null : (
          <TwitchRewardPicker
            loadRewards={props.loadTwitchCustomRewards}
            onChange={(selection) => props.onChange((document) => ({
              ...document,
              conditions: replaceChannelPointRewardSelection(document.conditions, selection).map(editableCondition)
            }))}
            onUseAsSample={props.onUseRewardSample}
            overlapAlertNames={props.overlapAlertNames}
            selection={rewardSelection}
            {...(props.sampleRewardId === undefined ? {} : { sampleRewardId: props.sampleRewardId })}
          />
        )}
        <EventConditionList
          conditions={props.document.conditions}
          eventType={props.document.eventType}
          heading="Rule conditions"
          hiddenFields={rewardSelection === null ? noHiddenConditionFields : channelPointRewardField}
          onChange={(conditions) => props.onChange((document) => ({ ...document, conditions: [...conditions] }))}
          onDraftError={setRuleDraftError}
        />
        <TextInput label="Cooldown (seconds)" min="0" onChange={(event) => { const cooldownSeconds = Number(event.currentTarget.value); props.onChange((document) => ({ ...document, cooldownSeconds })); }} type="number" value={props.document.cooldownSeconds} />
        <TextInput label="Rule priority" onChange={(event) => { const rulePriority = Number(event.currentTarget.value); props.onChange((document) => ({ ...document, rulePriority })); }} type="number" value={props.document.rulePriority} />
      </fieldset>
      <PriorityGroups
        candidates={candidatePresentations}
        groups={props.priorityGroups}
        onMoveGroup={props.onMovePriorityGroup}
        onMoveVariation={props.onMoveVariation}
      />
      {props.document.kind === "default" ? (
        <fieldset className="alert-editor-inspector__impact">
          <legend>Affects this default only</legend>
          {relativeChanceControl}
        </fieldset>
      ) : (
        <fieldset className="alert-editor-inspector__impact">
          <legend>Affects this variation only</legend>
          <EventConditionList
            conditions={props.document.variantConditions}
            eventType={props.document.eventType}
            heading="Variation conditions"
            hiddenFields={noHiddenConditionFields}
            onChange={(variantConditions) => props.onChange((document) => ({ ...document, variantConditions: [...variantConditions] }))}
            onDraftError={setVariationDraftError}
          />
          {relativeChanceControl}
        </fieldset>
      )}
      <h3>Event sample</h3>
      <NativeSelect label="Sample payload" onChange={(event) => props.onSample(event.currentTarget.value)} value={props.sampleId ?? ""}>{props.document.samplePayloads.map((sample) => <option key={sample.id} value={sample.id}>{sample.label}</option>)}</NativeSelect>
      <Textarea label="Session payload (JSON)" attributes={{ input: { "aria-describedby": props.sampleError === null ? undefined : "alert-editor-sample-error" } }} error={props.sampleError !== null} aria-invalid={props.sampleError !== null} onChange={(event) => props.onSampleDraft(event.currentTarget.value)} rows={12} value={props.sampleDraft} />
      {props.sampleError === null ? <p>Session edits are used only for preview and testing.</p> : <p className="alert-editor-inspector__field-error" id="alert-editor-sample-error" role="alert">{props.sampleError}</p>}
      <SampleSelectionExplanation
        candidates={candidatePresentations}
        correction={props.selectionExplanationCorrection}
        document={props.document}
        evaluation={props.variationEvaluation}
      />
      <Button variant="default" onClick={props.onResetSample} type="button">Reset sample</Button>
      <fieldset className="alert-editor-inspector__audio"><legend>Local preview</legend><Checkbox label="Preview audio" checked={props.previewIncludeAudio} onChange={(event) => props.onPreviewIncludeAudio(event.currentTarget.checked)} /><Checkbox label="Preview TTS" checked={props.previewIncludeTts} onChange={(event) => props.onPreviewIncludeTts(event.currentTarget.checked)} /></fieldset>
      <fieldset className="alert-editor-inspector__audio"><legend>Test draft delivery</legend><Checkbox label="Send audio" checked={props.sendIncludeAudio} onChange={(event) => props.onSendIncludeAudio(event.currentTarget.checked)} /><Checkbox label="Send TTS" checked={props.sendIncludeTts} onChange={(event) => props.onSendIncludeTts(event.currentTarget.checked)} /></fieldset>
      <div className="alert-editor-inspector__actions"><Button variant="default" disabled={props.previewDisabled} onClick={props.onPreview} type="button">Replay preview</Button><Button disabled={props.sendDisabled} onClick={props.onSend} type="button">Test draft</Button></div>
    </div>
  );
}

function PriorityGroups({ candidates, groups, onMoveGroup, onMoveVariation }: {
  readonly candidates: readonly VariationCandidatePresentation[];
  readonly groups: readonly AlertPriorityGroup[];
  readonly onMoveGroup: (fromIndex: number, toIndex: number) => void;
  readonly onMoveVariation: (variationId: string, targetIndex: number | "new-last") => void;
}) {
  const candidatesByEditorId = new Map(candidates.map((candidate) => [candidate.editorId, candidate]));
  const fallback = candidates.find((candidate) => candidate.kind === "default");
  return (
    <section aria-labelledby="alert-editor-priority-groups-title" className="alert-editor-inspector__priority-groups">
      <div>
        <h3 id="alert-editor-priority-groups-title">Priority groups</h3>
        <p>Earlier conditional groups are evaluated first. Variations in one group use their relative chances.</p>
      </div>
      <fieldset className="alert-editor-inspector__priority-fallback">
        <legend>Fallback</legend>
        <strong>{fallback?.name ?? "Default"}</strong>
        <span>{fallback?.enabled === false ? "Disabled" : "Enabled"} default alert</span>
      </fieldset>
      {groups.map((group, groupIndex) => (
        <fieldset className="alert-editor-inspector__priority-group" key={group.variationIds.join("|")}>
          <legend>Priority group {groupIndex + 1}</legend>
          <div className="alert-editor-inspector__priority-heading">
            <span>{priorityGroupOrderCopy(groupIndex, groups.length)}</span>
            <div>
              <Button variant="default" disabled={groupIndex === 0} onClick={() => onMoveGroup(groupIndex, groupIndex - 1)} type="button">Move group earlier</Button>
              <Button variant="default" disabled={groupIndex === groups.length - 1} onClick={() => onMoveGroup(groupIndex, groupIndex + 1)} type="button">Move group later</Button>
            </div>
          </div>
          {group.variationIds.map((variationId) => {
            const candidate = candidatesByEditorId.get(variationId);
            const name = candidate?.name ?? variationId;
            const enabled = candidate?.enabled !== false;
            return (
              <div className="alert-editor-inspector__priority-variation" key={variationId}>
                <div><strong>{name}</strong><span>{enabled ? "Enabled" : "Disabled"}</span></div>
                <NativeSelect label="Move to priority group" aria-label={`Move ${name} to priority group`} onChange={(event) => {
                    const value = event.currentTarget.value;
                    onMoveVariation(variationId, value === "new-last" ? "new-last" : Number(value));
                  }} value={String(groupIndex)}>{groups.map((_, optionIndex) => <option key={optionIndex} value={optionIndex}>Priority group {optionIndex + 1}</option>)}<option value="new-last">New lowest-priority group</option></NativeSelect>
              </div>
            );
          })}
        </fieldset>
      ))}
    </section>
  );
}

function SampleSelectionExplanation({ candidates, correction, document, evaluation }: {
  readonly candidates: readonly VariationCandidatePresentation[];
  readonly correction: "event" | "sample" | null;
  readonly document: AlertEditorDocument;
  readonly evaluation: AlertVariationSampleEvaluation | null;
}) {
  if (correction !== null || evaluation === null) {
    return (
      <section aria-labelledby="alert-editor-selection-explanation-title" aria-live="polite" className="alert-editor-inspector__selection-explanation">
        <h3 id="alert-editor-selection-explanation-title">Sample selection explanation</h3>
        <p>{correction === "event" ? "Correct the event settings to explain selection." : "Correct the sample payload to explain selection."}</p>
      </section>
    );
  }

  const evaluationsById = new Map(evaluation.candidates.map((candidate) => [candidate.id, candidate]));
  const defaultCandidate = candidates.find((candidate) => candidate.kind === "default");
  const conditionalCandidates = candidates.filter((candidate) => candidate.kind === "variation");
  const failingRuleSummaries = evaluation.failedRuleConditionIndexes.flatMap((conditionIndex) => {
    const condition = document.conditions[conditionIndex];
    return condition === undefined ? [] : [formatAlertConditionSummary(document.eventType, condition)];
  });
  return (
    <section aria-labelledby="alert-editor-selection-explanation-title" aria-live="polite" className="alert-editor-inspector__selection-explanation">
      <h3 id="alert-editor-selection-explanation-title">Sample selection explanation</h3>
      {evaluation.outcome === "rule-no-match" ? (
        <div className="alert-editor-inspector__selection-summary">
          <strong>No alert plays for this sample.</strong>
          <p>The shared rule does not match: {failingRuleSummaries.join("; ")}.</p>
        </div>
      ) : evaluation.outcome === "no-enabled-candidate" ? (
        <div className="alert-editor-inspector__selection-summary"><strong>No enabled alert can play for this sample.</strong></div>
      ) : evaluation.outcome === "default-fallback" ? (
        <div className="alert-editor-inspector__selection-summary"><strong>Default plays as the fallback for this sample.</strong></div>
      ) : (
        <div className="alert-editor-inspector__selection-summary">
          <strong>{evaluation.candidates.filter((candidate) => candidate.inHighestEligibleGroup).length === 1 ? "One alert is eligible in the first matching group." : "Multiple alerts are eligible in the first matching group."}</strong>
          <p>Live selection remains random.</p>
        </div>
      )}
      {evaluation.legacyDefaultTie ? <p className="alert-editor-inspector__selection-note"><strong>Legacy priority tie.</strong> The default shares this group under current saved priorities. An explicit priority group edit will normalize conditional groups above it.</p> : null}
      <fieldset className="alert-editor-inspector__selection-fallback">
        <legend>Fallback</legend>
        {defaultCandidate === undefined ? null : <CandidateExplanation
          candidate={defaultCandidate}
          evaluation={evaluationsById.get(defaultCandidate.variantId)}
          fallback
          outcome={evaluation.outcome}
        />}
      </fieldset>
      <div className="alert-editor-inspector__selection-candidates">
        {conditionalCandidates.map((candidate) => <CandidateExplanation
          candidate={candidate}
          evaluation={evaluationsById.get(candidate.variantId)}
          fallback={false}
          key={candidate.variantId}
          outcome={evaluation.outcome}
        />)}
      </div>
    </section>
  );
}

function selectedCandidatePresentations(
  context: AlertVariationAuthoringContext,
  document: AlertEditorDocument
): readonly VariationCandidatePresentation[] {
  return context.candidates.map((candidate) => candidate.editorId !== document.id ? candidate : {
    ...candidate,
    name: document.name,
    enabled: document.enabled,
    conditions: candidate.kind === "variation" ? document.variantConditions : candidate.conditions,
    weight: document.weight,
    priority: document.priority
  });
}

function CandidateExplanation({ candidate, evaluation, fallback, outcome }: {
  readonly candidate: VariationCandidatePresentation;
  readonly evaluation: AlertVariationSampleEvaluation["candidates"][number] | undefined;
  readonly fallback: boolean;
  readonly outcome: AlertVariationSampleEvaluation["outcome"];
}) {
  return (
    <div className="alert-editor-inspector__selection-candidate">
      <strong>{candidate.name}</strong>
      <span>{candidateExplanationCopy(candidate, evaluation, fallback, outcome)}</span>
    </div>
  );
}

function candidateExplanationCopy(
  candidate: VariationCandidatePresentation,
  evaluation: AlertVariationSampleEvaluation["candidates"][number] | undefined,
  fallback: boolean,
  outcome: AlertVariationSampleEvaluation["outcome"]
): string {
  if (evaluation?.enabled === false || (evaluation === undefined && !candidate.enabled)) return "Disabled — not a candidate.";
  if (outcome === "rule-no-match") return "The shared rule does not match, so this alert is not evaluated.";
  if (evaluation?.conditionsMatch === false) return `Sample does not match ${conditionSummaryList(candidate.conditions)}.`;
  if (evaluation?.relativeChance !== null && evaluation?.relativeChance !== undefined) {
    const chance = evaluation.relativeChance;
    return `${chance.weight}/${chance.totalWeight} weight · ${formatPercentage(chance.percentage)} relative chance.`;
  }
  if (fallback && outcome === "default-fallback") return "Default plays as the fallback.";
  if (fallback) return "Fallback only; a matching conditional priority group is evaluated first.";
  if (evaluation?.conditionsMatch === true) return "Matches, but a higher-priority group is evaluated first.";
  return "Not a candidate for this sample.";
}

function priorityGroupOrderCopy(index: number, groupCount: number): string {
  if (index === 0) return "evaluated first";
  if (index === groupCount - 1) return "evaluated last";
  return "evaluated next";
}

function conditionSummaryList(conditions: readonly EditorCondition[]): string {
  return conditions.length === 0 ? "this variation's conditions" : "its variation conditions";
}

function formatPercentage(value: number): string {
  return `${Number.isInteger(value) ? value : Number(value.toFixed(2))}%`;
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

function editableCondition(condition: AlertCondition): EditorCondition {
  if (condition.operator === "oneOf") {
    return { ...condition, value: [...condition.value] };
  }
  if (
    typeof condition.value === "string"
    || typeof condition.value === "number"
    || typeof condition.value === "boolean"
  ) {
    return { ...condition, value: condition.value };
  }
  return { ...condition, value: [condition.value[0], condition.value[1]] };
}
