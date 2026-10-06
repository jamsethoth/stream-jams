import { Button, Checkbox } from "@mantine/core";
import type { EffectVariant } from "@stream-jams/core";
import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import type { MediaPreviewApi } from "../assets/media-preview-api.js";
import { useMediaPreviewGroup } from "../assets/use-media-preview-group.js";
import { useMediaVolumeEnvelope } from "../../media/use-media-volume-envelope.js";

/** Local draft playback. No admission API or configured output routes are used. */
export function ScreenEffectPreview({ assetApi, variant, ref }: {
  readonly ref?: Ref<{ play(): void }>;
  readonly assetApi: MediaPreviewApi;
  readonly assetDurations: ReadonlyMap<string, number | null>;
  readonly variant: EffectVariant;
}) {
  const ids = [variant.visual?.assetId, variant.sound?.assetId].filter((id): id is string => id !== undefined);
  const { group, descriptors, unavailable } = useMediaPreviewGroup(assetApi, ids);
  const loaded = ids.every(id => descriptors[id] !== undefined);
  const urls = loaded ? { visual: variant.visual === null ? null : descriptors[variant.visual.assetId]?.url ?? null, sound: variant.sound === null ? null : descriptors[variant.sound.assetId]?.url ?? null } : null;
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [run, setRun] = useState(0);
  const video = useRef<HTMLVideoElement>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useMediaVolumeEnvelope(video, variant.visual?.mediaType === "video" ? {
    volume: variant.visual.audioVolume,
    fadeInMs: variant.visual.audioFadeInMs ?? 0,
    fadeOutMs: variant.visual.audioFadeOutMs ?? 0,
    playbackDurationMs: Math.min(descriptors[variant.visual.assetId]?.snapshot.durationMs ?? variant.durationMs, variant.durationMs),
    muted: muted || !variant.visual.playEmbeddedAudio
  } : null, playing);
  useMediaVolumeEnvelope(audio, variant.sound === null ? null : {
    volume: variant.sound.volume,
    fadeInMs: variant.sound.fadeInMs ?? 0,
    fadeOutMs: variant.sound.fadeOutMs ?? 0,
    playbackDurationMs: Math.min(descriptors[variant.sound.assetId]?.snapshot.durationMs ?? variant.durationMs, variant.durationMs),
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

  const visualUrl = urls?.visual;
  const soundUrl = urls?.sound;
  const registerImage = useCallback((element: HTMLImageElement | null) => {
    if (element !== null && group !== null && variant.visual !== null) return group.registerElement(element, variant.visual.assetId);
    return undefined;
  }, [group, variant.visual?.assetId]);
  useEffect(() => {
    const cleanups: (() => void)[] = [];
    if (group !== null) {
      if (variant.visual !== null && video.current !== null) cleanups.push(group.registerElement(video.current, variant.visual.assetId));
      if (variant.sound !== null && audio.current !== null) cleanups.push(group.registerElement(audio.current, variant.sound.assetId));
    }
    return () => { for (const cleanup of cleanups) cleanup(); };
  }, [group, visualUrl, soundUrl, variant.visual?.assetId, variant.sound?.assetId]);
  useEffect(() => {
    if (unavailable) { stop(); setError("Preview media expired. Reselect the assets and retry."); }
  }, [unavailable, stop]);
  useEffect(() => () => {
    generation.current += 1;
    if (timer.current !== null) clearTimeout(timer.current);
  }, []);

  async function play() {
    stop();
    const current = generation.current;
    setError(null);
    setRun((value) => value + 1);
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
    }
    // error-provenance: allow cleanup -- teardown must continue after this best-effort cleanup step
    catch {
      if (current !== generation.current) return;
      stop();
      setError("Preview playback could not start. Check the media and browser audio permissions, then press Play preview to retry.");
    }
  }

  const visual = variant.visual;
  const style = visual === null ? undefined : {
    position: "absolute" as const,
    left: `${visual.layout.x / 1920 * 100}%`, top: `${visual.layout.y / 1080 * 100}%`,
    width: `${visual.layout.width / 1920 * 100}%`, height: `${visual.layout.height / 1080 * 100}%`
  };
  return <>
    <p className="screen-effect-editor__stage-help">Local draft preview with sound. No live outputs or triggers are sent.</p>
    {error === null ? null : <p role="alert">{error}</p>}
    <div aria-label="1920 by 1080 preview canvas" className="screen-effect-preview__canvas">
      {urls === null ? <p>Loading preview media…</p> : visual === null ? <p>Audio-only effect</p> :
        <div style={style}>
          {visual.mediaType === "video"
            ? <video aria-label="Preview video" muted={muted || !visual.playEmbeddedAudio} onError={() => { stop(); setError("Preview video could not load. Check the asset and reselect it."); }} ref={video} src={urls.visual ?? undefined} />
            : visual.mediaType === "gif" && !playing ? null : <img ref={registerImage} referrerPolicy="no-referrer" key={run} alt={`${variant.name} preview`} src={urls.visual ?? undefined} onError={() => { stop(); setError("Preview image could not load. Check the asset and reselect it."); }} />}
        </div>}
    </div>
    {urls?.sound ? <audio aria-label="Preview sound" muted={muted} onError={() => { stop(); setError("Preview sound could not load. Check the asset and reselect it."); }} ref={audio} src={urls.sound} /> : null}
    <div className="screen-effect-preview__controls">
      <Button disabled={urls === null || (visual === null && variant.sound === null)} onClick={() => void play()} type="button">Play preview</Button>
      <Button variant="default" disabled={!playing} onClick={stop} type="button">Stop preview</Button>
      <Checkbox label="Mute preview" checked={muted} onChange={(event) => setMuted(event.currentTarget.checked)} />
    </div>
    <p aria-live="polite">{playing ? "Preview playing" : "Preview stopped"} · {variant.durationMs / 1000}s</p>
  </>;
}
