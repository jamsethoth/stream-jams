import type { VideoAudioSettings } from "@stream-jams/core";
import "./media-control-toggle.css";
import { MediaVolumeControl } from "./MediaVolumeControl.js";

export function MediaAudioControls({ value, hasSeparateAudio, onChange, disabled = false, checkboxClassName = "alert-editor-inspector__check" }: {
  readonly value: VideoAudioSettings;
  readonly hasSeparateAudio: boolean;
  readonly onChange: (value: VideoAudioSettings) => void;
  readonly disabled?: boolean;
  readonly checkboxClassName?: string;
}) {
  return <fieldset disabled={disabled}>
    <legend>Video audio</legend>
    <label className={`${checkboxClassName} media-control-toggle`}>
      <input type="checkbox" checked={value.playEmbeddedAudio} onChange={(event) => onChange({ ...value, playEmbeddedAudio: event.currentTarget.checked })} />
      Play embedded audio
    </label>
    {value.playEmbeddedAudio ? <MediaVolumeControl label="Embedded audio volume" value={value.audioVolume}
      disabled={!value.playEmbeddedAudio} onChange={(audioVolume) => onChange({ ...value, audioVolume })} /> : null}
    <p>The soundtrack uses this alert’s audio outputs. Save to apply changes.</p>
    {value.playEmbeddedAudio && hasSeparateAudio ? <p>Both the video soundtrack and separate audio will play. Turn off embedded audio if you only want the separate audio.</p> : null}
  </fieldset>;
}
