import { describe, expect, it } from "vitest";
import {
  formatManagementRoute,
  getManagementRouteDefinition,
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

  it("parses a focused alert editor route with decoded query context", () => {
    expect(
      parseManagementRoute(
        "/modules/alerts/editor/alert%2Ffollow?profile=vertical&event=channel_point_redemption&set=set%20main"
      )
    ).toEqual({
      id: "alert-editor",
      alertId: "alert/follow",
      setId: "set main",
      eventType: "channel_point_redemption",
      targetProfileId: "vertical"
    });
    expect(parseManagementRoute("/modules/alerts/editor/alert-follow")).toEqual({
      id: "alert-editor",
      alertId: "alert-follow"
    });
    expect(parseManagementRoute("/modules/alerts/editor/alert-follow?diagnostic=ref-event-1")).toMatchObject({
      id: "alert-editor",
      alertId: "alert-follow"
    });
    expect(parseManagementRoute("/modules/alerts?diagnostic=ref-output-1#browser-sources")).toEqual({
      id: "modules-alerts"
    });
  });

  it("formats focused alert editor context in deterministic query order", () => {
    const route = {
      id: "alert-editor",
      alertId: "alert/follow",
      setId: "set main",
      eventType: "channel_point_redemption",
      targetProfileId: "vertical"
    } as const;

    expect(formatManagementRoute(route)).toBe(
      "/modules/alerts/editor/alert%2Ffollow?set=set+main&event=channel_point_redemption&profile=vertical"
    );
    expect(parseManagementRoute(formatManagementRoute(route))).toEqual(route);
  });

  it("returns focused editor breadcrumbs without adding an editor navigation item", () => {
    expect(getManagementRouteDefinition({ id: "alert-editor", alertId: "alert-follow" })).toMatchObject({
      id: "alert-editor",
      path: "/modules/alerts/editor/:alertId",
      breadcrumbs: ["Modules", "Alerts", "Alert editor"]
    });
    expect(managementPrimaryRoutes.map((route) => route.id)).not.toContain("alert-editor");
  });
});
