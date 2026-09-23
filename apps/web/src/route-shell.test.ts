import { describe, expect, it } from "vitest";
import { resolveWebRouteShell } from "./route-shell.js";

describe("resolveWebRouteShell", () => {
  it.each([
    ["/manage", "management"],
    ["/manage/modules/alerts/editor/alert-1", "management"],
    ["/operator", "operator"],
    ["/operator/", "operator"],
    ["/overlay/modules/alerts/live/key", "overlay"],
    ["/overlay/unified/live/key", "overlay"],
    ["/overlay/modules/screen-effects/test/key", "overlay"],
    ["/unknown", "management"]
  ] as const)("routes %s to the %s shell", (pathname, expected) => {
    expect(resolveWebRouteShell(pathname)).toBe(expected);
  });
});
