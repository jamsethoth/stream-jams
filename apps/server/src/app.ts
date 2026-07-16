import { randomUUID } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import { HttpResponseError } from "./http/errors.js";
import { registerAlertRoutes, type AlertRuleRouteDependencies } from "./http/routes/alerts.js";
import { registerAlertCollectionRoutes, type AlertCollectionRouteDependencies } from "./http/routes/collections.js";
import { registerAssetRoutes, type AssetRouteDependencies } from "./http/routes/assets.js";
import { registerConfigRoutes, type ServerConfigRouteDependencies } from "./http/routes/config.js";
import {
  registerConfigurationBackupRoutes,
  type ConfigurationBackupRouteDependencies
} from "./http/routes/configuration-backup.js";
import { registerDiagnosticsRoutes, type DiagnosticsRouteDependencies } from "./http/routes/diagnostics.js";
import { registerHealthRoutes, type ServerAppMetadata } from "./http/routes/health.js";
import {
  registerManagementSessionRoutes,
  type ManagementSessionRouteDependencies
} from "./http/routes/management-session.js";
import { registerManagementUiRoutes, type ManagementUiRouteDependencies } from "./http/routes/management-ui.js";
import { registerModerationRoutes, type ModerationRouteDependencies } from "./http/routes/moderation.js";
import {
  registerOverlayOutputManagementRoutes,
  type OverlayOutputManagementRouteDependencies
} from "./http/routes/overlay-output-management.js";
import { registerOverlayModuleRoutes, type OverlayModuleRouteDependencies } from "./http/routes/overlay-modules.js";
import { registerOverlayRoutes, type OverlayRouteDependencies } from "./http/routes/overlays.js";
import { registerPlaybackRoutes, type PlaybackRouteDependencies } from "./http/routes/playback.js";
import { registerTtsRoutes, type TtsRouteDependencies } from "./http/routes/tts.js";
import { registerTwitchAuthRoutes, type TwitchAuthRouteDependencies } from "./http/routes/twitch-auth.js";
import { registerTwitchEventSubRoutes, type TwitchEventSubRouteDependencies } from "./http/routes/twitch-eventsub.js";
import { registerWebShellRoutes, type WebShellRenderer } from "./http/routes/web-shell.js";
import { createRedactor } from "./modules/security/redactor.js";

export interface ServerErrorLogEntry {
  readonly errorId: string;
  readonly requestId: string;
  readonly code: string;
  readonly statusCode: number;
  readonly method: string;
  readonly url: string;
  readonly error: unknown;
}

export interface ServerAppDependencies
  extends Partial<ServerConfigRouteDependencies>,
    Partial<ConfigurationBackupRouteDependencies>,
    Partial<ManagementSessionRouteDependencies>,
    Partial<ManagementUiRouteDependencies>,
    Partial<ModerationRouteDependencies>,
    Partial<DiagnosticsRouteDependencies>,
    Partial<OverlayModuleRouteDependencies>,
    Partial<OverlayOutputManagementRouteDependencies>,
    Partial<OverlayRouteDependencies>,
    Partial<AssetRouteDependencies>,
    Partial<AlertRuleRouteDependencies>,
    Partial<AlertCollectionRouteDependencies>,
    Partial<PlaybackRouteDependencies>,
    Partial<TtsRouteDependencies>,
    Partial<TwitchAuthRouteDependencies>,
    Partial<TwitchEventSubRouteDependencies> {
  readonly metadata: ServerAppMetadata;
  readonly webBuildDirectory?: string;
  readonly webShellRenderer?: WebShellRenderer;
  readonly generateServerErrorId?: () => string;
  readonly serverErrorLogger?: (entry: ServerErrorLogEntry) => void;
}

