import type { MediaAudioKind } from "./media-audio.js";
import type { PlaybackTiming } from "../overlays/playback-timing.js";

export interface AlertAudioOutputs {
  readonly browserSource: boolean;
  readonly deviceRouteIds: readonly string[];
}

export interface AudioOutputDevice {
  readonly deviceId: string;
  readonly label: string;
}

export interface AudioOutputRoute {
  readonly id: string;
  readonly name: string;
  readonly deviceId: string | null;
  readonly deviceLabel: string | null;
}

export interface AudioRouteReference {
  readonly alertId: string;
  readonly name: string;
}

export interface AudioDestination {
  readonly deviceId: string;
  readonly routeIds: readonly string[];
}

/** Device access is injected by the desktop host; the CLI has no device backend. */
export interface AudioDeviceHost {
  listOutputDevices(): Promise<readonly AudioOutputDevice[]>;
  /**
   * Plays the bundled one-second sound, observing authoritative mute throughout.
   * Settles only after silence, including on failure; never merely on media start.
   */
  testOutput(deviceId: string): Promise<void>;
  /** Explicit recovery after the desktop backend exhausts automatic recreation. */
  retry?(): Promise<void>;
}

export interface ResolvedAudioLayer {
  readonly sourceKind: MediaAudioKind;
  readonly layerId: string;
  readonly assetId: string;
  readonly volume: number;
}

export interface ResolvedAlertAudio {
  readonly documentId: string;
  readonly durationMs: number;
  readonly outputs: AlertAudioOutputs;
  readonly layers: readonly ResolvedAudioLayer[];
}

export interface DeviceAudioBatch {
  /** New occurrences carry a shared epoch; absent only for legacy audio callers. */
  readonly timing?: PlaybackTiming | undefined;
  readonly playbackId: string;
  readonly documentId: string;
  readonly durationMs: number;
  readonly muted: boolean;
  readonly layers: readonly ResolvedAudioLayer[];
  readonly destinations: readonly AudioDestination[];
}

export interface DeviceAudioResult {
  readonly failedRouteIds: readonly string[];
}

export interface AudioPlaybackSink {
  /** Settles only after terminal silence (including rejection), not merely on start. */
  play(batch: DeviceAudioBatch): Promise<DeviceAudioResult>;
  /** Resolves only after silence is established for this occurrence. */
  stop(playbackId: string): Promise<void>;
  setMuted(muted: boolean): Promise<void>;
  /** Cancels pending starts and resolves only once every output is silent. */
  close(): Promise<void>;
}
