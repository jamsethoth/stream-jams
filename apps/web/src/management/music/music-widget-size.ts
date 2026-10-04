import { fitMusicComponentLayout, musicLimits, type MusicAppearance } from "@stream-jams/core";

export function fitMusicInsets(view: MusicAppearance): MusicAppearance {
  const insets = { ...view.contentInsets };
  insets.left = Math.min(insets.left, view.widthPx - 1);
  insets.right = Math.min(insets.right, view.widthPx - insets.left - 1);
  insets.top = Math.min(insets.top, view.heightPx - 1);
  insets.bottom = Math.min(insets.bottom, view.heightPx - insets.top - 1);
  return { ...view, contentInsets: insets };
}

export function resizeMusicAppearance(appearance: MusicAppearance, width: number, height: number, maxWidth: number = musicLimits.widthPx.max, maxHeight: number = musicLimits.heightPx.max): MusicAppearance {
  return fitMusicComponentLayout(fitMusicInsets({ ...appearance,
    widthPx: Math.max(musicLimits.widthPx.min, Math.min(maxWidth, Math.round(width))),
    heightPx: Math.max(musicLimits.heightPx.min, Math.min(maxHeight, Math.round(height)))
  }));
}
