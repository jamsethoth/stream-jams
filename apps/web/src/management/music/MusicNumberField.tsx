import { TextInput } from "@mantine/core";
import { useEffect, useState } from "react";

export function MusicNumberField({ label, value, min, max, allowFraction = false, onCommit }: { readonly label: string; readonly value: number; readonly min: number; readonly max: number; readonly allowFraction?: boolean; readonly onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  const [error, setError] = useState(false);
  useEffect(() => { setDraft(String(value)); setError(false); }, [value]);
  const commit = () => {
    const next = Number(draft);
    if (draft.trim() === "" || !Number.isFinite(next) || (!allowFraction && !Number.isInteger(next)) || next < min || next > max) { setError(true); return; }
    setError(false); onCommit(next);
  };
  return <TextInput label={label} error={error ? `Enter a ${allowFraction ? "number" : "whole number"} from ${min} to ${max}.` : false} errorProps={{ role: "alert" }} max={max} min={min} step={allowFraction ? "any" : 1} onBlur={commit} onChange={event => { setDraft(event.currentTarget.value); setError(false); }} onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }} type="number" value={draft} />;
}
