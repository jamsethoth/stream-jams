import {
  clearOldLogsResultSchema,
  clientExceptionReportResultSchema,
  clientExceptionReportSchema,
  configurationBackupSummarySchema,
  diagnosticsWorkspaceViewSchema,
  openDataFolderResultSchema,
  type ClearOldLogsResult,
  type ClientExceptionReport,
  type ClientExceptionReportResult,
  type ConfigurationBackupSummary,
  type DiagnosticsWorkspaceView,
  type OpenDataFolderResult
} from "@stream-jams/core";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { HttpResponseError } from "../../http/errors.js";

export interface ManagementDiagnosticsRouteDependencies {
  readonly getDiagnosticsWorkspace: () => Promise<DiagnosticsWorkspaceView>;
  readonly getConfigurationBackupSummary: () => Promise<ConfigurationBackupSummary>;
  readonly openDataFolder: () => Promise<OpenDataFolderResult>;
  readonly clearOldLogs: () => Promise<ClearOldLogsResult>;
  readonly reportClientException: (input: ClientExceptionReport) => Promise<ClientExceptionReportResult>;
  readonly preHandlers: preHandlerHookHandler[];
}

export function registerManagementDiagnosticsRoutes(
  app: FastifyInstance,
  dependencies: ManagementDiagnosticsRouteDependencies
): void {
  const preHandler = dependencies.preHandlers;

  app.get("/management/diagnostics/workspace", { preHandler }, async () =>
    diagnosticsWorkspaceViewSchema.parse(await dependencies.getDiagnosticsWorkspace())
  );

  app.post("/management/diagnostics/client-errors", { preHandler }, async (request) => {
    const input = clientExceptionReportSchema.safeParse(request.body);
    if (!input.success) {
      throw new HttpResponseError(
        400,
        "MANAGEMENT_CLIENT_EXCEPTION_INVALID",
        "The management exception report was invalid."
      );
    }
    return clientExceptionReportResultSchema.parse(await dependencies.reportClientException(input.data));
  });

  app.get("/management/settings/backup-summary", { preHandler }, async () =>
    configurationBackupSummarySchema.parse(await dependencies.getConfigurationBackupSummary())
  );

  app.post("/management/settings/open-data-folder", { preHandler }, async () =>
    openDataFolderResultSchema.parse(await dependencies.openDataFolder())
  );

  app.post("/management/settings/clear-old-logs", { preHandler }, async () =>
    clearOldLogsResultSchema.parse(await dependencies.clearOldLogs())
  );
}
