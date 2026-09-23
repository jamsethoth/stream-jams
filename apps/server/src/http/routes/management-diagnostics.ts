import {
  clearOldLogsResultSchema,
  configurationBackupSummarySchema,
  diagnosticsWorkspaceViewSchema,
  openDataFolderResultSchema,
  type ClearOldLogsResult,
  type ConfigurationBackupSummary,
  type DiagnosticsWorkspaceView,
  type OpenDataFolderResult
} from "@stream-jams/core";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";

export interface ManagementDiagnosticsRouteDependencies {
  readonly getDiagnosticsWorkspace: () => Promise<DiagnosticsWorkspaceView>;
  readonly getConfigurationBackupSummary: () => Promise<ConfigurationBackupSummary>;
  readonly openDataFolder: () => Promise<OpenDataFolderResult>;
  readonly clearOldLogs: () => Promise<ClearOldLogsResult>;
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
