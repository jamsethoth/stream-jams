import { surfaceConfigurationUpdateSchema, surfaceSettingsViewSchema, type SurfaceConfigurationUpdate, type SurfaceSettingsView } from "@stream-jams/core";
import { createManagementHttpClient, type HttpManagementClientOptions } from "../management-http-client.js";

/** A retired public test or unified Browser Source that is still trying to connect. */
export type RetiredOutputKind = "module-test" | "unified";
export interface RetiredOutputAttempt {
  readonly kind: RetiredOutputKind;
  readonly lastSeenAt: string;
  readonly count: number;
}
/** Overlay surface settings plus optional retired-output diagnostics; older services omit the field. */
export type ManagementSurfaceSettingsView = SurfaceSettingsView & {
  readonly retiredOutputAttempts?: readonly RetiredOutputAttempt[] | undefined;
};
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

/** Validates the response; the optional diagnostic is validated separately so its absence is accepted. */
export function parseManagementSurfaceSettingsView(input: unknown): ManagementSurfaceSettingsView {
  if (typeof input !== "object" || input === null || Array.isArray(input) || !("retiredOutputAttempts" in input)) return surfaceSettingsViewSchema.parse(input);
  const { retiredOutputAttempts, ...view } = input as Record<string, unknown>;
  const parsed = surfaceSettingsViewSchema.parse(view);
  return retiredOutputAttempts === undefined ? parsed : { ...parsed, retiredOutputAttempts: parseRetiredOutputAttempts(retiredOutputAttempts) };
}

function parseRetiredOutputAttempts(value: unknown): readonly RetiredOutputAttempt[] {
  if (!Array.isArray(value)) throw new TypeError("retiredOutputAttempts must be an array.");
  return value.map((entry: unknown, index) => {
    if (typeof entry !== "object" || entry === null) throw new TypeError(`retiredOutputAttempts.${index} must be an object.`);
    const { kind, lastSeenAt, count } = entry as Record<string, unknown>;
    if (kind !== "module-test" && kind !== "unified") throw new TypeError(`retiredOutputAttempts.${index}.kind must be module-test or unified.`);
    if (typeof lastSeenAt !== "string" || Number.isNaN(Date.parse(lastSeenAt))) throw new TypeError(`retiredOutputAttempts.${index}.lastSeenAt must be a timestamp.`);
    if (typeof count !== "number" || !Number.isInteger(count) || count < 0) throw new TypeError(`retiredOutputAttempts.${index}.count must be a non-negative integer.`);
    return { kind, lastSeenAt, count };
  });
}
