import type { AudioOutputRoute, AudioRouteReference } from "./types.js";

/** Synchronous operations for use inside the owning database transaction. */
export interface AudioOutputRouteRepository {
  list(): readonly AudioOutputRoute[];
  findById(id: string): AudioOutputRoute | null;
  findReferences(id: string): readonly AudioRouteReference[];
  save(route: AudioOutputRoute): void;
  delete(id: string): void;
}
