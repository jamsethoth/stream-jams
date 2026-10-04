import { musicLimits, type AssetLibraryItem, type MusicAppearance } from "@stream-jams/core";
import { MusicNumberField, fitMusicInsets } from "./MusicAppearanceEditor.js";

export function heightForMusicImage(widthPx: number, image: Pick<AssetLibraryItem, "width" | "height">): number | null {
  if (image.width === null || image.height === null || !Number.isInteger(image.width) || !Number.isInteger(image.height) || image.width <= 0 || image.height <= 0) return null;
  return Math.min(musicLimits.heightPx.max, Math.max(musicLimits.heightPx.min, Math.round(widthPx * image.height / image.width)));
}

export function MusicBrandingEditor({ appearance, image, onChange, onPick }: {
  readonly appearance: MusicAppearance;
  readonly image: AssetLibraryItem | null;
  readonly onChange: (appearance: MusicAppearance) => void;
  readonly onPick: () => void;
}) {
  const brand = appearance.branding;
  const update = (patch: Partial<typeof brand>) => onChange({ ...appearance, branding: { ...brand, ...patch } });
  const aspectHeight = image === null ? null : heightForMusicImage(appearance.widthPx, image);
  return <section aria-label="Branding image" className="music-editor__section">
    <h3>Branding image</h3>
    <p>Place an uploaded image behind artwork, text, and progress. Album artwork changes with the song; this image stays with the saved view.</p>
    <div className="music-editor__actions"><span>{image?.displayName ?? (brand.assetId === null ? "No image" : `Image ${brand.assetId} unavailable`)}</span><button onClick={onPick} type="button">Choose branding image</button>{brand.assetId === null ? null : <button onClick={() => update({ assetId: null })} type="button">Remove image</button>}</div>
    {brand.assetId !== null && image === null ? <p role="status">The saved image is unavailable. The widget uses its native background until you replace it.</p> : null}
    <button disabled={aspectHeight === null} onClick={() => { if (aspectHeight !== null) onChange(fitMusicInsets({ ...appearance, heightPx: aspectHeight })); }} type="button">Use image aspect ratio</button>
    <p role="status">{aspectHeight === null ? "Choose an image with dimensions to use its aspect ratio." : `At the current width, this sets widget height to ${aspectHeight} px.`} Choosing an image alone does not resize the widget.</p>
    <div className="music-editor__grid">
      <label>Image fit<select value={brand.fit} onChange={event => update({ fit: event.currentTarget.value as typeof brand.fit })}><option value="contain">Contain — show the whole image</option><option value="cover">Cover — crop to fill</option><option value="fill">Fill — stretch to fit</option></select></label>
      <MusicNumberField label="Image horizontal position (%)" value={brand.xPercent} min={0} max={100} onCommit={xPercent => update({ xPercent })} />
      <MusicNumberField label="Image vertical position (%)" value={brand.yPercent} min={0} max={100} onCommit={yPercent => update({ yPercent })} />
      <MusicNumberField label="Image opacity (%)" value={brand.opacity} min={0} max={100} onCommit={opacity => update({ opacity })} />
    </div>
  </section>;
}
