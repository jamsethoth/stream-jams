import { Checkbox } from "@mantine/core";
import type { VideoAudioSettings } from "@stream-jams/core";
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
    <Checkbox label="Play embedded audio" classNames={{ label: checkboxClassName }} disabled={disabled} checked={value.playEmbeddedAudio} onChange={(event) => onChange({ ...value, playEmbeddedAudio: event.currentTarget.checked })} />
    {value.playEmbeddedAudio ? <MediaVolumeControl label="Embedded audio volume" value={value.audioVolume}
      disabled={disabled || !value.playEmbeddedAudio} onChange={(audioVolume) => onChange({ ...value, audioVolume })} /> : null}
    <p>The soundtrack uses this alert’s audio outputs. Save to apply changes.</p>
    {value.playEmbeddedAudio && hasSeparateAudio ? <p>Both the video soundtrack and separate audio will play. Turn off embedded audio if you only want the separate audio.</p> : null}
  </fieldset>;
}
