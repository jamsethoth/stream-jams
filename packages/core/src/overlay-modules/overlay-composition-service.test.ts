import { describe, expect, it } from "vitest";
import { overlayCompositionSchema } from "../overlays/schemas.js";
import type { ModuleOutputRequest, OverlayInstruction, UnifiedOutputRequest } from "../overlays/types.js";
import {
  DefaultOverlayModuleConfigService,
  InMemoryOverlayModuleConfigRepository,
  UnknownOverlayModuleError
} from "./module-config-service.js";
import { createDefaultOverlayModuleRegistry } from "./module-registry.js";
import {
  DefaultOverlayCompositionService,
  InvalidOverlayModuleSnapshotError,
  type OverlayModuleRuntime,
  type OverlayModuleSnapshotRequest
} from "./overlay-composition-service.js";
import type { OverlayModuleSnapshot } from "./types.js";
import type { SurfaceConfiguration } from "./surface-configuration.js";

const now = new Date("2026-05-30T04:00:00.000Z");

function createCompositionService(runtime: OverlayModuleRuntime) {
  const registry = createDefaultOverlayModuleRegistry();
  const configService = new DefaultOverlayModuleConfigService({
    registry,
    repository: new InMemoryOverlayModuleConfigRepository(),
    clock: () => now
  });
  const compositionService = new DefaultOverlayCompositionService({
    configService,
    runtime
  });

  return { compositionService, configService };
}

function createInstruction(input: {
  overlayId: string;
  moduleId: string;
  purpose: "live" | "test";
  scope: "module" | "unified";
  targetProfileId?: "landscape" | "vertical" | null;
}): OverlayInstruction {
  return {
    id: `${input.scope}-${input.purpose}-instruction`,
    overlayId: input.overlayId,
    moduleId: input.moduleId,
    purpose: input.purpose,
    scope: input.scope,
    ...(input.targetProfileId === undefined ? {} : { targetProfileId: input.targetProfileId }),
    visual: null,
    audio: null,
    text: null,
    tts: null,
    durationMs: 1000
  };
}

class RecordingRuntime implements OverlayModuleRuntime {
  readonly requests: OverlayModuleSnapshotRequest[] = [];

  constructor(private readonly moduleId = "alerts") {}

  async getModuleSnapshot(request: OverlayModuleSnapshotRequest): Promise<OverlayModuleSnapshot> {
    this.requests.push(request);
    return {
      moduleId: this.moduleId,
      enabled: true,
      instructions: [createInstruction(request)]
    };
  }
}

