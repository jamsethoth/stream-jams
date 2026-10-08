import { dataOverlayStateSchema, dataValueCreateInputSchema, dataValueUpdateInputSchema, dataGoalInputSchema, dataResetGroupInputSchema, dataCanvasInputSchema, overlayModuleConfigSchema, type DataOverlayState, type DataValueCreateInput, type DataValueUpdateInput, type DataGoalInput, type DataResetGroupInput, type DataCanvasInput } from "@stream-jams/core";
import { createManagementHttpClient, type HttpManagementClientOptions } from "../management-http-client.js";
import type { OverlayOutputView } from "@stream-jams/core";
export interface DataOverlaysApi {
    getState(): Promise<DataOverlayState>;
    createValue(input: DataValueCreateInput): Promise<DataOverlayState>;
    updateValue(id: string, input: DataValueUpdateInput): Promise<DataOverlayState>;
    deleteValue(id: string): Promise<DataOverlayState>;
    saveGoal(id: string | null, input: DataGoalInput): Promise<DataOverlayState>;
    deleteGoal(id: string): Promise<DataOverlayState>;
    saveGroup(id: string | null, input: DataResetGroupInput): Promise<DataOverlayState>;
    deleteGroup(id: string): Promise<DataOverlayState>;
    saveCanvas(id: string | null, input: DataCanvasInput): Promise<DataOverlayState>;
    deleteCanvas(id: string): Promise<DataOverlayState>;
    setPins(valueIds: string[]): Promise<DataOverlayState>;
    getEnabled(): Promise<boolean>;
    setEnabled(enabled: boolean): Promise<boolean>;
    listOutputs(): Promise<readonly OverlayOutputView[]>;
}
export function createHttpDataOverlaysApi(options: HttpManagementClientOptions = {}): DataOverlaysApi {
    const client = createManagementHttpClient(options);
    const path = (resource: string, id: string) => `/data-overlays/${resource}/${encodeURIComponent(id)}`;
    const parse = dataOverlayStateSchema.parse;
    const save = async (resource: string, id: string | null, input: unknown) => parse(await (id === null ? client.postJson(`/data-overlays/${resource}`, input, "Unable to create the definition.") : client.putJson(path(resource, id), input, "Unable to save the definition.")));
    const remove = async (resource: string, id: string) => parse(await client.deleteJson(path(resource, id), "Unable to delete this definition. Remove its references first."));
    return {
        async getState() { return parse(await client.getJson("/data-overlays", "Unable to load Data. Retry loading.")); },
        async createValue(input) { return parse(await client.postJson("/data-overlays/values", dataValueCreateInputSchema.parse(input), "Unable to create value.")); },
        async updateValue(id, input) { return parse(await client.patchJson(path("values", id), dataValueUpdateInputSchema.parse(input), "Unable to save value.")); },
        deleteValue: id => remove("values", id),
        saveGoal: (id, input) => save("goals", id, dataGoalInputSchema.parse(input)), deleteGoal: id => remove("goals", id),
        saveGroup: (id, input) => save("groups", id, dataResetGroupInputSchema.parse(input)), deleteGroup: id => remove("groups", id),
        saveCanvas: (id, input) => save("canvases", id, dataCanvasInputSchema.parse(input)), deleteCanvas: id => remove("canvases", id),
        async setPins(valueIds) { return parse(await client.putJson("/data-overlays/pins", { valueIds }, "Unable to save Operator pins.")); },
        async listOutputs() {
            const response = await client.getJson<unknown>("/management/overlay-outputs", "Unable to load Data Overlays outputs.");
            if (!Array.isArray(response))
                throw new Error("Invalid output catalog. Reload the page.");
            const outputs = response.filter(item => typeof item === "object" && item !== null && "moduleId" in item && item.moduleId === "data-overlays" && "targetProfileId" in item && (item.targetProfileId === "landscape" || item.targetProfileId === "vertical"));
            if (!outputs.every(isDataOutput)) throw new Error("Invalid Data Overlays output catalog. Reload the page.");
            return outputs;
        },
        async getEnabled() { return overlayModuleConfigSchema.parse(await client.getJson("/overlay-modules/data-overlays/config", "Unable to load Data Overlays configuration.")).enabled; },
        async setEnabled(enabled) { return overlayModuleConfigSchema.parse(await client.patchJson("/overlay-modules/data-overlays/enabled", { enabled }, "Unable to save module enablement.")).enabled; }
    };
}
export const defaultDataOverlaysApi = createHttpDataOverlaysApi();
function isDataOutput(candidate: unknown): candidate is OverlayOutputView {
    if (typeof candidate !== "object" || candidate === null) return false;
    const output = candidate as Record<string, unknown>;
    return output.moduleId === "data-overlays" && output.scope === "module"
        && (output.purpose === "live" || output.purpose === "test")
        && (output.targetProfileId === "landscape" || output.targetProfileId === "vertical")
        && typeof output.id === "string" && typeof output.label === "string" && typeof output.overlayId === "string"
        && typeof output.enabled === "boolean" && (output.keyId === null || typeof output.keyId === "string")
        && (output.url === null || typeof output.url === "string")
        && ["available", "create-required", "regenerate-required"].includes(String(output.copyableUrlStatus))
        && (output.url === null || URL.canParse(output.url) && ["http:", "https:"].includes(new URL(output.url).protocol));
}
