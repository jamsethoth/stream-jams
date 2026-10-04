import { alertFontPresets, musicLimits, type MusicAppearance, type MusicProfileConfig, type MusicTypography } from "@stream-jams/core";
import { useEffect, useState } from "react";

export type MusicFontRole = "titleFont" | "detailsFont";

export function fitMusicInsets(view: MusicAppearance): MusicAppearance {
  const insets = { ...view.contentInsets };
  insets.left = Math.min(insets.left, view.widthPx - 1);
  insets.right = Math.min(insets.right, view.widthPx - insets.left - 1);
  insets.top = Math.min(insets.top, view.heightPx - 1);
  insets.bottom = Math.min(insets.bottom, view.heightPx - insets.top - 1);
  return { ...view, contentInsets: insets };
}

interface Props {
  readonly profile: MusicProfileConfig;
  readonly view: "full" | "compact";
  readonly onChange: (profile: MusicProfileConfig) => void;
  readonly onPickFont: (role: MusicFontRole) => void;
}

export function MusicAppearanceEditor({ profile, view, onChange, onPickFont }: Props) {
  const appearance = profile.views[view];
  const changeView = (next: MusicAppearance) => onChange({ ...profile, views: { ...profile.views, [view]: fitMusicInsets(next) } });
  const number = (label: string, key: keyof Pick<MusicAppearance, "widthPx" | "heightPx" | "artworkSizePx" | "paddingXPx" | "paddingYPx" | "gapPx" | "cornerRadiusPx" | "borderWidthPx">, bounds: { readonly min: number; readonly max: number }) =>
    <MusicNumberField key={key} label={label} value={appearance[key]} min={bounds.min} max={bounds.max} onCommit={value => changeView({ ...appearance, [key]: value })} />;
  const inset = (side: keyof MusicAppearance["contentInsets"]) =>
    <MusicNumberField key={side} label={`${side[0]!.toUpperCase()}${side.slice(1)} content inset (px)`} value={appearance.contentInsets[side]} min={0} max={Math.min(musicLimits.contentInsetPx.max, (side === "left" || side === "right" ? appearance.widthPx : appearance.heightPx) - appearance.contentInsets[side === "left" ? "right" : side === "right" ? "left" : side === "top" ? "bottom" : "top"] - 1)} onCommit={value => changeView({ ...appearance, contentInsets: { ...appearance.contentInsets, [side]: value } })} />;
  const color = (key: keyof MusicAppearance["colors"], label: string) => <MusicColorField key={key} label={label} value={appearance.colors[key]} onCommit={value => changeView({ ...appearance, colors: { ...appearance.colors, [key]: value } })} />;
  const typography = (role: MusicFontRole, label: string) => {
    const font = appearance[role];
    const update = (patch: Partial<MusicTypography>) => changeView({ ...appearance, [role]: { ...font, ...patch } });
    return <fieldset><legend>{label}</legend>
      <label>{label} preset<select value={font.fontPreset} onChange={event => update({ fontPreset: event.currentTarget.value as MusicTypography["fontPreset"] })}>{alertFontPresets.map(preset => <option key={preset.id} value={preset.id}>{preset.label}</option>)}</select></label>
      <span>{font.fontAssetId ?? "System font"}</span><button type="button" onClick={() => onPickFont(role)}>Choose {label.toLowerCase()} font</button>{font.fontAssetId === null ? null : <button type="button" onClick={() => update({ fontAssetId: null })}>Remove {label.toLowerCase()} font</button>}
      <MusicNumberField label={`${label} size (px)`} value={font.fontSizePx} min={8} max={144} onCommit={fontSizePx => update({ fontSizePx })} />
      <label>{label} weight<select value={font.fontWeight} onChange={event => update({ fontWeight: Number(event.currentTarget.value) })}>{[100, 200, 300, 400, 500, 600, 700, 800, 900].map(weight => <option key={weight} value={weight}>{weight}</option>)}</select></label>
      <MusicNumberField label={`${label} letter spacing (px)`} value={font.letterSpacingPx} min={musicLimits.letterSpacingPx.min} max={musicLimits.letterSpacingPx.max} allowFraction onCommit={letterSpacingPx => update({ letterSpacingPx })} />
      <label><input checked={font.italic} onChange={event => update({ italic: event.currentTarget.checked })} type="checkbox" /> Italic {label.toLowerCase()}</label>
      <label><input checked={font.underline} onChange={event => update({ underline: event.currentTarget.checked })} type="checkbox" /> Underline {label.toLowerCase()}</label>
    </fieldset>;
  };
  return <section className="music-editor__section" aria-label="Appearance controls">
    <h3>Appearance</h3>
    <div className="music-editor__grid">
      {number("Widget width (px)", "widthPx", musicLimits.widthPx)}{number("Widget height (px)", "heightPx", musicLimits.heightPx)}
      {number("Artwork size (px)", "artworkSizePx", musicLimits.artworkSizePx)}{number("Horizontal padding (px)", "paddingXPx", musicLimits.spacingPx)}
      {number("Vertical padding (px)", "paddingYPx", musicLimits.spacingPx)}{number("Content gap (px)", "gapPx", musicLimits.spacingPx)}
      {number("Corner radius (px)", "cornerRadiusPx", musicLimits.cornerRadiusPx)}{number("Border width (px)", "borderWidthPx", musicLimits.borderWidthPx)}
      {(["top", "right", "bottom", "left"] as const).map(inset)}
    </div>
    <div className="music-editor__grid">{([
      ["backgroundStart", "Background start RGBA"], ["backgroundEnd", "Background end RGBA"], ["title", "Title RGBA"], ["details", "Details RGBA"],
      ["artworkPlaceholder", "Artwork placeholder RGBA"], ["border", "Border RGBA"], ["progressFill", "Progress fill RGBA"], ["progressTrack", "Progress track RGBA"]
    ] as const).map(([key, label]) => color(key, label))}</div>
    <fieldset><legend>Shadow</legend><div className="music-editor__grid">
      {([ ["offsetX", "Shadow X (px)", -128, 128], ["offsetY", "Shadow Y (px)", -128, 128], ["blur", "Shadow blur (px)", 0, 128], ["spread", "Shadow spread (px)", -64, 64] ] as const).map(([key, label, min, max]) => <MusicNumberField key={key} label={label} min={min} max={max} value={appearance.shadow[key]} onCommit={value => changeView({ ...appearance, shadow: { ...appearance.shadow, [key]: value } })} />)}
      <MusicColorField label="Shadow RGBA" value={appearance.shadow.color} onCommit={color => changeView({ ...appearance, shadow: { ...appearance.shadow, color } })} />
    </div></fieldset>
    <div className="music-editor__fonts">{typography("titleFont", "Title")}{typography("detailsFont", "Details")}</div>
  </section>;
}

