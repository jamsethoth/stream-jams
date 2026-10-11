import {
  clearOldLogsResultSchema,
  clientExceptionReportResultSchema,
  clientExceptionReportSchema,
  configurationBackupSummarySchema,
  diagnosticsWorkspaceViewSchema,
  eventBusActivityViewSchema,
  eventBusSettingsSchema,
  openDataFolderResultSchema,
  type ClearOldLogsResult,
  type ClientExceptionReport,
  type ClientExceptionReportResult,
  type ConfigurationBackupSummary,
  type DiagnosticsWorkspaceView,
  type EventBusActivityView,
  type EventBusSettings,
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
  readonly getEventBusActivity?: (() => EventBusActivityView) | undefined;
  readonly getEventBusSettings?: (() => EventBusSettings) | undefined;
  readonly saveEventBusSettings?: ((settings: EventBusSettings) => EventBusSettings) | undefined;
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

  const { getEventBusActivity, getEventBusSettings, saveEventBusSettings } = dependencies;
  if (getEventBusActivity !== undefined) {
    app.get("/management/diagnostics/event-bus", { preHandler }, async () => eventBusActivityViewSchema.parse(getEventBusActivity()));
  }
  if (getEventBusSettings !== undefined && saveEventBusSettings !== undefined) {
    app.get("/management/settings/event-bus", { preHandler }, async () => eventBusSettingsSchema.parse(getEventBusSettings()));
    app.put("/management/settings/event-bus", { preHandler }, async (request) => {
      const input = eventBusSettingsSchema.safeParse(request.body);
      if (!input.success) {
        throw new HttpResponseError(400, "EVENT_BUS_SETTINGS_INVALID", "Choose a replay age from 0 to 30 minutes.");
      }
      return eventBusSettingsSchema.parse(saveEventBusSettings(input.data));
    });
  }
}
