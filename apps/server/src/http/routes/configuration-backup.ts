import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import {
  configurationBackupArchiveSchema,
  configurationBackupLimits,
  configurationRestorePreflightSchema,
  configurationRestoreRequestSchema,
  configurationRestoreResultSchema
} from "@stream-jams/core";
import {
  ConfigurationRestoreBlockedError,
  type ConfigurationBackupService
} from "../../modules/backup/configuration-backup-service.js";
import { sendHttpError } from "../errors.js";

type BackupRouteService = Pick<ConfigurationBackupService, "exportArchive" | "preflight" | "restore">;

export interface ConfigurationBackupRouteDependencies {
  readonly configurationBackupService: BackupRouteService;
  readonly managementAuthPreHandler: preHandlerHookHandler;
  readonly managementRateLimitPreHandler: preHandlerHookHandler;
}

const archiveBodyLimit = configurationBackupLimits.maxArchiveBytes;

export function registerConfigurationBackupRoutes(
  app: FastifyInstance,
  dependencies: ConfigurationBackupRouteDependencies
): void {
  const preHandler = [dependencies.managementRateLimitPreHandler, dependencies.managementAuthPreHandler];
  const service = dependencies.configurationBackupService;

  app.get("/management/settings/backup", { preHandler }, async () =>
    configurationBackupArchiveSchema.parse(await service.exportArchive())
  );

  app.post("/management/settings/backup/preflight", { preHandler, bodyLimit: archiveBodyLimit }, async (request) =>
    configurationRestorePreflightSchema.parse(await service.preflight(request.body))
  );

  app.post("/management/settings/backup/restore", { preHandler, bodyLimit: archiveBodyLimit }, async (request, reply) => {
    const parsed = configurationRestoreRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendHttpError(reply, 400, {
        code: "INVALID_CONFIGURATION_RESTORE_REQUEST",
        message: "Validate the backup again, type RESTORE, and keep route-key regeneration enabled."
      });
    }
    try {
      const result = configurationRestoreResultSchema.parse(await service.restore(parsed.data));
      for (const warning of result.warnings) {
        if (warning.referenceId !== null) {
          request.log.warn({ referenceId: warning.referenceId }, warning.summary);
        }
      }
      return result;
    } catch (error) {
      if (error instanceof ConfigurationRestoreBlockedError) {
        const logContext = { code: error.code, referenceId: error.actionableError.referenceId };
        if (error.code === "RESTORE_FAILED" || error.code === "SAFETY_BACKUP_FAILED") {
          request.log.error(logContext, error.actionableError.summary);
        } else {
          request.log.warn(logContext, error.actionableError.summary);
        }
        return reply.status(409).send({
          error: {
            code: error.code,
            id: error.actionableError.referenceId,
            message: [error.actionableError.summary, error.actionableError.cause, error.actionableError.nextStep]
              .filter((part): part is string => part !== null)
              .join(" ")
          },
          actionableError: error.actionableError
        });
      }
      throw error;
    }
  });
}
