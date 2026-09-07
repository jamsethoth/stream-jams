import { describe, expect, it } from "vitest";
import {
  AUDIO_PLAYER_ORIGIN,
  AUDIO_PLAYER_URL,
  isAllowedAudioPlayerPermission,
  isExplicitAudioOutputDeviceId
} from "./audio-player-policy.js";

describe("audio player permissions", () => {
  const trusted = {
    senderId: 7,
    expectedSenderId: 7,
    requestingOrigin: AUDIO_PLAYER_ORIGIN,
    requestingUrl: AUDIO_PLAYER_URL,
    isMainFrame: true
  };

  it("allows speaker selection only for the exact app-owned main frame", () => {
    expect(isAllowedAudioPlayerPermission({ ...trusted, permission: "speaker-selection" })).toBe(true);
    expect(isAllowedAudioPlayerPermission({ ...trusted, permission: "media" })).toBe(false);
    expect(isAllowedAudioPlayerPermission({ ...trusted, permission: "speaker-selection", senderId: 8 })).toBe(false);
    expect(isAllowedAudioPlayerPermission({ ...trusted, permission: "speaker-selection", requestingOrigin: "https://example.test" })).toBe(false);
    expect(isAllowedAudioPlayerPermission({ ...trusted, permission: "speaker-selection", requestingUrl: `${AUDIO_PLAYER_URL}child` })).toBe(false);
    expect(isAllowedAudioPlayerPermission({ ...trusted, permission: "speaker-selection", isMainFrame: false })).toBe(false);
  });
});

describe("explicit output device IDs", () => {
  it("rejects browser aliases and blank IDs", () => {
    expect(isExplicitAudioOutputDeviceId("endpoint-a")).toBe(true);
    expect(isExplicitAudioOutputDeviceId("default")).toBe(false);
    expect(isExplicitAudioOutputDeviceId("communications")).toBe(false);
    expect(isExplicitAudioOutputDeviceId(" ")).toBe(false);
  });
});
