import type { AudioOutputRoute, AudioRouteReference, ModuleMediaReference } from "./types.js";

/** Synchronous operations for use inside the owning database transaction. */
export interface AudioOutputRouteRepository {
  list(): readonly AudioOutputRoute[];
  findById(id: string): AudioOutputRoute | null;
  findReferences(id: string): readonly AudioRouteReference[];
  findModuleReferences(id: string): readonly ModuleMediaReference[];
  save(route: AudioOutputRoute): void;
  delete(id: string): void;
}
