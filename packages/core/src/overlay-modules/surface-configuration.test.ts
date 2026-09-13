import { describe, expect, it } from "vitest";
import {
  reconcileSurfaceLayers,
  surfaceConfigurationSchema,
  validateSurfaceOrder
} from "./surface-configuration.js";

const desktop = {
  id: "desktop:primary", kind: "desktop", enabled: false, displayId: null,
  opacity: 1, layers: [{ moduleId: "alerts", visible: true }]
};

describe("surface configuration", () => {
  it("retains known order and visibility and adds new modules hidden at the bottom", () => {
    const saved = [{ moduleId: "removed", visible: true }, { moduleId: "alerts", visible: true }];
    expect(reconcileSurfaceLayers(saved, ["screen-effects", "alerts"])).toEqual([
      { moduleId: "alerts", visible: true }, { moduleId: "screen-effects", visible: false }
    ]);
    expect(saved).toHaveLength(2);
  });

  it("accepts complete reordered layers including an empty registry", () => {
    expect(() => validateSurfaceOrder([
      { moduleId: "screen-effects", visible: false }, { moduleId: "alerts", visible: true }
    ], ["alerts", "screen-effects"])).not.toThrow();
    expect(() => validateSurfaceOrder([], [])).not.toThrow();
  });

  it.each([
    { layers: [] },
    { layers: [{ moduleId: "alerts", visible: true }, { moduleId: "alerts", visible: false }] },
    { layers: [{ moduleId: "unknown", visible: true }] }
  ])("rejects incomplete, duplicate or unknown layer orders: %j", ({ layers }) => {
    expect(() => validateSurfaceOrder(layers, ["alerts"])).toThrow();
  });

  it("rejects duplicate registry IDs instead of creating duplicate rows", () => {
    expect(() => reconcileSurfaceLayers([], ["alerts", "alerts"])).toThrow();
    expect(() => validateSurfaceOrder(desktop.layers, ["alerts", "alerts"])).toThrow();
    expect(() => reconcileSurfaceLayers([...desktop.layers, ...desktop.layers], ["alerts"])).toThrow();
  });

  it.each([-0.01, 1.01, NaN, Infinity])("rejects invalid opacity %s", opacity => {
    expect(surfaceConfigurationSchema.safeParse({ ...desktop, opacity }).success).toBe(false);
  });

  it("preserves explicit monitor IDs and permits transparent opacity", () => {
    expect(surfaceConfigurationSchema.parse({ ...desktop, enabled: true, displayId: "4022276724", opacity: 0 }))
      .toEqual({ ...desktop, enabled: true, displayId: "4022276724", opacity: 0 });
    expect(surfaceConfigurationSchema.parse(desktop)).toEqual(desktop);
  });

  it.each([
    { enabled: true }, { displayId: "" }, { displayId: " 42 " }, { displayId: 42 },
    { id: "desktop:other" }, { generation: 1 }, { routeKey: "not-a-configuration-field" },
    { layers: [{ moduleId: "alerts", visible: true }, { moduleId: "alerts", visible: false }] }
  ])("rejects invalid desktop configuration %j", fields => {
    expect(surfaceConfigurationSchema.safeParse({ ...desktop, ...fields }).success).toBe(false);
  });

  it("binds unified identity to a stable output ID and rejects desktop-only fields", () => {
    const unified = { id: "unified-browser:overlay-main", kind: "unified-browser", overlayId: "overlay-main", layers: [] };
    expect(surfaceConfigurationSchema.parse(unified)).toEqual(unified);
    expect(surfaceConfigurationSchema.safeParse({ ...unified, id: "unified-browser:another" }).success).toBe(false);
    expect(surfaceConfigurationSchema.safeParse({ ...unified, displayId: "42" }).success).toBe(false);
  });
});
