import { SafeHttpError } from "../../http/safe-http-error.js";
import type { AudioRouteReference, ModuleMediaReference } from "@stream-jams/core";

export class AudioOutputError extends SafeHttpError {
  constructor(
    statusCode: number,
    code: string,
    message: string,
    readonly nextStep: string,
    readonly routeIds: readonly string[] = [],
    readonly references: readonly AudioRouteReference[] = [],
    readonly owners: readonly ModuleMediaReference[] = [],
    options?: ErrorOptions
  ) { super("AudioOutputError", statusCode, code, message, options); }
}
