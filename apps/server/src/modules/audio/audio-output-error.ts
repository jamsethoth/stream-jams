import type { AudioRouteReference } from "@stream-jams/core";

export class AudioOutputError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly nextStep: string,
    readonly routeIds: readonly string[] = [],
    readonly references: readonly AudioRouteReference[] = []
  ) { super(message); }
}
