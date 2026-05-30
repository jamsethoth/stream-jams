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

    await expect(service.getModuleConfig("music")).rejects.toBeInstanceOf(UnknownOverlayModuleError);
    await expect(
      service.saveModuleConfig({
        moduleId: "music",
        enabled: true,
        config: {}
      })
    ).rejects.toBeInstanceOf(UnknownOverlayModuleError);
    await expect(service.setModuleEnabled("music", true)).rejects.toBeInstanceOf(UnknownOverlayModuleError);
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
