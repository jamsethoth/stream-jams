import { randomUUID } from "node:crypto";
import {
  timerDefinitionInputSchema,
  timerDefinitionSnapshotSchema,
  type TimerDefinition,
  type TimerDefinitionInput,
  type TimerDefinitionRepository,
  type TimerDefinitionSnapshot
} from "@stream-jams/core";

export interface TimerActivityProbe {
  isActive(definitionId: string): boolean;
}

export interface TimerManagementServiceOptions {
  readonly repository: TimerDefinitionRepository;
  readonly activity: TimerActivityProbe;
  readonly generateId?: () => string;
  readonly now?: () => Date;
}

export class TimerDefinitionNotFoundError extends Error {
  constructor(readonly definitionId: string) {
    super(`Timer "${definitionId}" was not found`);
    this.name = "TimerDefinitionNotFoundError";
  }
}

export class ActiveTimerDefinitionError extends Error {
  constructor(readonly definitionId: string) {
    super(`Stop timer "${definitionId}" before deleting it`);
    this.name = "ActiveTimerDefinitionError";
  }
}

export class TimerManagementService {
  readonly #repository: TimerDefinitionRepository;
  readonly #activity: TimerActivityProbe;
  readonly #generateId: () => string;
  readonly #now: () => Date;

  constructor(options: TimerManagementServiceOptions) {
    this.#repository = options.repository;
    this.#activity = options.activity;
    this.#generateId = options.generateId ?? (() => `timer_${randomUUID()}`);
    this.#now = options.now ?? (() => new Date());
  }

  listDefinitions(): readonly TimerDefinition[] {
    return this.#repository.list();
  }

  getDefinition(id: string): TimerDefinition {
    const definition = this.#repository.findById(id);
    if (definition === null) throw new TimerDefinitionNotFoundError(id);
    return definition;
  }

  createDefinition(candidate: TimerDefinitionInput): TimerDefinition {
    const input = timerDefinitionInputSchema.parse(candidate);
    const id = this.#generateId();
    if (this.#repository.findById(id) !== null) throw new Error(`Generated timer ID "${id}" already exists`);
    const timestamp = this.#now().toISOString();
    return this.#repository.save({ id, ...input, createdAt: timestamp, updatedAt: timestamp });
  }

  updateDefinition(id: string, candidate: TimerDefinitionInput): TimerDefinition {
    const current = this.getDefinition(id);
    const input = timerDefinitionInputSchema.parse(candidate);
    return this.#repository.save({
      id,
      ...input,
      createdAt: current.createdAt,
      updatedAt: this.#now().toISOString()
    });
  }

  deleteDefinition(id: string): void {
    this.getDefinition(id);
    if (this.#activity.isActive(id)) throw new ActiveTimerDefinitionError(id);
    this.#repository.delete(id);
  }
}

export function snapshotTimerDefinition(definition: TimerDefinition): TimerDefinitionSnapshot {
  return timerDefinitionSnapshotSchema.parse({
    id: definition.id,
    label: definition.label,
    durationMs: definition.durationMs,
    iconAssetId: definition.iconAssetId,
    startAudioAssetId: definition.startAudioAssetId,
    endAudioAssetId: definition.endAudioAssetId,
    outputs: structuredClone(definition.outputs)
  });
}
