import Fastify, { type FastifyInstance } from "fastify";
import { registerAlertRoutes, type AlertRuleRouteDependencies } from "./http/routes/alerts.js";
import { registerAlertCollectionRoutes, type AlertCollectionRouteDependencies } from "./http/routes/collections.js";
import { registerAssetRoutes, type AssetRouteDependencies } from "./http/routes/assets.js";
import { registerConfigRoutes, type ServerConfigRouteDependencies } from "./http/routes/config.js";
import { registerHealthRoutes, type ServerAppMetadata } from "./http/routes/health.js";
import {
  registerManagementSessionRoutes,
  type ManagementSessionRouteDependencies
} from "./http/routes/management-session.js";
import { registerModerationRoutes, type ModerationRouteDependencies } from "./http/routes/moderation.js";
import { registerOverlayModuleRoutes, type OverlayModuleRouteDependencies } from "./http/routes/overlay-modules.js";
import { registerOverlayRoutes, type OverlayRouteDependencies } from "./http/routes/overlays.js";
import { registerPlaybackRoutes, type PlaybackRouteDependencies } from "./http/routes/playback.js";

export interface ServerAppDependencies
  extends Partial<ServerConfigRouteDependencies>,
    Partial<ManagementSessionRouteDependencies>,
    Partial<ModerationRouteDependencies>,
    Partial<OverlayModuleRouteDependencies>,
    Partial<OverlayRouteDependencies>,
    Partial<AssetRouteDependencies>,
    Partial<AlertRuleRouteDependencies>,
    Partial<AlertCollectionRouteDependencies>,
    Partial<PlaybackRouteDependencies> {
  readonly metadata: ServerAppMetadata;
}

export function createServerApp(dependencies: ServerAppDependencies): FastifyInstance {
  const app = Fastify({
    logger: false
  });

  registerHealthRoutes(app, dependencies.metadata);
  if (dependencies.managementSessionService !== undefined) {
    if (dependencies.managementRateLimitPreHandler === undefined) {
      throw new Error("Management session routes require a rate-limit hook");
    }

    registerManagementSessionRoutes(app, {
      managementSessionService: dependencies.managementSessionService,
      managementRateLimitPreHandler: dependencies.managementRateLimitPreHandler
    });
  }

  if (dependencies.moderationService !== undefined) {
    if (!hasModerationRouteDependencies(dependencies)) {
      throw new Error("Moderation routes require service, management auth, and rate-limit hooks");
    }

    registerModerationRoutes(app, dependencies);
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

  if (
    dependencies.overlayAccessService !== undefined ||
    dependencies.overlayCompositionService !== undefined ||
    dependencies.overlayGateway !== undefined
  ) {
    if (!hasOverlayRouteDependencies(dependencies)) {
      throw new Error("Overlay routes require access service, composition service, and module registry");
    }

    registerOverlayRoutes(app, dependencies);
  }

  if (dependencies.overlayModuleConfigService !== undefined) {
    if (!hasOverlayModuleRouteDependencies(dependencies)) {
      throw new Error("Overlay module routes require registry, config service, management auth, and rate-limit hooks");
    }

    registerOverlayModuleRoutes(app, dependencies);
  }

  if (dependencies.playbackCoordinator !== undefined) {
    if (!hasPlaybackRouteDependencies(dependencies)) {
      throw new Error("Playback routes require coordinator, management auth, and rate-limit hooks");
    }

    registerPlaybackRoutes(app, dependencies);
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

function hasAlertRouteDependencies(
  dependencies: ServerAppDependencies
): dependencies is ServerAppDependencies & AlertRuleRouteDependencies & AlertCollectionRouteDependencies {
  return (
    dependencies.alertService !== undefined &&
    dependencies.managementAuthPreHandler !== undefined &&
    dependencies.managementRateLimitPreHandler !== undefined
  );
}