describe("overlay composition service", () => {
  it("uses independent topmost-first surface rows without suppressing audio or changing module outputs", async () => {
    const surfaces: SurfaceConfiguration[] = [
      { id: "desktop:primary", kind: "desktop", enabled: false, displayId: null, displayLabel: null,
        autoFollowDisplayName: false, opacity: 1,
        layers: [{ moduleId: "alerts", visible: false }, { moduleId: "second", visible: true }] },
      { id: "unified-browser:overlay-main", kind: "unified-browser", overlayId: "overlay-main",
        layers: [{ moduleId: "alerts", visible: false }, { moduleId: "second", visible: true }] }
    ];
    const runtime: OverlayModuleRuntime = {
      async getModuleSnapshot(request) {
        return { moduleId: request.moduleId, enabled: true, instructions: [{ ...createInstruction(request),
          audio: { assetId: "sound", volume: 1 },
          visual: { assetId: "image", mediaType: "image", layout: { x: 0, y: 0, width: 100, height: 100, zIndex: 0 } }
        }] };
      }
    };
    const disabled = new Set<string>();
    const service = new DefaultOverlayCompositionService({ runtime,
      configService: { async getModuleConfig(moduleId) { return { moduleId, enabled: !disabled.has(moduleId), config: {}, updatedAt: now.toISOString() }; } },
      surfaceRepository: { async list() { return surfaces; } }
    });
    const request = { overlayId: "overlay-main", purpose: "live" as const, enabledModuleIds: ["alerts", "second"] };
    const composition = await service.resolveUnifiedOutput(request);
    expect(composition.modules.map(module => module.moduleId)).toEqual(["second", "alerts"]);
    expect(composition.modules[1]).toMatchObject({ surfaceLayer: { visible: false, zIndex: 1 } });
    expect(composition.modules[1]?.instructions[0]).toMatchObject({ id: "unified-live-instruction", visual: { assetId: "image" }, audio: { assetId: "sound", volume: 1 } });
    expect((await service.resolveModuleOutput({ ...request, moduleId: "alerts" })).modules[0]?.instructions[0]?.visual).not.toBeNull();
    surfaces[0]!.layers.reverse();
    expect(await service.resolveUnifiedOutput(request)).toEqual(composition);
    disabled.add("second");
    service.committedModuleConfig({ moduleId: "second", enabled: false, config: {}, updatedAt: now.toISOString() });
    expect((await service.resolveUnifiedOutput(request)).modules.map(module => module.moduleId)).toEqual(["alerts"]);
  });

  it("resolves enabled module-specific overlay output", async () => {
    const runtime = new RecordingRuntime();
    const { compositionService } = createCompositionService(runtime);
    const request: ModuleOutputRequest = {
      moduleId: "alerts",
      overlayId: "overlay-main",
      purpose: "test"
    };

    const composition = await compositionService.resolveModuleOutput(request);

    expect(composition).toMatchObject({
      overlayId: "overlay-main",
      purpose: "test",
      scope: "module",
      modules: [
        {
          moduleId: "alerts",
          enabled: true,
          instructions: [createInstruction({ ...request, scope: "module" })]
        }
      ]
    });
    expect(overlayCompositionSchema.safeParse(composition).success).toBe(true);
    expect(runtime.requests).toMatchObject([{ ...request, scope: "module", recipientKind: "browser" }]);
  });

  it("carries the target profile through module composition and runtime requests", async () => {
    const runtime = new RecordingRuntime();
    const { compositionService } = createCompositionService(runtime);

    const composition = await compositionService.resolveModuleOutput({
      moduleId: "alerts",
      overlayId: "overlay-main",
      purpose: "live",
      targetProfileId: "vertical"
    });

    expect(composition).toMatchObject({
      targetProfileId: "vertical"
    });
    expect(runtime.requests).toMatchObject([
      {
        moduleId: "alerts",
        overlayId: "overlay-main",
        purpose: "live",
        scope: "module",
        targetProfileId: "vertical"
      }
    ]);
  });

  it("excludes disabled modules from module-specific overlay output", async () => {
    const runtime = new RecordingRuntime();
    const { compositionService, configService } = createCompositionService(runtime);
    await configService.setModuleEnabled("alerts", false);

    const composition = await compositionService.resolveModuleOutput({
      moduleId: "alerts",
      overlayId: "overlay-main",
      purpose: "live"
    });

    expect(composition).toMatchObject({
      overlayId: "overlay-main",
      purpose: "live",
      scope: "module",
      modules: []
    });
    expect(runtime.requests).toEqual([]);
  });

  it("resolves unified overlay output for selected enabled modules", async () => {
    const runtime = new RecordingRuntime();
    const { compositionService } = createCompositionService(runtime);
    const request: UnifiedOutputRequest = {
      overlayId: "overlay-main",
      purpose: "live",
      enabledModuleIds: ["alerts"]
    };

    const composition = await compositionService.resolveUnifiedOutput(request);

    expect(composition).toMatchObject({
      overlayId: "overlay-main",
      purpose: "live",
      scope: "unified",
      modules: [
        {
          moduleId: "alerts",
          enabled: true,
          instructions: [createInstruction({ ...request, moduleId: "alerts", scope: "unified" })]
        }
      ]
    });
    expect(overlayCompositionSchema.safeParse(composition).success).toBe(true);
  });

  it("excludes disabled modules from unified overlay output", async () => {
    const runtime = new RecordingRuntime();
    const { compositionService, configService } = createCompositionService(runtime);
    await configService.setModuleEnabled("alerts", false);

    const composition = await compositionService.resolveUnifiedOutput({
      overlayId: "overlay-main",
      purpose: "test",
      enabledModuleIds: ["alerts"]
    });

    expect(composition.modules).toEqual([]);
    expect(runtime.requests).toEqual([]);
  });

  it("rejects unknown module ids deterministically", async () => {
    const runtime = new RecordingRuntime();
    const { compositionService } = createCompositionService(runtime);

    await expect(
      compositionService.resolveUnifiedOutput({
        overlayId: "overlay-main",
        purpose: "test",
        enabledModuleIds: ["unknown-module"]
      })
    ).rejects.toBeInstanceOf(UnknownOverlayModuleError);
  });


  it("rejects runtime instructions that do not match the requested output", async () => {
    const runtime: OverlayModuleRuntime = {
      async getModuleSnapshot(request) {
        return {
          moduleId: request.moduleId,
          enabled: true,
          instructions: [
            createInstruction({
              overlayId: request.overlayId,
              moduleId: request.moduleId,
              purpose: "test",
              scope: request.scope
            })
          ]
        };
      }
    };
    const { compositionService } = createCompositionService(runtime);

    await expect(
      compositionService.resolveModuleOutput({
        moduleId: "alerts",
        overlayId: "overlay-main",
        purpose: "live"
      })
    ).rejects.toBeInstanceOf(InvalidOverlayModuleSnapshotError);
  });

  it("rejects runtime snapshots for a different module", async () => {
    const runtime = new RecordingRuntime("music");
    const { compositionService } = createCompositionService(runtime);

    await expect(
      compositionService.resolveModuleOutput({
        moduleId: "alerts",
        overlayId: "overlay-main",
        purpose: "test"
      })
    ).rejects.toBeInstanceOf(InvalidOverlayModuleSnapshotError);
  });
});


