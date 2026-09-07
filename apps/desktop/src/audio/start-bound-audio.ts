export interface BoundAudioElement {
  volume: number;
  muted: boolean;
  setSinkId(id: string): Promise<void>;
  play(): Promise<void>;
  pause(): void;
}

export async function startBoundAudio(
  element: BoundAudioElement,
  deviceId: string,
  volume: number,
  muted: boolean,
  isCurrent: () => boolean
): Promise<void> {
  element.muted = muted;
  element.volume = volume;
  await element.setSinkId(deviceId);
  if (!isCurrent()) {
    return;
  }
  await element.play();
}
