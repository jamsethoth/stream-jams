/*
 * Camera formats the check offers. Chromium reports a camera's capabilities as ranges, not
 * a list of modes, so a preset is "advertised" when it fits the ranges and "native" only
 * when the camera accepts it with resizing turned off (probed in the pipeline page).
 */

export interface FormatPreset { readonly id: string; readonly width: number; readonly height: number; readonly frameRate: number }

/** In the order the gate runs them; 720p is the product's lower bound. */
export const formatPresets: readonly FormatPreset[] = [
  { id: "1080p30", width: 1920, height: 1080, frameRate: 30 },
  { id: "1440p30", width: 2560, height: 1440, frameRate: 30 },
  { id: "2160p30", width: 3840, height: 2160, frameRate: 30 },
  { id: "720p30", width: 1280, height: 720, frameRate: 30 }
];

interface Range { readonly min?: number | undefined; readonly max?: number | undefined }
export interface CameraCapabilities { readonly width?: Range | undefined; readonly height?: Range | undefined; readonly frameRate?: Range | undefined }

const within = (range: Range | undefined, value: number) =>
  range !== undefined && (range.min ?? 0) <= value && value <= (range.max ?? 0);

/** Presets inside the camera's advertised ranges; a camera that reports no ranges offers none. */
export function advertisedPresets(capabilities: CameraCapabilities): FormatPreset[] {
  const frameRate = capabilities.frameRate;
  return formatPresets.filter(preset => within(capabilities.width, preset.width) && within(capabilities.height, preset.height)
    // Cameras often advertise 29.97, which still counts as 30.
    && frameRate !== undefined && (frameRate.min ?? 0) <= preset.frameRate && (frameRate.max ?? 0) >= preset.frameRate - 0.5);
}

/** Constraints that open exactly this mode, failing rather than letting Chromium scale or crop. */
export function exactConstraints(deviceId: string, preset: Pick<FormatPreset, "width" | "height" | "frameRate">): MediaTrackConstraints {
  return {
    deviceId: { exact: deviceId },
    width: { exact: preset.width },
    height: { exact: preset.height },
    frameRate: { ideal: preset.frameRate, max: preset.frameRate },
    resizeMode: { exact: "none" }
  } as MediaTrackConstraints;
}
