import { randomUUID } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import { HttpResponseError } from "./http/errors.js";
import { AudioOutputError } from "./modules/audio/audio-output-error.js";
import { registerAudioOutputRoutes, type AudioOutputRouteDependencies } from "./http/routes/audio-outputs.js";
import { registerSurfaceSettingsRoutes, type SurfaceSettingsRouteDependencies } from "./http/routes/overlay-surfaces.js";
import { registerAlertRoutes, type AlertRuleRouteDependencies } from "./http/routes/alerts.js";
import { registerAlertCollectionRoutes, type AlertCollectionRouteDependencies } from "./http/routes/collections.js";
import { registerAssetRoutes, type AssetRouteDependencies } from "./http/routes/assets.js";
import { registerConfigRoutes, type ServerConfigRouteDependencies } from "./http/routes/config.js";
import { registerDesktopConfigRoutes, type DesktopConfigRouteDependencies } from "./http/routes/desktop-config.js";
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
import {
  registerPlaybackOperationsRoutes,
  type PlaybackOperationsRouteDependencies
} from "./http/routes/playback-operations.js";
import { registerTtsRoutes, type TtsRouteDependencies } from "./http/routes/tts.js";
import { registerTwitchAuthRoutes, type TwitchAuthRouteDependencies } from "./http/routes/twitch-auth.js";
import { registerTwitchEventSubRoutes, type TwitchEventSubRouteDependencies } from "./http/routes/twitch-eventsub.js";
import {
  registerTwitchRewardCatalogRoutes,
  type TwitchRewardCatalogRouteDependencies
} from "./http/routes/twitch-reward-catalog.js";
import {
  registerStreamerBotSubscriptionRoutes,
  type StreamerBotSubscriptionRouteDependencies
} from "./http/routes/streamerbot-subscriptions.js";
import {
  registerScreenEffectRoutes,
  type ScreenEffectRouteDependencies
} from "./http/routes/screen-effects.js";
import { registerWebShellRoutes, type WebShellRouteDependencies } from "./http/routes/web-shell.js";
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

export interface BaseServerAppOptions {
  readonly metadata: ServerAppMetadata;
  readonly generateServerErrorId?: () => string;
  readonly serverErrorLogger?: (entry: ServerErrorLogEntry) => void;
}

export type ProductionServerAppDependencies = BaseServerAppOptions
  & ServerConfigRouteDependencies
  & DesktopConfigRouteDependencies
  & AudioOutputRouteDependencies
  & SurfaceSettingsRouteDependencies
  & ConfigurationBackupRouteDependencies
  & ManagementSessionRouteDependencies
  & ManagementUiRouteDependencies
  & ModerationRouteDependencies
  & DiagnosticsRouteDependencies
  & OverlayModuleRouteDependencies
  & OverlayOutputManagementRouteDependencies
  & Omit<OverlayRouteDependencies, "webShellRenderer">
  & AssetRouteDependencies
  & AlertRuleRouteDependencies
  & AlertCollectionRouteDependencies
  & PlaybackRouteDependencies
  & PlaybackOperationsRouteDependencies
  & TtsRouteDependencies
  & TwitchAuthRouteDependencies
  & TwitchEventSubRouteDependencies
  & TwitchRewardCatalogRouteDependencies
  & StreamerBotSubscriptionRouteDependencies
  & ScreenEffectRouteDependencies
  & WebShellRouteDependencies;

export function createBaseServerApp(options: BaseServerAppOptions): FastifyInstance {
  const app = Fastify({ logger: false });
  registerServerErrorHandler(app, options);
  registerHealthRoutes(app, options.metadata);
  return app;
}

export function createServerApp(dependencies: ProductionServerAppDependencies): FastifyInstance {
  const app = createBaseServerApp(dependencies);

  registerSurfaceSettingsRoutes(app, dependencies);
  registerAudioOutputRoutes(app, dependencies);
  registerDesktopConfigRoutes(app, dependencies);
  const webShellRenderer = registerWebShellRoutes(app, dependencies);
  registerManagementSessionRoutes(app, dependencies);
  registerManagementUiRoutes(app, dependencies);
  registerConfigurationBackupRoutes(app, dependencies);
  registerModerationRoutes(app, dependencies);
  registerDiagnosticsRoutes(app, dependencies);
  registerAlertCollectionRoutes(app, dependencies);
  registerAlertRoutes(app, dependencies);
  registerAssetRoutes(app, dependencies);
  registerOverlayRoutes(app, { ...dependencies, webShellRenderer });
  registerOverlayModuleRoutes(app, dependencies);
  registerOverlayOutputManagementRoutes(app, dependencies);
  registerPlaybackRoutes(app, dependencies);
  registerPlaybackOperationsRoutes(app, dependencies);
  registerScreenEffectRoutes(app, dependencies);
  registerTtsRoutes(app, dependencies);
  registerTwitchAuthRoutes(app, dependencies);
  registerTwitchEventSubRoutes(app, dependencies);
  registerTwitchRewardCatalogRoutes(app, dependencies);
  registerStreamerBotSubscriptionRoutes(app, dependencies);
  registerConfigRoutes(app, dependencies);

  return app;
}
function registerServerErrorHandler(app: FastifyInstance, dependencies: BaseServerAppOptions): void {
  const generateServerErrorId = dependencies.generateServerErrorId ?? (() => `err_${randomUUID()}`);
  const logServerError = dependencies.serverErrorLogger ?? defaultServerErrorLogger;

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AudioOutputError) {
      return reply.status(error.statusCode).send({ error: {
        code: error.code, message: error.message, nextStep: error.nextStep,
        routeIds: error.routeIds, references: error.references, owners: error.owners
      } });
    }
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
