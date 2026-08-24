import { describe, expect, it } from "vitest";
import {
  formatManagementRoute,
  getManagementRouteDefinition,
  managementPrimaryRoutes,
  parseManagementRoute
} from "./management-route.js";

describe("management route model", () => {
  it.each([
    ["/manage", "home"],
    ["/manage/event-sources", "event-sources"],
    ["/manage/tts-providers", "tts-providers"],
    ["/manage/modules/alerts", "modules-alerts"],
    ["/manage/modules/alerts/safety", "alert-safety"],
    ["/manage/assets", "assets"],
    ["/manage/diagnostics", "diagnostics"],
    ["/manage/settings", "settings"]
  ] as const)("parses %s as %s", (path, expectedId) => {
    expect(parseManagementRoute(path).id).toBe(expectedId);
  });

  it("falls back to Home for unknown paths", () => {
    expect(parseManagementRoute("/not-a-real-page")).toEqual(parseManagementRoute("/manage"));
    expect(parseManagementRoute("/legacy/modules")).toEqual({ id: "home" });
    expect(parseManagementRoute("/legacy/overlays")).toEqual({ id: "home" });
    expect(parseManagementRoute("/legacy/playback")).toEqual({ id: "home" });
  });

  it("formats stable route IDs without using editable labels", () => {
    expect(formatManagementRoute({ id: "modules-alerts" })).toBe("/manage/modules/alerts");
    expect(managementPrimaryRoutes.map((route) => route.label)).toEqual([
      "Home",
      "Event sources",
      "TTS providers",
      "Modules",
      "Assets",
      "Diagnostics",
      "Settings"
    ]);
    expect(managementPrimaryRoutes.map((route) => route.id)).toEqual([
      "home",
      "event-sources",
      "tts-providers",
      "modules-alerts",
      "assets",
      "diagnostics",
      "settings"
    ]);
  });

  it("formats the nested alert safety route and exposes its breadcrumbs", () => {
    expect(formatManagementRoute({ id: "alert-safety" })).toBe("/manage/modules/alerts/safety");
    expect(getManagementRouteDefinition({ id: "alert-safety" })).toMatchObject({
      id: "alert-safety",
      breadcrumbs: ["Modules", "Alerts", "Safety"]
    });
    expect(managementPrimaryRoutes.find((route) => route.id === "modules-alerts")?.childRoutes.map((route) => route.id)).toEqual([
      "modules-alerts",
      "alert-safety"
    ]);
  });

  it("parses a focused alert editor route with decoded query context", () => {
    expect(
      parseManagementRoute(
        "/manage/modules/alerts/editor/alert%2Ffollow?profile=vertical&event=channel_point_redemption&set=set%20main"
      )
    ).toEqual({
      id: "alert-editor",
      alertId: "alert/follow",
      setId: "set main",
      eventType: "channel_point_redemption",
      targetProfileId: "vertical"
    });
    expect(parseManagementRoute("/manage/modules/alerts/editor/alert-follow")).toEqual({
      id: "alert-editor",
      alertId: "alert-follow"
    });
    expect(parseManagementRoute("/manage/modules/alerts/editor/alert-follow?diagnostic=ref-event-1")).toMatchObject({
      id: "alert-editor",
      alertId: "alert-follow",
      diagnosticReferenceId: "ref-event-1"
    });
    expect(parseManagementRoute("/manage/modules/alerts?diagnostic=ref-output-1#browser-sources")).toEqual({
      id: "modules-alerts",
      diagnosticReferenceId: "ref-output-1",
      fragment: "browser-sources"
    });
    expect(formatManagementRoute({
      id: "modules-alerts",
      diagnosticReferenceId: "ref-output-1",
      fragment: "browser-sources"
    })).toBe("/manage/modules/alerts?diagnostic=ref-output-1#browser-sources");
  });

  it("preserves non-editor deep-link context", () => {
    expect(parseManagementRoute("/manage/event-sources?setup=add&provider=provider%20main")).toEqual({
      id: "event-sources",
      providerId: "provider main",
      setup: "add"
    });
    expect(parseManagementRoute("/manage/modules/alerts?set=set%20seasonal")).toEqual({
      id: "modules-alerts",
      setId: "set seasonal"
    });
    expect(parseManagementRoute("/manage/diagnostics?reference=ref%2041")).toEqual({
      id: "diagnostics",
      referenceId: "ref 41"
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
      "/manage/modules/alerts/editor/alert%2Ffollow?set=set+main&event=channel_point_redemption&profile=vertical"
    );
    expect(parseManagementRoute(formatManagementRoute(route))).toEqual(route);
  });

  it("returns focused editor breadcrumbs without adding an editor navigation item", () => {
    expect(getManagementRouteDefinition({ id: "alert-editor", alertId: "alert-follow" })).toMatchObject({
      id: "alert-editor",
      path: "/manage/modules/alerts/editor/:alertId",
      breadcrumbs: ["Modules", "Alerts", "Alert editor"]
    });
    expect(managementPrimaryRoutes.map((route) => route.id)).not.toContain("alert-editor");
  });
});