export function createServerApp(dependencies: ServerAppDependencies): FastifyInstance {
  const app = Fastify({
    logger: false
  });
  registerServerErrorHandler(app, dependencies);

  registerHealthRoutes(app, dependencies.metadata);
  const webShellRenderer = dependencies.webBuildDirectory === undefined
    ? dependencies.webShellRenderer
    : registerWebShellRoutes(app, {
        webBuildDirectory: dependencies.webBuildDirectory,
        ...(dependencies.webShellRenderer === undefined ? {} : { webShellRenderer: dependencies.webShellRenderer })
      });

  if (dependencies.managementSessionService !== undefined) {
    if (dependencies.managementRateLimitPreHandler === undefined) {
      throw new Error("Management session routes require a rate-limit hook");
    }

    registerManagementSessionRoutes(app, {
      managementSessionService: dependencies.managementSessionService,
      managementRateLimitPreHandler: dependencies.managementRateLimitPreHandler,
      ...(dependencies.managementOriginPreHandler === undefined
        ? {}
        : { managementOriginPreHandler: dependencies.managementOriginPreHandler })
    });
  }

  if (dependencies.managementUiQueryService !== undefined) {
    if (!hasManagementUiRouteDependencies(dependencies)) {
      throw new Error("Management UI routes require query service, management auth, and rate-limit hooks");
    }

    registerManagementUiRoutes(app, dependencies);
  }

  if (dependencies.configurationBackupService !== undefined) {
    if (!hasConfigurationBackupRouteDependencies(dependencies)) {
      throw new Error("Configuration backup routes require service, management auth, and rate-limit hooks");
    }
    registerConfigurationBackupRoutes(app, dependencies);
  }

  if (dependencies.moderationService !== undefined) {
    if (!hasModerationRouteDependencies(dependencies)) {
      throw new Error("Moderation routes require service, management auth, and rate-limit hooks");
    }

    registerModerationRoutes(app, dependencies);
  }

  if (dependencies.diagnosticsService !== undefined) {
    if (!hasDiagnosticsRouteDependencies(dependencies)) {
      throw new Error("Diagnostics routes require service, management auth, and rate-limit hooks");
    }

    registerDiagnosticsRoutes(app, dependencies);
  }

  if (dependencies.alertService !== undefined) {
    if (!hasAlertRouteDependencies(dependencies)) {
      throw new Error("Alert routes require alert service, management auth, and rate-limit hooks");
    }

    registerAlertCollectionRoutes(app, dependencies);
    registerAlertRoutes(app, dependencies);
  }

  if (
    dependencies.assetRepository !== undefined ||
    dependencies.mediaImportPipeline !== undefined ||
    dependencies.assetStore !== undefined
  ) {
    if (!hasAssetRouteDependencies(dependencies)) {
      throw new Error("Asset routes require repository, import pipeline, asset store, management auth, and rate-limit hooks");
    }

    registerAssetRoutes(app, dependencies);
  }

  if (dependencies.overlayCompositionService !== undefined) {
    if (!hasOverlayRouteDependencies(dependencies) || webShellRenderer === undefined) {
      throw new Error("Overlay routes require access service, composition service, module registry, and web shell renderer");
    }

    registerOverlayRoutes(app, {
      ...dependencies,
      webShellRenderer
    });
  }

  if (dependencies.overlayModuleConfigService !== undefined) {
    if (!hasOverlayModuleRouteDependencies(dependencies)) {
      throw new Error("Overlay module routes require registry, config service, management auth, and rate-limit hooks");
    }

    registerOverlayModuleRoutes(app, dependencies);
  }

  if (dependencies.overlayOutputManagementService !== undefined) {
    if (!hasOverlayOutputManagementRouteDependencies(dependencies)) {
      throw new Error("Overlay output management routes require service, gateway, management auth, and rate-limit hooks");
    }

    registerOverlayOutputManagementRoutes(app, dependencies);
  }

  if (dependencies.playbackCoordinator !== undefined) {
    if (!hasPlaybackRouteDependencies(dependencies)) {
      throw new Error("Playback routes require coordinator, management auth, and rate-limit hooks");
    }

    registerPlaybackRoutes(app, dependencies);
  }

  if (dependencies.ttsService !== undefined) {
    if (!hasTtsRouteDependencies(dependencies)) {
      throw new Error("TTS routes require service, management auth, and rate-limit hooks");
    }

    registerTtsRoutes(app, dependencies);
  }

  if (dependencies.twitchAuthService !== undefined) {
    if (!hasTwitchAuthRouteDependencies(dependencies)) {
      throw new Error("Twitch auth routes require service, management auth, and rate-limit hooks");
    }

    registerTwitchAuthRoutes(app, dependencies);
  }

  if (dependencies.twitchEventSubStatusService !== undefined) {
    if (!hasTwitchEventSubRouteDependencies(dependencies)) {
      throw new Error("Twitch EventSub routes require service, management auth, and rate-limit hooks");
    }

    registerTwitchEventSubRoutes(app, dependencies);
  }

  if (dependencies.serverConfigService !== undefined) {
    if (!hasConfigRouteProtection(dependencies)) {
      throw new Error("Config routes require management auth and rate-limit hooks");
    }

    registerConfigRoutes(app, dependencies);
  }

  return app;
}

