import { describe, expect, it } from "vitest";
import {
  formatManagementRoute,
  managementPrimaryRoutes,
  parseManagementRoute
} from "./management-route.js";

describe("management route model", () => {
  it.each([
    ["/", "home"],
    ["/home", "home"],
    ["/event-sources", "event-sources"],
    ["/tts-providers", "tts-providers"],
    ["/modules/alerts", "modules-alerts"],
    ["/assets", "assets"],
    ["/diagnostics", "diagnostics"],
    ["/settings", "settings"],
    ["/legacy/modules", "legacy-modules"],
    ["/legacy/overlays", "legacy-overlays"],
    ["/legacy/playback", "legacy-playback"]
  ] as const)("parses %s as %s", (path, expectedId) => {
    expect(parseManagementRoute(path).id).toBe(expectedId);
  });

  it("falls back to Home for unknown paths", () => {
    expect(parseManagementRoute("/not-a-real-page")).toEqual(parseManagementRoute("/"));
  });

  it("formats stable route IDs without using editable labels", () => {
    expect(formatManagementRoute({ id: "modules-alerts" })).toBe("/modules/alerts");
    expect(managementPrimaryRoutes.map((route) => route.label)).toEqual([
      "Home",
      "Event sources",
      "TTS providers",
      "Modules",
      "Assets",
      "Diagnostics",
      "Settings"
    ]);
  });
});
