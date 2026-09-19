import type { Meta, StoryObj } from "@storybook/react-vite";
import type { AssetLibraryItem, PlaybackDurationMode } from "@stream-jams/core";
import { useState } from "react";
import { AudioFadeControls } from "./AudioFadeControls.js";
import { MediaAudioControls } from "./MediaAudioControls.js";
import { MediaDurationControls } from "./MediaDurationControls.js";

const meta = {
  title: "Management/Audio/Media timing controls",
  component: MediaTimingExample,
  parameters: { layout: "padded" }
} satisfies Meta<typeof MediaTimingExample>;

export default meta;
type Story = StoryObj<typeof meta>;

export const MediaLinkedWithFades: Story = {};

export const CompactInactiveControls: Story = {
  render: () => <CompactInactiveControlsExample />
};

function MediaTimingExample() {
  const [mode, setMode] = useState<PlaybackDurationMode>("media");
  const [durationMs, setDurationMs] = useState(8_500);
  const [fades, setFades] = useState({ fadeInMs: 500, fadeOutMs: 500 });
  return <div className="management-card" style={{ maxWidth: 440 }}>
    <h2>Playback timing</h2>
    <MediaDurationControls mode={mode} durationMs={durationMs} assets={[mediaAsset]}
      assetIds={[mediaAsset.id]} fallbackDurationMs={5_000}
      onChange={(value) => { setMode(value.mode); setDurationMs(value.durationMs); }} />
    <AudioFadeControls {...fades} onChange={setFades} />
  </div>;
}

function CompactInactiveControlsExample() {
  const [mode, setMode] = useState<PlaybackDurationMode>("media");
  const [durationMs, setDurationMs] = useState(8_500);
  const [fades, setFades] = useState({ fadeInMs: 0, fadeOutMs: 0 });
  const [videoAudio, setVideoAudio] = useState({ playEmbeddedAudio: false, audioVolume: 1 });
  return <div className="management-card" style={{ maxWidth: 440 }}>
    <h2>Inactive timing options</h2>
    <MediaDurationControls mode={mode} durationMs={durationMs} assets={[mediaAsset]}
      assetIds={[mediaAsset.id]} fallbackDurationMs={5_000}
      onChange={(value) => { setMode(value.mode); setDurationMs(value.durationMs); }} />
    <MediaAudioControls hasSeparateAudio={false} onChange={setVideoAudio} value={videoAudio} />
    <AudioFadeControls {...fades} onChange={setFades} />
  </div>;
}

const mediaAsset: AssetLibraryItem = {
  id: "storybook-audio", displayName: "Celebration sting", originalFileName: "celebration.ogg",
  mediaType: "audio", mimeType: "audio/ogg", sizeBytes: 1_024, width: null, height: null,
  durationMs: 8_500, health: "available", tags: ["alert"],
  createdAt: "2026-09-18T00:00:00.000Z", updatedAt: "2026-09-18T00:00:00.000Z",
  usage: { assetId: "storybook-audio", totalUsageCount: 0, usages: [] }
};
