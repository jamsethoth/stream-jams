export const OVERLAY_PLAYER_SCHEME = "stream-jams-overlay";
export const OVERLAY_PLAYER_URL = "stream-jams-overlay://surface/";
export const overlayPlayerScheme = {
  scheme: OVERLAY_PLAYER_SCHEME,
  privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
} as const;