function hasModerationRouteDependencies(
  dependencies: ServerAppDependencies
): dependencies is ServerAppDependencies & ModerationRouteDependencies {
  return (
    dependencies.moderationService !== undefined &&
    dependencies.managementAuthPreHandler !== undefined &&
    dependencies.managementRateLimitPreHandler !== undefined
  );
}

function hasManagementUiRouteDependencies(
  dependencies: ServerAppDependencies
): dependencies is ServerAppDependencies & ManagementUiRouteDependencies {
  return (
    dependencies.managementUiQueryService !== undefined &&
    dependencies.managementAuthPreHandler !== undefined &&
    dependencies.managementRateLimitPreHandler !== undefined
  );
}

function hasConfigurationBackupRouteDependencies(
  dependencies: ServerAppDependencies
): dependencies is ServerAppDependencies & ConfigurationBackupRouteDependencies {
  return (
    dependencies.configurationBackupService !== undefined &&
    dependencies.managementAuthPreHandler !== undefined &&
    dependencies.managementRateLimitPreHandler !== undefined
  );
}

function registerServerErrorHandler(app: FastifyInstance, dependencies: ServerAppDependencies): void {
  const generateServerErrorId = dependencies.generateServerErrorId ?? (() => `err_${randomUUID()}`);
  const logServerError = dependencies.serverErrorLogger ?? defaultServerErrorLogger;

  app.setErrorHandler((error, request, reply) => {
    const response = toServerErrorResponse(error);
    const errorId = generateServerErrorId();
    const requestId = String(request.id);

    logServerError({
      errorId,
      requestId,
      code: response.code,
      statusCode: response.statusCode,
      method: request.method,
      url: request.url,
      error
    });

    return reply.status(response.statusCode).send({
      error: {
        code: response.code,
        id: errorId,
        message: response.message
      }
    });
  });
}

function toServerErrorResponse(error: unknown): { readonly statusCode: number; readonly code: string; readonly message: string } {
  if (error instanceof HttpResponseError) {
    return {
      statusCode: error.statusCode,
      code: error.code,
      message: error.safeMessage
    };
  }

  if (error instanceof Error && "code" in error && error.code === "FST_ERR_CTP_INVALID_MEDIA_TYPE") {
    return {
      statusCode: 415,
      code: "UNSUPPORTED_MEDIA_TYPE",
      message: "Use application/json for requests with a body, or omit Content-Type for empty requests."
    };
  }

  return {
    statusCode: 500,
    code: "INTERNAL_SERVER_ERROR",
    message: "A server error occurred. Use the error ID to find details in backend logs."
  };
}

function defaultServerErrorLogger(entry: ServerErrorLogEntry): void {
  const redactor = createRedactor();
  console.error(
    `[${entry.errorId}] ${entry.code} ${entry.method} ${redactor.redactText(entry.url)} request=${entry.requestId} status=${entry.statusCode}`,
    entry.error
  );
}

