import { surfaceConfigurationUpdateSchema, surfaceSettingsViewSchema, type RetiredOutputAttempt, type SurfaceConfigurationUpdate, type SurfaceSettingsView } from "@stream-jams/core";
import { createManagementHttpClient, type HttpManagementClientOptions } from "../management-http-client.js";

/** A retired public test or unified Browser Source that is still trying to connect. */
export type { RetiredOutputAttempt } from "@stream-jams/core";
export type RetiredOutputKind = RetiredOutputAttempt["kind"];
/** Overlay surface settings plus optional retired-output diagnostics; older services omit the field. */
export type ManagementSurfaceSettingsView = SurfaceSettingsView;
export interface SurfaceSettingsApi {
  load(): Promise<ManagementSurfaceSettingsView>;
  save(value: SurfaceConfigurationUpdate): Promise<ManagementSurfaceSettingsView>;
  retry(): Promise<ManagementSurfaceSettingsView>;
}
export function createHttpSurfaceSettingsApi(options: HttpManagementClientOptions = {}): SurfaceSettingsApi {
  const client = createManagementHttpClient(options);
  return {
    async load() { return parseManagementSurfaceSettingsView(await client.getJson("/overlay-surfaces", "Unable to load overlay surfaces.")); },
    async save(value) {
      const body = surfaceConfigurationUpdateSchema.parse(value);
      return parseManagementSurfaceSettingsView(await client.putJson(`/overlay-surfaces/${encodeURIComponent(body.id)}`, body, "Unable to save the overlay surface."));
    },
    async retry() { return parseManagementSurfaceSettingsView(await client.postJson("/overlay-surfaces/desktop/retry", undefined, "Unable to retry desktop output.")); }
  };
}
export const defaultSurfaceSettingsApi: SurfaceSettingsApi = createHttpSurfaceSettingsApi();

/** Validates the response; the optional retired-output diagnostic is part of the core schema. */
export function parseManagementSurfaceSettingsView(input: unknown): ManagementSurfaceSettingsView {
  return surfaceSettingsViewSchema.parse(input);
}
