export const AUDIO_PLAYER_ORIGIN = "stream-jams-audio://player/";
export const AUDIO_PLAYER_URL = AUDIO_PLAYER_ORIGIN;

export interface AudioPlayerPermissionRequest {
  readonly permission: string;
  readonly senderId: number | null;
  readonly expectedSenderId: number;
  readonly requestingOrigin: string;
  readonly requestingUrl: string;
  readonly isMainFrame: boolean;
}

export function isAllowedAudioPlayerPermission(request: AudioPlayerPermissionRequest): boolean {
  return request.permission === "speaker-selection" &&
    request.senderId === request.expectedSenderId &&
    request.requestingOrigin === AUDIO_PLAYER_ORIGIN &&
    request.requestingUrl === AUDIO_PLAYER_URL &&
    request.isMainFrame;
}

export function isExplicitAudioOutputDeviceId(deviceId: string): boolean {
  const normalized = deviceId.trim();
  return normalized !== "" && normalized !== "default" && normalized !== "communications";
}
