import { createDefaultOverlayModuleRegistry, type OverlayModuleRegistry } from "@stream-jams/core";

export function createStaticOverlayModuleRegistry(): OverlayModuleRegistry {
  return createDefaultOverlayModuleRegistry();
}
