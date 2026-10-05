import { describe, expect, it } from "vitest";
import { createDefaultOverlayModuleRegistry } from "./module-registry.js";
import {
  DefaultOverlayModuleConfigService,
  InMemoryOverlayModuleConfigRepository,
  InvalidOverlayModuleConfigError,
  UnknownOverlayModuleError
} from "./module-config-service.js";
import type { OverlayModuleConfig } from "./types.js";

const now = new Date("2026-05-30T03:00:00.000Z");
const later = new Date("2026-05-30T03:05:00.000Z");

function createService(clock: () => Date = () => now) {
  const repository = new InMemoryOverlayModuleConfigRepository();
  const service = new DefaultOverlayModuleConfigService({
    registry: createDefaultOverlayModuleRegistry(),
    repository,
    clock
  });

  return { repository, service };
}

describe("overlay module config service", () => {
  it("loads Music disabled and hydrates saved older CSS and branding defaults", async () => {
    const { service, repository } = createService();
    const initial = await service.getModuleConfig("music");
    expect(initial.enabled).toBe(false);
    expect(initial.config).toMatchObject({ version: 1, css: { source: "", enabled: false, styleContractVersion: 1 } });
    const older = structuredClone(initial.config) as { css?: unknown; profiles: Record<string, { views: Record<string, { branding?: unknown; contentInsets?: unknown }> }> };
    delete older.css;
    for (const profile of Object.values(older.profiles)) for (const view of Object.values(profile.views)) {
      delete view.branding;
      delete view.contentInsets;
    }
    await repository.saveModuleConfig({ ...initial, config: older });
    const loaded = await service.getModuleConfig("music");
    expect(loaded.config).toMatchObject({ css: { source: "", enabled: false, styleContractVersion: 1 }, profiles: { landscape: { views: { full: { branding: { assetId: null }, contentInsets: { top: 0 } } } } } });
  });
  it("returns disabled bounded Landscape and Vertical defaults for Timers", async () => {
    const { service } = createService();

    await expect(service.getModuleConfig("timers")).resolves.toMatchObject({
      moduleId: "timers",
      enabled: false,
      config: {
        profiles: {
          landscape: { orientation: "vertical", maxVisible: 4 },
          vertical: { orientation: "vertical", maxVisible: 4 }
        }
      }
    });
  });

  it("rejects out-of-bounds and unknown Timer stack configuration without replacing saved state", async () => {
    const { service } = createService(() => later);
    const saved = await service.saveModuleConfig({
      moduleId: "timers",
      enabled: true,
      config: {
        profiles: {
          landscape: { layout: { x: 0, y: 0, width: 400, height: 200, zIndex: 1 }, orientation: "horizontal", maxVisible: 3 },
          vertical: { layout: { x: 0, y: 0, width: 300, height: 600, zIndex: 1 }, orientation: "vertical", maxVisible: 5 }
        }
      }
    });

    await expect(service.saveModuleConfig({
      moduleId: "timers",
      enabled: true,
      config: {
        profiles: {
          landscape: { layout: { x: 1800, y: 0, width: 400, height: 200, zIndex: 1 }, orientation: "horizontal", maxVisible: 3 },
          vertical: { layout: { x: 0, y: 0, width: 300, height: 600, zIndex: 1 }, orientation: "vertical", maxVisible: 13, unknown: true }
        }
      }
    })).rejects.toBeInstanceOf(InvalidOverlayModuleConfigError);
    await expect(service.getModuleConfig("timers")).resolves.toEqual(saved);
  });

  it("returns default module config when no config has been saved", async () => {
    const { service } = createService();

    await expect(service.getModuleConfig("alerts")).resolves.toEqual({
      moduleId: "alerts",
      enabled: true,
      config: {
        canvas: {
          width: 1920,
          height: 1080
        }
      },
      updatedAt: now.toISOString()
    });
  });

  it("saves and reads module config through the repository boundary", async () => {
    const { service } = createService(() => later);

    const savedConfig = await service.saveModuleConfig({
      moduleId: "alerts",
      enabled: false,
      config: {
        canvas: {
          width: 1280,
          height: 720
        }
      }
    });

    expect(savedConfig).toEqual({
      moduleId: "alerts",
      enabled: false,
      config: {
        canvas: {
          width: 1280,
          height: 720
        }
      },
      updatedAt: later.toISOString()
    });
    await expect(service.getModuleConfig("alerts")).resolves.toEqual(savedConfig);
  });


  it("rejects invalid Alerts canvas config before saving", async () => {
    const { service } = createService();

    await expect(
      service.saveModuleConfig({
        moduleId: "alerts",
        enabled: true,
        config: {
          canvas: {
            width: -1,
            height: "1080"
          }
        }
      })
    ).rejects.toBeInstanceOf(InvalidOverlayModuleConfigError);
  });

  it("rejects unknown Alerts config fields without replacing saved config", async () => {
    const { service } = createService(() => later);
    const savedConfig = await service.saveModuleConfig({
      moduleId: "alerts",
      enabled: false,
      config: {
        canvas: {
          width: 1280,
          height: 720
        }
      }
    });

    await expect(
      service.saveModuleConfig({
        moduleId: "alerts",
        enabled: true,
        config: {
          canvas: {
            width: 1920,
            height: 1080
          },
          collection: {
            name: "Default"
          }
        }
      })
    ).rejects.toBeInstanceOf(InvalidOverlayModuleConfigError);
    await expect(service.getModuleConfig("alerts")).resolves.toEqual(savedConfig);
  });

  it("toggles enabled state without replacing existing module config", async () => {
    const { service } = createService(() => later);
    await service.saveModuleConfig({
      moduleId: "alerts",
      enabled: true,
      config: {
        canvas: {
          width: 1600,
          height: 900
        }
      }
    });

    const disabledConfig = await service.setModuleEnabled("alerts", false);

    expect(disabledConfig).toEqual({
      moduleId: "alerts",
      enabled: false,
      config: {
        canvas: {
          width: 1600,
          height: 900
        }
      },
      updatedAt: later.toISOString()
    });
  });

  it("rejects unknown module config reads, saves, and toggles", async () => {
    const { service } = createService();

    await expect(service.getModuleConfig("unknown-module")).rejects.toBeInstanceOf(UnknownOverlayModuleError);
    await expect(
      service.saveModuleConfig({
        moduleId: "unknown-module",
        enabled: true,
        config: {}
      })
    ).rejects.toBeInstanceOf(UnknownOverlayModuleError);
    await expect(service.setModuleEnabled("unknown-module", true)).rejects.toBeInstanceOf(UnknownOverlayModuleError);
  });


  it("rejects invalid persisted Alerts config records before returning them", async () => {
    const repository = new InMemoryOverlayModuleConfigRepository([
      {
        moduleId: "alerts",
        enabled: true,
        config: {
          canvas: {
            width: 1920,
            height: 0
          }
        },
        updatedAt: now.toISOString()
      }
    ]);
    const service = new DefaultOverlayModuleConfigService({
      registry: createDefaultOverlayModuleRegistry(),
      repository,
      clock: () => now
    });

    await expect(service.getModuleConfig("alerts")).rejects.toBeInstanceOf(InvalidOverlayModuleConfigError);
  });

  it("rejects invalid persisted config records before returning them", async () => {
    const repository = new InMemoryOverlayModuleConfigRepository([
      {
        moduleId: "alerts",
        enabled: true,
        config: {},
        updatedAt: "not-a-date"
      } as OverlayModuleConfig
    ]);
    const service = new DefaultOverlayModuleConfigService({
      registry: createDefaultOverlayModuleRegistry(),
      repository,
      clock: () => now
    });

    await expect(service.getModuleConfig("alerts")).rejects.toBeInstanceOf(InvalidOverlayModuleConfigError);
  });
});
