import { alertsOverlayModuleDefinition } from "./module-definition.js";
import { overlayModuleDefinitionSchema } from "./schemas.js";
import type { OverlayModuleDefinition } from "./types.js";

export interface OverlayModuleRegistry {
  listModules(): readonly OverlayModuleDefinition[];
  getModule(moduleId: string): OverlayModuleDefinition | null;
}

export class StaticOverlayModuleRegistry implements OverlayModuleRegistry {
  readonly #modules: readonly OverlayModuleDefinition[];
  readonly #modulesById: ReadonlyMap<string, OverlayModuleDefinition>;

  constructor(modules: readonly OverlayModuleDefinition[]) {
    const modulesById = new Map<string, OverlayModuleDefinition>();

    for (const moduleDefinition of modules) {
      const parsedModuleDefinition = overlayModuleDefinitionSchema.parse(moduleDefinition) as OverlayModuleDefinition;
      if (modulesById.has(parsedModuleDefinition.id)) {
        throw new Error(`Duplicate overlay module id "${parsedModuleDefinition.id}"`);
      }

      modulesById.set(parsedModuleDefinition.id, parsedModuleDefinition);
    }

    this.#modules = Array.from(modulesById.values());
    this.#modulesById = modulesById;
  }

  listModules(): readonly OverlayModuleDefinition[] {
    return [...this.#modules];
  }

  getModule(moduleId: string): OverlayModuleDefinition | null {
    return this.#modulesById.get(moduleId) ?? null;
  }
}

export function createDefaultOverlayModuleRegistry(): OverlayModuleRegistry {
  return new StaticOverlayModuleRegistry([alertsOverlayModuleDefinition]);
}
