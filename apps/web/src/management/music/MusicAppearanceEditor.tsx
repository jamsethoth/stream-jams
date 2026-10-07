import { Button, Checkbox, NativeSelect } from "@mantine/core";
import { alertFontPresets, musicLimits, type MusicAppearance, type MusicProfileConfig, type MusicTypography } from "@stream-jams/core";
import { useEffect, useState } from "react";
import { MusicNumberField } from "./MusicNumberField.js";


export type MusicFontRole = "titleFont" | "detailsFont";

import { fitMusicInsets } from "./music-widget-size.js";
export { fitMusicInsets } from "./music-widget-size.js";

interface Props {
  readonly selectedComponent?: "widget" | "artwork" | "title" | "details" | "progress";
  readonly onSelectComponent?: (component: "widget" | "artwork" | "title" | "details" | "progress") => void;
  readonly profile: MusicProfileConfig;
  readonly view: "full" | "compact";
  readonly onChange: (profile: MusicProfileConfig) => void;
  readonly onPickFont: (role: MusicFontRole) => void;
}

export function MusicAppearanceEditor({ profile, view, onChange, onPickFont, selectedComponent = "widget", onSelectComponent }: Props) {
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
      <NativeSelect label={`${label} preset`} value={font.fontPreset} onChange={event => update({ fontPreset: event.currentTarget.value as MusicTypography["fontPreset"] })}>{alertFontPresets.map(preset => <option key={preset.id} value={preset.id}>{preset.label}</option>)}</NativeSelect>
      <span>{font.fontAssetId ?? "System font"}</span><Button variant="default" type="button" onClick={() => onPickFont(role)}>Choose {label.toLowerCase()} font</Button>{font.fontAssetId === null ? null : <Button variant="default" type="button" onClick={() => update({ fontAssetId: null })}>Remove {label.toLowerCase()} font</Button>}
      <MusicNumberField label={`${label} size (px)`} value={font.fontSizePx} min={8} max={144} onCommit={fontSizePx => update({ fontSizePx })} />
      <details><summary>More text options</summary><div className="music-editor__grid">
      <NativeSelect label={`${label} weight`} value={font.fontWeight} onChange={event => update({ fontWeight: Number(event.currentTarget.value) })}>{[100, 200, 300, 400, 500, 600, 700, 800, 900].map(weight => <option key={weight} value={weight}>{weight}</option>)}</NativeSelect>
      <MusicNumberField label={`${label} letter spacing (px)`} value={font.letterSpacingPx} min={musicLimits.letterSpacingPx.min} max={musicLimits.letterSpacingPx.max} allowFraction onCommit={letterSpacingPx => update({ letterSpacingPx })} />
      <Checkbox label={<>Italic {label.toLowerCase()}</>} checked={font.italic} onChange={event => update({ italic: event.currentTarget.checked })} />
      <Checkbox label={<>Underline {label.toLowerCase()}</>} checked={font.underline} onChange={event => update({ underline: event.currentTarget.checked })} />
    </div></details></fieldset>;
  };
  return <section className="music-editor__section" aria-label="Appearance controls">
    <NativeSelect label="Appearance component" value={selectedComponent} onChange={event => onSelectComponent?.(event.currentTarget.value as NonNullable<Props["selectedComponent"]>)}>
      {(["widget", "artwork", "title", "details", "progress"] as const).map(component => <option key={component} value={component}>{component[0]!.toUpperCase() + component.slice(1)}</option>)}
    </NativeSelect>
    {selectedComponent === "widget" ? <>
    <div className="music-editor__grid">
      {number("Widget width (px)", "widthPx", musicLimits.widthPx)}{number("Widget height (px)", "heightPx", musicLimits.heightPx)}
      {number("Horizontal padding (px)", "paddingXPx", musicLimits.spacingPx)}{number("Vertical padding (px)", "paddingYPx", musicLimits.spacingPx)}
      {number("Content gap (px)", "gapPx", musicLimits.spacingPx)}{number("Corner radius (px)", "cornerRadiusPx", musicLimits.cornerRadiusPx)}{number("Border width (px)", "borderWidthPx", musicLimits.borderWidthPx)}
    </div>
    <div className="music-editor__grid">{color("backgroundStart", "Background start RGBA")}{color("backgroundEnd", "Background end RGBA")}{color("border", "Border RGBA")}</div>
    <details><summary>Advanced spacing</summary><div className="music-editor__grid">{(["top", "right", "bottom", "left"] as const).map(inset)}</div></details>
    <NativeSelect label="Shadow preset" value={appearance.shadow.color.endsWith("00") ? "off" : appearance.shadow.offsetX === 0 && appearance.shadow.offsetY === 4 && appearance.shadow.blur === 12 && appearance.shadow.spread === 0 && appearance.shadow.color === "#00000033" ? "subtle" : appearance.shadow.offsetX === 0 && appearance.shadow.offsetY === 18 && appearance.shadow.blur === 50 && appearance.shadow.spread === 0 && appearance.shadow.color === "#00000047" ? "strong" : "custom"} onChange={event => { const preset = event.currentTarget.value; if (preset === "custom") return; changeView({ ...appearance, shadow: preset === "off" ? { ...appearance.shadow, color: appearance.shadow.color.slice(0, 7) + "00" } : { offsetX: 0, offsetY: preset === "subtle" ? 4 : 18, blur: preset === "subtle" ? 12 : 50, spread: 0, color: preset === "subtle" ? "#00000033" : "#00000047" } }); }}>
      <option value="off">Off</option><option value="subtle">Subtle</option><option value="strong">Strong</option><option value="custom">Custom</option>
    </NativeSelect>
    <details><summary>Custom shadow</summary><div className="music-editor__shadow"><div className="music-editor__grid music-editor__shadow-dimensions">
      {([ ["offsetX", "Shadow X (px)", -128, 128], ["offsetY", "Shadow Y (px)", -128, 128], ["blur", "Shadow blur (px)", 0, 128], ["spread", "Shadow spread (px)", -64, 64] ] as const).map(([key, label, min, max]) => <MusicNumberField key={key} label={label} min={min} max={max} value={appearance.shadow[key]} onCommit={value => changeView({ ...appearance, shadow: { ...appearance.shadow, [key]: value } })} />)}
    </div>
      <MusicColorField label="Shadow RGBA" value={appearance.shadow.color} onCommit={color => changeView({ ...appearance, shadow: { ...appearance.shadow, color } })} />
    </div></details></> : null}
    {selectedComponent === "artwork" ? <div className="music-editor__artwork"><div className="music-editor__grid">{number("Artwork size (px)", "artworkSizePx", musicLimits.artworkSizePx)}</div>{color("artworkPlaceholder", "Artwork placeholder RGBA")}</div> : null}
    {selectedComponent === "title" || selectedComponent === "details" ? <>
      {color(selectedComponent, `${selectedComponent === "title" ? "Title" : "Details"} RGBA`)}
      {typography(selectedComponent === "title" ? "titleFont" : "detailsFont", selectedComponent === "title" ? "Title" : "Details")}
    </> : null}
    {selectedComponent === "progress" ? <div className="music-editor__grid">{color("progressFill", "Progress fill RGBA")}{color("progressTrack", "Progress track RGBA")}</div> : null}
  </section>;
}

