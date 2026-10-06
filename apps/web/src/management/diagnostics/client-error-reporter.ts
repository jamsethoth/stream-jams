import {
  clientExceptionReportResultSchema,
  serializeException,
  type ClientExceptionReport,
  type ClientExceptionReportSource
} from "@stream-jams/core";
import { createManagementHttpClient, type ManagementHttpClient } from "../management-http-client.js";

export interface ClientErrorReporter {
  report(input: ClientExceptionReport): Promise<void>;
}

interface ClientErrorReporterOptions {
  readonly client?: Pick<ManagementHttpClient, "postJson">;
  readonly consoleError?: (message: string, cause: unknown) => void;
}

interface ManagementGlobalErrorListenerOptions {
  readonly target: Pick<Window, "addEventListener" | "removeEventListener">;
  readonly reporter: ClientErrorReporter;
  readonly generateReferenceId?: () => string;
}

export function createClientErrorReporter(options: ClientErrorReporterOptions = {}): ClientErrorReporter {
  const client = options.client ?? createManagementHttpClient();
  const consoleError = options.consoleError ?? ((message: string, cause: unknown) => { console.error(message, cause); });
  const attempted = new Set<string>();

  return {
    async report(input) {
      if (attempted.has(input.referenceId)) return;
      attempted.add(input.referenceId);
      try {
        const result = await client.postJson(
          "/management/diagnostics/client-errors",
          input,
          "Unable to record the management interface error."
        );
        clientExceptionReportResultSchema.parse(result);
      } catch (error) {
        consoleError(`Management exception reporting failed (${input.referenceId}).`, error);
      }
    }
  };
}

export function createClientExceptionReport(
  source: ClientExceptionReportSource,
  message: string,
  exception: unknown,
  generateReferenceId: () => string = defaultReferenceId
): ClientExceptionReport {
  return {
    referenceId: generateReferenceId(),
    source,
    message,
    exception: serializeException(exception)
  };
}

export function installManagementGlobalErrorListeners(options: ManagementGlobalErrorListenerOptions): () => void {
  const generateReferenceId = options.generateReferenceId ?? defaultReferenceId;
  const onError = (event: Event) => {
    const errorEvent = event as ErrorEvent;
    const exception = errorEvent.error ?? errorEvent.message;
    void options.reporter.report(createClientExceptionReport(
      "window-error",
      "The management interface encountered an unexpected browser error.",
      exception,
      generateReferenceId
    ));
  };
  const onUnhandledRejection = (event: Event) => {
    const rejectionEvent = event as PromiseRejectionEvent;
    void options.reporter.report(createClientExceptionReport(
      "unhandled-rejection",
      "The management interface encountered an unhandled asynchronous error.",
      rejectionEvent.reason,
      generateReferenceId
    ));
  };

  options.target.addEventListener("error", onError);
  options.target.addEventListener("unhandledrejection", onUnhandledRejection);
  return () => {
    options.target.removeEventListener("error", onError);
    options.target.removeEventListener("unhandledrejection", onUnhandledRejection);
  };
}

function defaultReferenceId(): string {
  return `err_${crypto.randomUUID()}`;
}
