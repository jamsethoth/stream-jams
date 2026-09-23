import type { FastifyInstance } from "fastify";
import { createBaseServerApp, type BaseServerAppOptions } from "../../../app.js";
import { registerAlertRoutes } from "../alerts.js";
import { registerAssetRoutes } from "../assets.js";
import { registerAudioOutputRoutes } from "../audio-outputs.js";
import { registerAlertCollectionRoutes } from "../collections.js";
import { registerConfigRoutes } from "../config.js";
import { registerConfigurationBackupRoutes } from "../configuration-backup.js";
import { registerDesktopConfigRoutes } from "../desktop-config.js";
import { registerDiagnosticsRoutes } from "../diagnostics.js";
import { registerManagementSessionRoutes } from "../management-session.js";
import { registerManagementUiRoutes } from "../management-ui.js";
import { registerModerationRoutes } from "../moderation.js";
import { registerOverlayModuleRoutes } from "../overlay-modules.js";
import { registerOverlayOutputManagementRoutes } from "../overlay-output-management.js";
import { registerSurfaceSettingsRoutes } from "../overlay-surfaces.js";
import { registerOverlayRoutes } from "../overlays.js";
import type { OverlayRouteDependencies } from "../overlays.js";
import { registerPlaybackOperationsRoutes } from "../playback-operations.js";
import { registerPlaybackRoutes } from "../playback.js";
import { registerScreenEffectRoutes } from "../screen-effects.js";
import { registerStreamerBotSubscriptionRoutes } from "../streamerbot-subscriptions.js";
import { registerTtsRoutes } from "../tts.js";
import { registerTwitchAuthRoutes } from "../twitch-auth.js";
import { registerTwitchEventSubRoutes } from "../twitch-eventsub.js";
import { registerTwitchRewardCatalogRoutes } from "../twitch-reward-catalog.js";
import { registerWebShellRoutes } from "../web-shell.js";
import type { WebShellRouteDependencies } from "../web-shell.js";

type RouteRegistrar<TDependencies> = (
  app: FastifyInstance,
  dependencies: TDependencies
) => unknown;

export function createRouteTestApp<TFirst>(
  first: RouteRegistrar<TFirst>
): <TDependencies extends BaseServerAppOptions & TFirst>(dependencies: TDependencies) => FastifyInstance;
export function createRouteTestApp<TFirst, TSecond>(
  first: RouteRegistrar<TFirst>,
  second: RouteRegistrar<TSecond>
): <TDependencies extends BaseServerAppOptions & TFirst & TSecond>(dependencies: TDependencies) => FastifyInstance;
export function createRouteTestApp<TFirst, TSecond, TThird>(
  first: RouteRegistrar<TFirst>,
  second: RouteRegistrar<TSecond>,
  third: RouteRegistrar<TThird>
): <TDependencies extends BaseServerAppOptions & TFirst & TSecond & TThird>(dependencies: TDependencies) => FastifyInstance;
export function createRouteTestApp(
  ...registrars: readonly RouteRegistrar<never>[]
): (dependencies: BaseServerAppOptions) => FastifyInstance {
  return (dependencies) => {
    const app = createBaseServerApp(dependencies);
    for (const register of registrars) register(app, dependencies as never);
    return app;
  };
}

export const createAlertRouteTestApp = createRouteTestApp(registerAlertRoutes);
export const createAssetRouteTestApp = createRouteTestApp(registerAssetRoutes);
export const createAudioOutputRouteTestApp = createRouteTestApp(
  registerManagementSessionRoutes,
  registerAudioOutputRoutes
);
export const createAlertCollectionRouteTestApp = createRouteTestApp(registerAlertCollectionRoutes);
export const createConfigRouteTestApp = createRouteTestApp(registerConfigRoutes);
export const createConfigurationBackupRouteTestApp = createRouteTestApp(registerConfigurationBackupRoutes);
export const createDesktopConfigRouteTestApp = createRouteTestApp(
  registerManagementSessionRoutes,
  registerDesktopConfigRoutes
);
export const createDiagnosticsRouteTestApp = createRouteTestApp(registerDiagnosticsRoutes);
export const createManagementSessionRouteTestApp = createRouteTestApp(registerManagementSessionRoutes);
export const createManagementUiRouteTestApp = createRouteTestApp(registerManagementUiRoutes);
export const createModerationRouteTestApp = createRouteTestApp(registerModerationRoutes);
export const createOverlayModuleRouteTestApp = createRouteTestApp(registerOverlayModuleRoutes);
export const createOverlayOutputManagementRouteTestApp = createRouteTestApp(registerOverlayOutputManagementRoutes);
export const createSurfaceSettingsRouteTestApp = createRouteTestApp(
  registerManagementSessionRoutes,
  registerSurfaceSettingsRoutes
);
export const createOverlayRouteTestApp = createRouteTestApp(registerOverlayRoutes);
export const createPlaybackOperationsRouteTestApp = createRouteTestApp(registerPlaybackOperationsRoutes);
export const createPlaybackRouteTestApp = createRouteTestApp(registerPlaybackRoutes);
export const createScreenEffectRouteTestApp = createRouteTestApp(registerScreenEffectRoutes);
export const createStreamerBotSubscriptionRouteTestApp = createRouteTestApp(registerStreamerBotSubscriptionRoutes);
export const createTtsRouteTestApp = createRouteTestApp(registerTtsRoutes);
export const createTwitchAuthRouteTestApp = createRouteTestApp(registerTwitchAuthRoutes);
export const createTwitchEventSubRouteTestApp = createRouteTestApp(registerTwitchEventSubRoutes);
export const createTwitchRewardCatalogRouteTestApp = createRouteTestApp(registerTwitchRewardCatalogRoutes);
export const createWebShellRouteTestApp = createRouteTestApp(registerWebShellRoutes);
export const createWebShellAssetRouteTestApp = createRouteTestApp(registerWebShellRoutes, registerAssetRoutes);
export function createWebShellOverlayRouteTestApp(
  dependencies: BaseServerAppOptions
    & WebShellRouteDependencies
    & Omit<OverlayRouteDependencies, "webShellRenderer">
): FastifyInstance {
  const app = createBaseServerApp(dependencies);
  const webShellRenderer = registerWebShellRoutes(app, dependencies);
  registerOverlayRoutes(app, { ...dependencies, webShellRenderer });
  return app;
}
