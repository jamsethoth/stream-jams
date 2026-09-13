import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { SurfaceSettingsError, type SurfaceSettingsService } from "../../modules/overlay-surfaces/surface-settings-service.js";
import { RuntimeMaintenanceUnavailableError } from "../../modules/backup/runtime-maintenance-gate.js";
import { HttpResponseError } from "../errors.js";

export interface SurfaceSettingsRouteDependencies {
  readonly surfaceSettingsService: SurfaceSettingsService;
  readonly managementAuthPreHandler: preHandlerHookHandler;
  readonly managementRateLimitPreHandler: preHandlerHookHandler;
}
export function registerSurfaceSettingsRoutes(app: FastifyInstance, dependencies: SurfaceSettingsRouteDependencies): void {
  const preHandler = [dependencies.managementRateLimitPreHandler, dependencies.managementAuthPreHandler];
  app.get("/overlay-surfaces", { preHandler }, () => request(() => dependencies.surfaceSettingsService.load()));
  app.put<{ Params: { surfaceId: string } }>("/overlay-surfaces/:surfaceId", { preHandler }, input =>
    request(() => dependencies.surfaceSettingsService.save(input.params.surfaceId, input.body)));
  app.post("/overlay-surfaces/desktop/retry", { preHandler }, input => request(async () => {
    if (input.body !== undefined && (input.body === null || typeof input.body !== "object" || Array.isArray(input.body) || Object.keys(input.body).length > 0)) {
      throw new SurfaceSettingsError(400, "INVALID_SURFACE_RETRY", "Remove unsupported retry fields and try again.");
    }
    return dependencies.surfaceSettingsService.retry();
  }));
}
async function request<T>(work: () => Promise<T>): Promise<T> {
  try { return await work(); }
  catch (error) {
    if (error instanceof SurfaceSettingsError) throw new HttpResponseError(error.statusCode, error.code, error.message);
    if (error instanceof RuntimeMaintenanceUnavailableError) throw new HttpResponseError(409, "SURFACE_MAINTENANCE_ACTIVE", "Overlay changes are unavailable during maintenance or shutdown. Wait for maintenance to finish or restart the app.");
    throw error;
  }
}
