import type { LogContext, Logger } from "@stream-jams/core";

export interface TrackedRuntimeTaskInput {
  readonly work: () => Promise<void>;
  readonly logger: Logger;
  readonly context: LogContext;
  readonly message: string;
  readonly onFinally?: (() => void) | undefined;
}

/** Owns diagnostic recording while preserving rejection semantics for callers. */
export async function trackRuntimeTask(input: TrackedRuntimeTaskInput): Promise<void> {
  try {
    await input.work();
  } catch (error) {
    await input.logger.error(input.message, input.context, error);
    throw error;
  } finally {
    input.onFinally?.();
  }
}
