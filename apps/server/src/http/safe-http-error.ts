import { NamedError } from "@stream-jams/core";

/** Shared server mechanics, not blanket permission to disclose an error at an HTTP boundary. */
export class SafeHttpError extends NamedError {
  constructor(
    name: string,
    readonly statusCode: number,
    readonly code: string,
    readonly safeMessage: string,
    options?: ErrorOptions
  ) {
    super(name, safeMessage, options);
  }
}
