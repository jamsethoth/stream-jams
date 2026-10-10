import type { MusicSnapshot } from "@stream-jams/core";
import { useEffect, useState } from "react";
import type { MusicApi } from "./music-api.js";

const pollIntervalMs = 1_000;

export interface LiveMusicPreview {
  /** Current track from the selected source, or null while nothing is playing or the source is not connected. */
  readonly snapshot: MusicSnapshot | null;
  /** Local object URL for the current track's artwork, or null when there is none. */
  readonly artworkUrl: string | null;
}

/** Polls live playback for the layout preview while the page is visible. Failures fall back to the sample track. */
export function useLiveMusicPreview(api: Pick<MusicApi, "getMusicNowPlaying" | "getMusicArtwork">): LiveMusicPreview {
  const [snapshot, setSnapshot] = useState<MusicSnapshot | null>(null);
  const [artwork, setArtwork] = useState<{ readonly ref: string; readonly url: string } | null>(null);

  useEffect(() => {
    let live = true;
    let timer: number | undefined;
    const poll = async () => {
      if (document.visibilityState !== "hidden") {
        try {
          const next = await api.getMusicNowPlaying();
          if (live) setSnapshot(current => sameSnapshot(current, next.snapshot) ? current : next.snapshot?.track ? next.snapshot : null);
        }
        // error-provenance: allow expected -- the preview falls back to its sample track while live playback is unavailable
        catch { if (live) setSnapshot(null); }
      }
      if (live) timer = window.setTimeout(() => void poll(), pollIntervalMs);
    };
    void poll();
    return () => { live = false; window.clearTimeout(timer); };
  }, [api]);

  const artworkRef = snapshot?.track?.artworkRef ?? null;
  useEffect(() => {
    if (artworkRef === null) { setArtwork(null); return; }
    let live = true;
    let url: string | null = null;
    void api.getMusicArtwork(artworkRef).then(blob => {
      if (!live || typeof URL.createObjectURL !== "function") return;
      url = URL.createObjectURL(blob);
      setArtwork({ ref: artworkRef, url });
    }).catch(
      // error-provenance: allow expected -- missing or expired artwork shows the artwork placeholder
      () => { if (live) setArtwork(null); }
    );
    return () => { live = false; if (url !== null) URL.revokeObjectURL(url); };
  }, [api, artworkRef]);

  return { snapshot, artworkUrl: artwork !== null && artwork.ref === artworkRef ? artwork.url : null };
}

function sameSnapshot(current: MusicSnapshot | null, next: MusicSnapshot | null): boolean {
  return current?.generation === next?.generation && current?.revision === next?.revision;
}
