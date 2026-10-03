import { useState } from "react";
import "./timers.css";
import { MAX_TIMER_REMAINING_MS, type TimerAdjustment } from "@stream-jams/core";

export function TimerAdjustmentControls({ disabled, onApply }: {
  readonly disabled: boolean; readonly onApply: (input: TimerAdjustment) => Promise<void>;
}) {
  const [action, setAction] = useState<TimerAdjustment["action"]>("increment");
  const [seconds, setSeconds] = useState("60");
  const amountMs = Math.round(Number(seconds) * 1000);
  const valid = seconds.trim() !== "" && Number.isSafeInteger(amountMs) && amountMs >= 0 && amountMs <= MAX_TIMER_REMAINING_MS;
  return <fieldset className="timer-adjustment"><legend>Adjust remaining time</legend>
    <label>Adjustment<select disabled={disabled} value={action} onChange={event => setAction(event.currentTarget.value as TimerAdjustment["action"])}>
      <option value="increment">Add time</option><option value="decrement">Subtract time</option><option value="set">Set remaining time</option>
    </select></label>
    <label>Time (seconds)<input disabled={disabled} type="number" min="0" max={MAX_TIMER_REMAINING_MS / 1000} step="1" value={seconds} onChange={event => setSeconds(event.currentTarget.value)} /></label>
    <button disabled={disabled || !valid} onClick={() => void onApply({ action, amountMs })} type="button">Apply adjustment</button>
  </fieldset>;
}
