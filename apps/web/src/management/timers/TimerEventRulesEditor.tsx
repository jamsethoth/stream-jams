import { Button, Checkbox, NativeSelect, TextInput } from "@mantine/core";
import { streamEventTypes, type StreamEventType, type TimerEventRule } from "@stream-jams/core";

type TimerRuleSource = "any" | "twitch" | "streamerbot";
type TimerRuleTier = "1000" | "2000" | "3000" | "prime";
const tierEventTypes: readonly string[] = ["subscription", "resubscription", "gift_subscription", "community_gift"];
const countBearingEventTypes: readonly string[] = ["cheer", "raid", "gift_subscription", "community_gift"];

const newRule: TimerEventRule = {
  enabled: true,
  selector: { match: { kind: "canonical", type: "channel_point_redemption" }, sources: "any", conditions: [] },
  action: "start", amountMs: 60_000, quantityUnit: null, inactiveBehavior: "ignore"
};

function ruleSource(rule: TimerEventRule): TimerRuleSource {
  const { sources } = rule.selector;
  return sources === "any" || sources.length !== 1 ? "any" : sources[0]!;
}

function equalsCondition(rule: TimerEventRule, field: string): string | null {
  const condition = rule.selector.conditions.find((entry) => entry.field === field && entry.operator === "equals");
  return condition !== undefined && typeof condition.value === "string" ? condition.value : null;
}

/** Replaces the reward and tier filters the editor owns, keeping any other authored conditions. */
function withFilters(rule: TimerEventRule, rewardId: string | null, tier: string | null): TimerEventRule["selector"]["conditions"] {
  const kept = rule.selector.conditions.filter((entry) => !((entry.field === "channelPointReward" || entry.field === "tier") && entry.operator === "equals"));
  return [
    ...(rewardId === null ? [] : [{ field: "channelPointReward", operator: "equals", value: rewardId } as const]),
    ...(tier === null ? [] : [{ field: "tier", operator: "equals", value: tier } as const]),
    ...kept
  ];
}

export function TimerEventRulesEditor({ rules, onChange }: { readonly rules: readonly TimerEventRule[]; readonly onChange: (rules: readonly TimerEventRule[]) => void }) {
  const update = (index: number, patch: Partial<TimerEventRule>) => onChange(rules.map((rule, position) => position === index ? { ...rule, ...patch } : rule));
  const updateSelector = (index: number, rule: TimerEventRule, selector: Partial<TimerEventRule["selector"]>, patch: Partial<TimerEventRule> = {}) =>
    update(index, { ...patch, selector: { ...rule.selector, ...selector } });
  return <fieldset className="timer-event-rules"><legend>Event rules</legend><p>Rules run in order. Save the timer to apply changes. Timers reopen paused.</p>
    {rules.length === 0 ? <p>No event rules configured.</p> : null}
    {rules.map((rule, index) => <fieldset key={index}><legend>Rule {index + 1}</legend>
      <Checkbox label="Enabled" checked={rule.enabled} onChange={event => update(index, { enabled: event.currentTarget.checked })} />
      <NativeSelect label="Event source" value={ruleSource(rule)} onChange={event => { const source = event.currentTarget.value as TimerRuleSource; updateSelector(index, rule, { sources: source === "any" ? "any" : [source] }); }}><option value="any">Any active source</option><option value="twitch">Twitch</option><option value="streamerbot">Streamer.bot</option></NativeSelect>
      {rule.selector.match.kind === "canonical" ? <>
        <NativeSelect label="Event type" value={rule.selector.match.type} onChange={event => updateSelector(index, rule, { match: { kind: "canonical", type: event.currentTarget.value as StreamEventType }, conditions: [] }, { quantityUnit: null })}>{streamEventTypes.map(type => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}</NativeSelect>
        {rule.selector.match.type === "channel_point_redemption" ? <TextInput label="Reward ID (optional)" maxLength={120} value={equalsCondition(rule, "channelPointReward") ?? ""} onChange={event => updateSelector(index, rule, { conditions: withFilters(rule, event.currentTarget.value.trim() || null, equalsCondition(rule, "tier")) })} /> : null}
        {tierEventTypes.includes(rule.selector.match.type) ? <NativeSelect label="Subscription tier" value={equalsCondition(rule, "tier") ?? ""} onChange={event => updateSelector(index, rule, { conditions: withFilters(rule, equalsCondition(rule, "channelPointReward"), (event.currentTarget.value || null) as TimerRuleTier | null) })}><option value="">Any tier</option><option value="1000">Tier 1</option><option value="2000">Tier 2</option><option value="3000">Tier 3</option><option value="prime">Prime</option></NativeSelect> : null}
      </> : <p>Trigger: {rule.selector.match.kind === "twitch-reward" ? `Twitch reward ${rule.selector.match.rewardId}` : `Streamer.bot ${rule.selector.match.sourceKey} ${rule.selector.match.eventType}`}</p>}
      <NativeSelect label="Action" value={rule.action} onChange={event => update(index, { action: event.currentTarget.value as TimerEventRule["action"] })}><option value="start">Start</option><option value="stop">Stop</option><option value="increment">Increment</option><option value="decrement">Decrement</option><option value="restart">Restart</option></NativeSelect>
      {rule.action === "increment" || rule.action === "decrement" ? <>
        <TextInput label="Adjustment (seconds)" type="number" min="0" value={rule.amountMs / 1000} onChange={event => update(index, { amountMs: Math.round(Number(event.currentTarget.value) * 1000) })} />
        {rule.selector.match.kind === "canonical" && countBearingEventTypes.includes(rule.selector.match.type) ? <TextInput label="Quantity per adjustment (blank for fixed time)" type="number" min="1" value={rule.quantityUnit ?? ""} onChange={event => update(index, { quantityUnit: event.currentTarget.value === "" ? null : Number(event.currentTarget.value) })} /> : null}
        <NativeSelect label="When timer is inactive" value={rule.inactiveBehavior} onChange={event => update(index, { inactiveBehavior: event.currentTarget.value as TimerEventRule["inactiveBehavior"] })}><option value="ignore">Do nothing</option><option value="start">Start saved duration and adjust</option><option value="paused">Create paused from saved duration and adjust</option></NativeSelect>
      </> : null}
      <Button color="red" variant="subtle" type="button" onClick={() => onChange(rules.filter((_, position) => position !== index))}>Remove rule {index + 1}</Button>
    </fieldset>)}
    <Button variant="default" type="button" disabled={rules.length >= 50} onClick={() => onChange([...rules, { ...newRule }])}>Add event rule</Button>
  </fieldset>;
}