describe("authoritative output configuration", () => {
  it("empty_disabled_snapshot_has_canvas", async () => {
    const { compositionService, configService } = createCompositionService({ getModuleSnapshot: async request => ({ moduleId: request.moduleId, enabled: true, instructions: [] }) });
    await configService.setModuleEnabled("alerts", false);
    const result = await compositionService.resolveModuleOutput({ moduleId: "alerts", overlayId: "default", purpose: "live", targetProfileId: "vertical" });
    expect(result.modules).toEqual([]);
    expect(result.canvas).toMatchObject({ schemaVersion: 1, kind: "scene", width: 1080, height: 1920, configRevision: 1 });
    expect(result.runtimeId).toEqual(expect.any(String));
  });

  it("late_old_config_cannot_replace_new_geometry", async () => {
    let finish!: () => void;
    let first = true;
    const blocked = new Promise<void>(resolve => { finish = resolve; });
    const { compositionService, configService } = createCompositionService({ getModuleSnapshot: async request => {
      if (first) { first = false; await blocked; }
      const config = request.savedConfig!.config as { canvas: { width: number; height: number } };
      return { moduleId: request.moduleId, enabled: true, instructions: [{ ...createInstruction(request),
        text: { text: "Stable occurrence", layout: { x: 0, y: 0, width: config.canvas.width, height: config.canvas.height, zIndex: 0 } } }] };
    } });
    const request = { moduleId: "alerts", overlayId: "default", purpose: "live" as const };
    const old = compositionService.resolveModuleOutput(request);
    await new Promise(resolve => setTimeout(resolve, 0));
    await configService.saveModuleConfig({ moduleId: "alerts", enabled: true, config: { canvas: { width: 1280, height: 720 } } });
    const current = await compositionService.resolveModuleOutput(request);
    finish();
    const completed = await old;
    expect(completed.canvas).toEqual(current.canvas);
    expect(completed.modules[0]?.instructions[0]?.text?.layout).toMatchObject({ width: current.canvas.width, height: current.canvas.height });
    expect(completed.modules[0]?.instructions[0]?.id).toBe(current.modules[0]?.instructions[0]?.id);
    expect(current.canvas).toMatchObject({ width: 1280, height: 720, configRevision: 1 });
  });

  it("reload invalidates captures monotonically and failed saves preserve geometry", async () => {
    const registry = createDefaultOverlayModuleRegistry();
    const repository = new InMemoryOverlayModuleConfigRepository();
    const configService = new DefaultOverlayModuleConfigService({ registry, repository });
    const compositionService = new DefaultOverlayCompositionService({ configService, runtime: { getModuleSnapshot: async request => ({ moduleId: request.moduleId, enabled: true, instructions: [] }) } });
    const request = { moduleId: "alerts", overlayId: "default", purpose: "live" as const };
    const before = await compositionService.resolveModuleOutput(request);
    await expect(configService.saveModuleConfig({ moduleId: "alerts", enabled: true, config: { canvas: { width: 0, height: 1 } } })).rejects.toThrow();
    expect((await compositionService.resolveModuleOutput(request)).canvas).toEqual(before.canvas);
    await repository.saveModuleConfig({ moduleId: "alerts", enabled: true, config: { canvas: { width: 800, height: 600 } }, updatedAt: now.toISOString() });
    compositionService.resetConfigurationCache();
    const after = await compositionService.resolveModuleOutput(request);
    expect(after.runtimeId).toBe(before.runtimeId);
    expect(after.canvas).toMatchObject({ width: 800, height: 600, configRevision: 1 });
  });
});

it("bounds capture retries under repeated committed replacements", async () => {
  let reads = 0;
  const config = { moduleId: "alerts", enabled: true, config: { canvas: { width: 800, height: 600 } }, updatedAt: now.toISOString() };
  const service = new DefaultOverlayCompositionService({ configService: { getModuleConfig: async () => { reads++; service.resetConfigurationCache(); return config; } },
    runtime: { getModuleSnapshot: async () => ({ moduleId: "alerts", enabled: true, instructions: [] }) } });
  await expect(service.resolveUnifiedOutput({ overlayId: "default", purpose: "live", enabledModuleIds: ["alerts"] })).rejects.toThrow("changed repeatedly");
  expect(reads).toBe(4);
});
