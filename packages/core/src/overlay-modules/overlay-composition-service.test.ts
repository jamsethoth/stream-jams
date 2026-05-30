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
}): OverlayInstruction {
  return {
    id: `${input.scope}-${input.purpose}-instruction`,
    overlayId: input.overlayId,
    moduleId: input.moduleId,
    purpose: input.purpose,
    scope: input.scope,
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
  it("resolves enabled module-specific overlay output", async () => {
    const runtime = new RecordingRuntime();
    const { compositionService } = createCompositionService(runtime);
    const request: ModuleOutputRequest = {
      moduleId: "alerts",
      overlayId: "overlay-main",
      purpose: "test"
    };

    const composition = await compositionService.resolveModuleOutput(request);

    expect(composition).toEqual({
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
    expect(runtime.requests).toEqual([{ ...request, scope: "module" }]);
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

    expect(composition).toEqual({
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

    expect(composition).toEqual({
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
        enabledModuleIds: ["music"]
      })
    ).rejects.toBeInstanceOf(UnknownOverlayModuleError);
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
