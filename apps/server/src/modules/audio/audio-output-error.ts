import type { AudioRouteReference, ModuleMediaReference } from "@stream-jams/core";

export class AudioOutputError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly nextStep: string,
    readonly routeIds: readonly string[] = [],
    readonly references: readonly AudioRouteReference[] = [],
    readonly owners: readonly ModuleMediaReference[] = []
  ) { super(message); }
}
