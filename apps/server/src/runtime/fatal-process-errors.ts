import type { EmergencyLogInput } from "../modules/diagnostics/emergency-log-writer.js";

type FatalProcessEvent = "uncaughtException" | "unhandledRejection";

export interface FatalProcessAdapter {
  exitCode?: string | number | null | undefined;
  on(event: FatalProcessEvent, listener: (error: unknown) => void): unknown;
  off(event: FatalProcessEvent, listener: (error: unknown) => void): unknown;
}

export interface FatalProcessErrorOptions {
  readonly process: FatalProcessAdapter;
  readonly emergencyWriter: { write(input: EmergencyLogInput): void };
  readonly generateReferenceId: () => string;
  readonly now?: (() => Date) | undefined;
}

/** Installs synchronous last-resort observers. The process remains on a failing exit path. */
export function installFatalProcessErrorHandlers(options: FatalProcessErrorOptions): () => void {
  const now = options.now ?? (() => new Date());
  const own = (event: FatalProcessEvent) => (error: unknown): void => {
    options.process.exitCode = 1;
    options.emergencyWriter.write({
      timestamp: now().toISOString(),
      component: "server",
      event: `process.${event}`,
      referenceId: options.generateReferenceId(),
      message: `A fatal ${event} reached the process boundary.`,
      originalException: error,
      loggerException: null
    });
  };
  const uncaughtException = own("uncaughtException");
  const unhandledRejection = own("unhandledRejection");
  options.process.on("uncaughtException", uncaughtException);
  options.process.on("unhandledRejection", unhandledRejection);
  return () => {
    options.process.off("uncaughtException", uncaughtException);
    options.process.off("unhandledRejection", unhandledRejection);
  };
}
