import { Button, TextInput } from "@mantine/core";
import { createDefaultTextWarp, evaluateTextWarp, insertTextWarpSplit, removeTextWarpSplit, type AlertTextWarp } from "@stream-jams/core";
import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

type Axis = "horizontal" | "vertical";
export function TextWarpEditor({ warp, onPreview, onCommit, onDone }: {
  readonly warp: AlertTextWarp;
  readonly onPreview: (value: AlertTextWarp | null) => void;
  readonly onCommit: (value: AlertTextWarp) => void;
  readonly onDone: () => void;
}) {
  const surface = useRef<HTMLDivElement>(null);
  const drag = useRef<{ index: number; before: AlertTextWarp; current: AlertTextWarp } | null>(null);
  const [selected, setSelected] = useState(0);
  const [split, setSplit] = useState<Axis | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const index = Math.min(selected, warp.points.length - 1);
  const point = warp.points[index]!;
  const row = Math.floor(index / warp.columns.length), column = index % warp.columns.length;
  function changePoint(source: AlertTextWarp, target: number, x: number, y: number) {
    return { ...source, points: source.points.map((item, i) => i === target ? { x: Math.max(-.5, Math.min(1.5, x)), y: Math.max(-1, Math.min(2, y)) } : item) };
  }
  function position(event: ReactPointerEvent) {
    const rect = surface.current!.getBoundingClientRect();
    return { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height };
  }
  function addSplit(event: ReactPointerEvent) {
    if (!split) return;
    event.stopPropagation();
    const target = position(event);
    let nearest = { distance: Infinity, u: 0, v: 0 };
    for (let y = 0; y <= 80; y++) for (let x = 0; x <= 80; x++) {
      const u = x / 80, v = y / 80, candidate = evaluateTextWarp(warp, u, v);
      const distance = (candidate.x - target.x) ** 2 + (candidate.y - target.y) ** 2;
      if (distance < nearest.distance) nearest = { distance, u, v };
    }
    const next = insertTextWarpSplit(warp, split, split === "horizontal" ? nearest.v : nearest.u);
    if (next === warp) setNotice("Choose a split farther from existing lines. The grid allows up to seven rows and columns within the warp bounds.");
    else { onCommit(next); setSelected(0); setNotice(null); }
    setSplit(null);
  }
  const guides = (["horizontal", "vertical"] as const).flatMap((axis) => (axis === "horizontal" ? warp.rows : warp.columns).map((fixed) => {
    const coordinates = Array.from({ length: 49 }, (_, step) => { const p = evaluateTextWarp(warp, axis === "horizontal" ? step / 48 : fixed, axis === "horizontal" ? fixed : step / 48); return `${step ? "L" : "M"}${p.x * 1000},${p.y * 1000}`; }).join(" ");
    return <path key={`${axis}:${fixed}`} d={coordinates} />;
  }));
  return <div className="text-warp-editor" ref={surface} onPointerDown={addSplit} onKeyDown={(event) => { event.stopPropagation(); if (event.key === "Escape") { if (drag.current) { drag.current = null; onPreview(null); } else if (split) setSplit(null); else onDone(); } }}>
    <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">{guides}</svg>
    {warp.points.map((handle, handleIndex) => <button key={handleIndex} type="button" className={`text-warp-editor__handle${handleIndex === index ? " text-warp-editor__handle--selected" : ""}`} aria-label={`Warp handle ${Math.floor(handleIndex / warp.columns.length) + 1}, ${handleIndex % warp.columns.length + 1}`} style={{ left: `${handle.x * 100}%`, top: `${handle.y * 100}%` }} onFocus={() => setSelected(handleIndex)}
      onPointerDown={(event) => { if (split) return; event.preventDefault(); event.stopPropagation(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId); drag.current = { index: handleIndex, before: warp, current: warp }; }}
      onPointerMove={(event) => { if (!drag.current || !event.currentTarget.hasPointerCapture(event.pointerId)) return; const target = position(event); const next = changePoint(drag.current.before, drag.current.index, target.x, target.y); drag.current.current = next; onPreview(next); }}
      onPointerUp={(event) => { event.stopPropagation(); if (!drag.current) return; const finished = drag.current; drag.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); onPreview(null); if (finished.current !== finished.before) onCommit(finished.current); }}
      onPointerCancel={() => { drag.current = null; onPreview(null); }}
      onKeyDown={(event) => { if (!event.key.startsWith("Arrow")) return; event.preventDefault(); event.stopPropagation(); const amount = event.shiftKey ? .05 : .005; onCommit(changePoint(warp, handleIndex, handle.x + (event.key === "ArrowLeft" ? -amount : event.key === "ArrowRight" ? amount : 0), handle.y + (event.key === "ArrowUp" ? -amount : event.key === "ArrowDown" ? amount : 0))); }} />)}
    <div className="text-warp-editor__toolbar" role="group" aria-label="Warp controls" onPointerDown={(event) => event.stopPropagation()}>
      <span>{warp.columns.length} columns × {warp.rows.length} rows</span>
      <Button variant="default" type="button" onClick={() => setSplit("horizontal")} disabled={warp.rows.length >= 7}>Add horizontal split</Button>
      <Button variant="default" type="button" onClick={() => setSplit("vertical")} disabled={warp.columns.length >= 7}>Add vertical split</Button>
      <Button variant="default" type="button" disabled={warp.rows.length <= 3 || row === 0 || row === warp.rows.length - 1} onClick={() => { onCommit(removeTextWarpSplit(warp, "horizontal", row)); setSelected(0); }}>Remove row</Button>
      <Button variant="default" type="button" disabled={warp.columns.length <= 3 || column === 0 || column === warp.columns.length - 1} onClick={() => { onCommit(removeTextWarpSplit(warp, "vertical", column)); setSelected(0); }}>Remove column</Button>
      <TextInput label="Handle X (%)" aria-label="Warp handle X" type="number" min={-50} max={150} step={1} value={Math.round(point.x * 100)} onChange={(event) => { const x = event.currentTarget.valueAsNumber / 100; if (Number.isFinite(x)) onCommit(changePoint(warp, index, x, point.y)); }} />
      <TextInput label="Handle Y (%)" aria-label="Warp handle Y" type="number" min={-100} max={200} step={1} value={Math.round(point.y * 100)} onChange={(event) => { const y = event.currentTarget.valueAsNumber / 100; if (Number.isFinite(y)) onCommit(changePoint(warp, index, point.x, y)); }} />
      <Button variant="default" type="button" onClick={() => { onCommit(createDefaultTextWarp()); setSelected(0); }}>Reset warp</Button>
      <Button variant="default" type="button" onClick={onDone}>Done</Button>
      {split ? <span role="status">Click the text to add a {split} split. Escape cancels.</span> : null}
      {notice ? <span role="status">{notice}</span> : null}
    </div>
  </div>;
}
