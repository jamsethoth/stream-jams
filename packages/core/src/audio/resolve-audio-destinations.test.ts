import { expect, it } from "vitest";
import { resolveAudioDestinations } from "./resolve-audio-destinations.js";

it("deduplicates explicit devices while retaining all route identities", () => {
  expect(resolveAudioDestinations(["a", "b", "a", "c"], [
    { id: "a", name: "Me", deviceId: "headphones", deviceLabel: "Headphones", autoFollowDeviceName: false },
    { id: "b", name: "Monitor", deviceId: "headphones", deviceLabel: "Headphones", autoFollowDeviceName: false },
    { id: "c", name: "Stream", deviceId: "stream", deviceLabel: "Stream", autoFollowDeviceName: false }
  ], new Set(["headphones", "stream"]))).toEqual({
    destinations: [{ deviceId: "headphones", routeIds: ["a", "b"] }, { deviceId: "stream", routeIds: ["c"] }],
    unavailableRouteIds: []
  });
});

it("never falls back for missing, unbound, disconnected or alias destinations", () => {
  expect(resolveAudioDestinations(["missing", "unbound", "lost", "default", "communications"], [
    { id: "unbound", name: "Unbound", deviceId: null, deviceLabel: null, autoFollowDeviceName: false },
    { id: "lost", name: "Lost", deviceId: "lost-device", deviceLabel: "Lost", autoFollowDeviceName: false },
    { id: "default", name: "Default", deviceId: "default", deviceLabel: "Default", autoFollowDeviceName: false },
    { id: "communications", name: "Calls", deviceId: "communications", deviceLabel: "Calls", autoFollowDeviceName: false }
  ], new Set(["default", "communications", "some-other-device"]))).toEqual({
    destinations: [], unavailableRouteIds: ["missing", "unbound", "lost", "default", "communications"]
  });
});
