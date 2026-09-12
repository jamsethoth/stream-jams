import type { VideoAudioSettings } from "@stream-jams/core";

export function MediaAudioControls({ value, hasSeparateAudio, onChange, disabled = false }: {
  readonly value: VideoAudioSettings;
  readonly hasSeparateAudio: boolean;
  readonly onChange: (value: VideoAudioSettings) => void;
  readonly disabled?: boolean;
}) {
  return <fieldset disabled={disabled}>
    <legend>Video audio</legend>
    <label className="alert-editor-inspector__check">
      <input type="checkbox" checked={value.playEmbeddedAudio} onChange={(event) => onChange({ ...value, playEmbeddedAudio: event.currentTarget.checked })} />
      Play embedded audio
    </label>
    <label>Embedded audio volume
      <input type="number" min={0} max={1} step={0.01} value={value.audioVolume} disabled={!value.playEmbeddedAudio} onChange={(event) => {
        const audioVolume = event.currentTarget.valueAsNumber;
        if (Number.isFinite(audioVolume) && audioVolume >= 0 && audioVolume <= 1) onChange({ ...value, audioVolume });
      }} />
    </label>
    <p>The soundtrack uses this alert’s audio outputs. Save to apply changes.</p>
    {value.playEmbeddedAudio && hasSeparateAudio ? <p>Both the video soundtrack and separate audio will play. Turn off embedded audio if you only want the separate audio.</p> : null}
  </fieldset>;
}
