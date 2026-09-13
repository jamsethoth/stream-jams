import { surfaceConfigurationSchema, surfaceSettingsViewSchema, type SurfaceConfiguration, type SurfaceSettingsView } from "@stream-jams/core";
import { createManagementHttpClient, type HttpManagementClientOptions } from "../management-http-client.js";
export interface SurfaceSettingsApi {
  load(): Promise<SurfaceSettingsView>;
  save(value: SurfaceConfiguration): Promise<SurfaceSettingsView>;
  retry(): Promise<SurfaceSettingsView>;
}
export function createHttpSurfaceSettingsApi(options: HttpManagementClientOptions = {}): SurfaceSettingsApi {
  const client = createManagementHttpClient(options);
  return {
    async load() { return surfaceSettingsViewSchema.parse(await client.getJson("/overlay-surfaces", "Unable to load overlay surfaces.")); },
    async save(value) {
      const body = surfaceConfigurationSchema.parse(value);
      return surfaceSettingsViewSchema.parse(await client.putJson(`/overlay-surfaces/${encodeURIComponent(body.id)}`, body, "Unable to save the overlay surface."));
    },
    async retry() { return surfaceSettingsViewSchema.parse(await client.postJson("/overlay-surfaces/desktop/retry", undefined, "Unable to retry desktop output.")); }
  };
}
export const defaultSurfaceSettingsApi: SurfaceSettingsApi = createHttpSurfaceSettingsApi();
