import { Button, Checkbox, NativeSelect, TextInput } from "@mantine/core";
import { streamEventTypes, type TimerEventRule } from "@stream-jams/core";

const newRule: TimerEventRule = { enabled: true, ingestProvider: "any", eventType: "channel_point_redemption", rewardId: null, tier: null, action: "start", amountMs: 60_000, quantityUnit: null, inactiveBehavior: "ignore" };
export function TimerEventRulesEditor({ rules, onChange }: { readonly rules: readonly TimerEventRule[]; readonly onChange: (rules: readonly TimerEventRule[]) => void }) {
  const update = (index: number, patch: Partial<TimerEventRule>) => onChange(rules.map((rule, position) => position === index ? { ...rule, ...patch } : rule));
  return <fieldset className="timer-event-rules"><legend>Event rules</legend><p>Rules run in order. Save the timer to apply changes. Timers reopen paused.</p>
    {rules.length === 0 ? <p>No event rules configured.</p> : null}
    {rules.map((rule, index) => <fieldset key={index}><legend>Rule {index + 1}</legend>
      <Checkbox label="Enabled" checked={rule.enabled} onChange={event => update(index, { enabled: event.currentTarget.checked })} />
      <NativeSelect label="Event source" value={rule.ingestProvider} onChange={event => update(index, { ingestProvider: event.currentTarget.value as TimerEventRule["ingestProvider"] })}><option value="any">Any active source</option><option value="twitch">Twitch</option><option value="streamerbot">Streamer.bot</option></NativeSelect>
      <NativeSelect label="Event type" value={rule.eventType} onChange={event => update(index, { eventType: event.currentTarget.value as TimerEventRule["eventType"], rewardId: null, tier: null, quantityUnit: null })}>{streamEventTypes.map(type => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}</NativeSelect>
      {rule.eventType === "channel_point_redemption" ? <TextInput label="Reward ID (optional)" maxLength={120} value={rule.rewardId ?? ""} onChange={event => update(index, { rewardId: event.currentTarget.value.trim() || null })} /> : null}
      {["subscription", "resubscription", "gift_subscription", "community_gift"].includes(rule.eventType) ? <NativeSelect label="Subscription tier" value={rule.tier ?? ""} onChange={event => update(index, { tier: (event.currentTarget.value || null) as TimerEventRule["tier"] })}><option value="">Any tier</option><option value="1000">Tier 1</option><option value="2000">Tier 2</option><option value="3000">Tier 3</option><option value="prime">Prime</option></NativeSelect> : null}
      <NativeSelect label="Action" value={rule.action} onChange={event => update(index, { action: event.currentTarget.value as TimerEventRule["action"] })}><option value="start">Start</option><option value="stop">Stop</option><option value="increment">Increment</option><option value="decrement">Decrement</option><option value="restart">Restart</option></NativeSelect>
      {rule.action === "increment" || rule.action === "decrement" ? <>
        <TextInput label="Adjustment (seconds)" type="number" min="0" value={rule.amountMs / 1000} onChange={event => update(index, { amountMs: Math.round(Number(event.currentTarget.value) * 1000) })} />
        {["cheer", "raid", "gift_subscription", "community_gift"].includes(rule.eventType) ? <TextInput label="Quantity per adjustment (blank for fixed time)" type="number" min="1" value={rule.quantityUnit ?? ""} onChange={event => update(index, { quantityUnit: event.currentTarget.value === "" ? null : Number(event.currentTarget.value) })} /> : null}
        <NativeSelect label="When timer is inactive" value={rule.inactiveBehavior} onChange={event => update(index, { inactiveBehavior: event.currentTarget.value as TimerEventRule["inactiveBehavior"] })}><option value="ignore">Do nothing</option><option value="start">Start saved duration and adjust</option><option value="paused">Create paused from saved duration and adjust</option></NativeSelect>
      </> : null}
      <Button color="red" variant="subtle" type="button" onClick={() => onChange(rules.filter((_, position) => position !== index))}>Remove rule {index + 1}</Button>
    </fieldset>)}
    <Button variant="default" type="button" disabled={rules.length >= 50} onClick={() => onChange([...rules, { ...newRule }])}>Add event rule</Button>
  </fieldset>;
}