function MusicColorField({ label, value, onCommit }: { readonly label: string; readonly value: string; readonly onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState(false);
  useEffect(() => { setDraft(value); setError(false); }, [value]);
  return <label>{label}<input aria-invalid={error} onChange={event => { setDraft(event.currentTarget.value); setError(false); }} onBlur={() => {
    if (!/^#[0-9a-f]{8}$/iu.test(draft)) { setError(true); return; }
    setError(false); onCommit(draft.toUpperCase());
  }} value={draft} />{error ? <small role="alert">Use #RRGGBBAA.</small> : null}</label>;
}

export function MusicNumberField({ label, value, min, max, allowFraction = false, onCommit }: { readonly label: string; readonly value: number; readonly min: number; readonly max: number; readonly allowFraction?: boolean; readonly onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  const [error, setError] = useState(false);
  useEffect(() => { setDraft(String(value)); setError(false); }, [value]);
  const commit = () => {
    const next = Number(draft);
    if (draft.trim() === "" || !Number.isFinite(next) || (!allowFraction && !Number.isInteger(next)) || next < min || next > max) { setError(true); return; }
    setError(false); onCommit(next);
  };
  return <label>{label}<input aria-invalid={error} max={max} min={min} step={allowFraction ? "any" : 1} onBlur={commit} onChange={event => { setDraft(event.currentTarget.value); setError(false); }} onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }} type="number" value={draft} />{error ? <small role="alert">Enter a {allowFraction ? "number" : "whole number"} from {min} to {max}.</small> : null}</label>;
}
