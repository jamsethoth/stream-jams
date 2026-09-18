import type { EffectVariant } from "@stream-jams/core";
import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { overlayPresetAnimationStyle } from "../../overlay/components/OverlaySurface.js";
import type { AssetApi } from "../assets/asset-api.js";
import { useMediaVolumeEnvelope } from "../../media/use-media-volume-envelope.js";

/** Local draft playback. No admission API or configured output routes are used. */
export function ScreenEffectPreview({ assetApi, variant, ref }: {
  readonly ref?: Ref<{ play(): void }>;
  readonly assetApi: Pick<AssetApi, "getAssetFile">;
  readonly variant: EffectVariant;
}) {
  const [urls, setUrls] = useState<{ visual: string | null; sound: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [run, setRun] = useState(0);
  const visualElement = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useMediaVolumeEnvelope(video, variant.visual?.mediaType === "video" ? {
    volume: variant.visual.audioVolume,
    fadeInMs: variant.visual.audioFadeInMs ?? 0,
    fadeOutMs: variant.visual.audioFadeOutMs ?? 0,
    playbackDurationMs: variant.durationMs,
    muted: muted || !variant.visual.playEmbeddedAudio
  } : null, playing);
  useMediaVolumeEnvelope(audio, variant.sound === null ? null : {
    volume: variant.sound.volume,
    fadeInMs: variant.sound.fadeInMs ?? 0,
    fadeOutMs: variant.sound.fadeOutMs ?? 0,
    playbackDurationMs: variant.durationMs,
    muted
  }, playing);

  const stop = useCallback(() => {
    generation.current += 1;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    for (const media of [video.current, audio.current]) {
      if (media !== null) { media.pause(); media.currentTime = 0; }
    }
    setPlaying(false);
  }, []);

  useEffect(() => { stop(); }, [variant, stop]);
  useImperativeHandle(ref, () => ({ play: () => { if (urls !== null) void play(); } }));

  useEffect(() => {
    let active = true;
    const created: string[] = [];
    async function load(id: string | undefined) {
      if (id === undefined) return null;
      const blob = await assetApi.getAssetFile(id);
      if (!active) return null;
      const url = URL.createObjectURL(blob);
      created.push(url);
      return url;
    }
    setUrls(null);
    setError(null);
    void Promise.all([load(variant.visual?.assetId), load(variant.sound?.assetId)])
      .then(([visual, sound]) => { if (active) setUrls({ visual, sound }); })
      .catch(() => { if (active) setError("Preview media could not load. Check the selected assets, reselect them, and retry."); });
    return () => {
      active = false;
      generation.current += 1;
      if (timer.current !== null) clearTimeout(timer.current);
      created.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [assetApi, variant.visual?.assetId, variant.sound?.assetId]);

  useEffect(() => {
    const videoElement = video.current;
    const audioElement = audio.current;
    return () => { videoElement?.pause(); audioElement?.pause(); };
  }, [urls]);

  async function play() {
    stop();
    const current = generation.current;
    setError(null);
    setRun((value) => value + 1);
    if (visualElement.current !== null) {
      visualElement.current.style.animationName = "none";
      void visualElement.current.offsetWidth;
      visualElement.current.style.animationName = String(overlayPresetAnimationStyle(variant.animation, variant.durationMs).animationName ?? "none");
    }
    setPlaying(true);
    timer.current = setTimeout(stop, variant.durationMs);
    try {
      const starts: Promise<void>[] = [];
      if (video.current !== null) {
        starts.push(video.current.play());
      }
      if (audio.current !== null) {
        starts.push(audio.current.play());
      }
      await Promise.all(starts);
    } catch {
      if (current !== generation.current) return;
      stop();
      setError("Preview playback could not start. Check the media and browser audio permissions, then press Play preview to retry.");
    }
  }

  const visual = variant.visual;
  const style = visual === null ? undefined : {
    position: "absolute" as const,
    left: `${visual.layout.x / 1920 * 100}%`, top: `${visual.layout.y / 1080 * 100}%`,
    width: `${visual.layout.width / 1920 * 100}%`, height: `${visual.layout.height / 1080 * 100}%`,
    ...(playing ? overlayPresetAnimationStyle(variant.animation, variant.durationMs) : {})
  };
  return <>
    <p className="screen-effect-editor__stage-help">Local draft preview with sound. No live outputs or triggers are sent.</p>
    {error === null ? null : <p role="alert">{error}</p>}
    <div aria-label="1920 by 1080 preview canvas" className="screen-effect-preview__canvas">
      {urls === null ? <p>Loading preview media…</p> : visual === null ? <p>Audio-only effect</p> :
        <div ref={visualElement} style={style}>
          {visual.mediaType === "video"
            ? <video aria-label="Preview video" muted={muted || !visual.playEmbeddedAudio} onError={() => { stop(); setError("Preview video could not load. Check the asset and reselect it."); }} ref={video} src={urls.visual ?? undefined} />
            : visual.mediaType === "gif" && !playing ? null : <img key={run} alt={`${variant.name} preview`} src={urls.visual ?? undefined} onError={() => { stop(); setError("Preview image could not load. Check the asset and reselect it."); }} />}
        </div>}
    </div>
    {urls?.sound ? <audio aria-label="Preview sound" muted={muted} onError={() => { stop(); setError("Preview sound could not load. Check the asset and reselect it."); }} ref={audio} src={urls.sound} /> : null}
    <div className="screen-effect-preview__controls">
      <button className="button button--primary" disabled={urls === null || (visual === null && variant.sound === null)} onClick={() => void play()} type="button">Play preview</button>
      <button className="button button--secondary" disabled={!playing} onClick={stop} type="button">Stop preview</button>
      <label className="screen-effects-check"><input checked={muted} onChange={(event) => setMuted(event.currentTarget.checked)} type="checkbox" />Mute preview</label>
    </div>
    <p aria-live="polite">{playing ? "Preview playing" : "Preview stopped"} · {variant.durationMs / 1000}s</p>
  </>;
}