function MusicColorField({ label, value, onCommit }: { readonly label: string; readonly value: string; readonly onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState(false);
  useEffect(() => { setDraft(value); setError(false); }, [value]);
  const name = label.replace(/ RGBA$/u, "");
  const alpha = value.slice(7);
  const opacity = Math.round(Number.parseInt(alpha, 16) * 100 / 255);
  return <div className="music-editor__color-control">
    <span>{name}</span>
    <div className="music-editor__color-row"><input aria-label={`${name} color`} type="color" value={value.slice(0, 7)} onChange={event => onCommit(`${event.currentTarget.value}${alpha}`)} />
      <input aria-label={label} aria-invalid={error} onChange={event => { setDraft(event.currentTarget.value); setError(false); }} onBlur={() => {
        if (!/^#[0-9a-f]{8}$/iu.test(draft)) { setError(true); return; }
        setError(false); onCommit(draft.toUpperCase());
      }} onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }} value={draft} />
    </div>
    <label><span>Opacity · {opacity}%</span><input aria-label={`${name} opacity`} type="range" min={0} max={100} value={opacity} onChange={event => onCommit(`${value.slice(0, 7)}${Math.round(Number(event.currentTarget.value) * 255 / 100).toString(16).padStart(2, "0").toUpperCase()}`)} /></label>
    {error ? <small role="alert">Use #RRGGBBAA.</small> : null}
  </div>;
}

export { MusicNumberField } from "./MusicNumberField.js";
