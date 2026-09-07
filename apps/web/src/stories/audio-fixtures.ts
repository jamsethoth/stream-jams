import type { AudioOutputStatus } from "@stream-jams/core";
import type { AudioApi } from "../management/audio/audio-api.js";

export const storyAudioStatus: AudioOutputStatus = {
  capability: { available: true, devices: [{ deviceId: "story-headphones", label: "Headphones" }], reason: null, nextStep: null },
  muted: false,
  routes: [
    { route: { id: "private", name: "Private headphones", deviceId: "story-headphones", deviceLabel: "Headphones" }, state: "ready" },
    { route: { id: "stream", name: "Stream mix", deviceId: null, deviceLabel: null }, state: "unbound" }
  ]
};

export function createStoryAudioApi(overrides: Partial<AudioApi> = {}): AudioApi {
  return {
    getStatus: async () => structuredClone(storyAudioStatus),
    createRoute: async () => { throw new Error("Route creation is not configured for this story."); },
    updateRoute: async () => { throw new Error("Route updates are not configured for this story."); },
    deleteRoute: async () => { throw new Error("Route deletion is not configured for this story."); },
    testRoute: async (routeId) => ({ routeId, muted: false }),
    retry: async () => undefined,
    ...overrides
  };
}
