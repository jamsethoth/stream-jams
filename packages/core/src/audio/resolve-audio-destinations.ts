import { explicitAudioDeviceIdSchema } from "./schemas.js";
import type { AudioDestination, AudioOutputRoute } from "./types.js";

export function resolveAudioDestinations(
  routeIds: readonly string[],
  routes: readonly AudioOutputRoute[],
  availableDeviceIds: ReadonlySet<string>
): { readonly destinations: readonly AudioDestination[]; readonly unavailableRouteIds: readonly string[] } {
  const routesById = new Map(routes.map(route => [route.id, route]));
  const byDevice = new Map<string, string[]>();
  const unavailableRouteIds: string[] = [];
  for (const id of new Set(routeIds)) {
    const deviceId = routesById.get(id)?.deviceId;
    if (deviceId === undefined || deviceId === null || !explicitAudioDeviceIdSchema.safeParse(deviceId).success || !availableDeviceIds.has(deviceId)) {
      unavailableRouteIds.push(id);
      continue;
    }
    const ids = byDevice.get(deviceId) ?? [];
    ids.push(id);
    byDevice.set(deviceId, ids);
  }
  return { destinations: [...byDevice].map(([deviceId, ids]) => ({ deviceId, routeIds: ids })), unavailableRouteIds };
}
