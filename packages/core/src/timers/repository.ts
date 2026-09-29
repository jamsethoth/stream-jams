import type { TimerDefinition } from "./types.js";

/** Synchronous operations keep reference checks and writes inside one SQLite transaction. */
export interface TimerDefinitionRepository {
  list(): readonly TimerDefinition[];
  findById(id: string): TimerDefinition | null;
  save(definition: TimerDefinition): TimerDefinition;
  delete(id: string): void;
  findByAssetId(assetId: string): readonly TimerDefinition[];
  findByAudioRouteId(routeId: string): readonly TimerDefinition[];
}