function hasDiagnosticsRouteDependencies(
  dependencies: ServerAppDependencies
): dependencies is ServerAppDependencies & DiagnosticsRouteDependencies {
  return (
    dependencies.diagnosticsService !== undefined &&
    dependencies.managementAuthPreHandler !== undefined &&
    dependencies.managementRateLimitPreHandler !== undefined
  );
}

function hasConfigRouteProtection(
  dependencies: ServerAppDependencies
): dependencies is ServerAppDependencies & ServerConfigRouteDependencies {
  return (
    dependencies.managementAuthPreHandler !== undefined && dependencies.managementRateLimitPreHandler !== undefined
  );
}

function hasOverlayModuleRouteDependencies(
  dependencies: ServerAppDependencies
): dependencies is ServerAppDependencies & OverlayModuleRouteDependencies {
  return (
    dependencies.overlayModuleRegistry !== undefined &&
    dependencies.overlayModuleConfigService !== undefined &&
    dependencies.managementAuthPreHandler !== undefined &&
    dependencies.managementRateLimitPreHandler !== undefined
  );
}

function hasOverlayRouteDependencies(
  dependencies: ServerAppDependencies
): dependencies is ServerAppDependencies & OverlayRouteDependencies {
  return (
    dependencies.overlayAccessService !== undefined &&
    dependencies.overlayCompositionService !== undefined &&
    dependencies.overlayModuleRegistry !== undefined
  );
}

function hasOverlayOutputManagementRouteDependencies(
  dependencies: ServerAppDependencies
): dependencies is ServerAppDependencies & OverlayOutputManagementRouteDependencies {
  return (
    dependencies.overlayOutputManagementService !== undefined &&
    dependencies.overlayGateway !== undefined &&
    dependencies.managementAuthPreHandler !== undefined &&
    dependencies.managementRateLimitPreHandler !== undefined
  );
}

function hasAssetRouteDependencies(
  dependencies: ServerAppDependencies
): dependencies is ServerAppDependencies & AssetRouteDependencies {
  return (
    dependencies.assetRepository !== undefined &&
    dependencies.mediaImportPipeline !== undefined &&
    dependencies.assetStore !== undefined &&
    dependencies.managementAuthPreHandler !== undefined &&
    dependencies.managementRateLimitPreHandler !== undefined
  );
}

function hasPlaybackRouteDependencies(
  dependencies: ServerAppDependencies
): dependencies is ServerAppDependencies & PlaybackRouteDependencies {
  return (
    dependencies.playbackCoordinator !== undefined &&
    dependencies.managementAuthPreHandler !== undefined &&
    dependencies.managementRateLimitPreHandler !== undefined
  );
}

function hasTtsRouteDependencies(
  dependencies: ServerAppDependencies
): dependencies is ServerAppDependencies & TtsRouteDependencies {
  return (
    dependencies.ttsService !== undefined &&
    dependencies.managementAuthPreHandler !== undefined &&
    dependencies.managementRateLimitPreHandler !== undefined
  );
}

function hasTwitchAuthRouteDependencies(
  dependencies: ServerAppDependencies
): dependencies is ServerAppDependencies & TwitchAuthRouteDependencies {
  return (
    dependencies.twitchAuthService !== undefined &&
    dependencies.managementAuthPreHandler !== undefined &&
    dependencies.managementRateLimitPreHandler !== undefined
  );
}

function hasTwitchEventSubRouteDependencies(
  dependencies: ServerAppDependencies
): dependencies is ServerAppDependencies & TwitchEventSubRouteDependencies {
  return (
    dependencies.twitchEventSubStatusService !== undefined &&
    dependencies.managementAuthPreHandler !== undefined &&
    dependencies.managementRateLimitPreHandler !== undefined
  );
}

function hasAlertRouteDependencies(
  dependencies: ServerAppDependencies
): dependencies is ServerAppDependencies & AlertRuleRouteDependencies & AlertCollectionRouteDependencies {
  return (
    dependencies.alertService !== undefined &&
    dependencies.managementAuthPreHandler !== undefined &&
    dependencies.managementRateLimitPreHandler !== undefined
  );
}
