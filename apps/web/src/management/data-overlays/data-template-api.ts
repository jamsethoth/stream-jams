import { dataTemplateCatalogSchema, dataTemplateSaveInputSchema, dataTemplateInstantiateInputSchema, dataTemplateInsertInputSchema, dataOverlayStateSchema, type DataTemplateCatalog, type DataTemplateSaveInput, type DataTemplateInstantiateInput, type DataTemplateInsertInput, type DataOverlayState } from "@stream-jams/core";
import { createManagementHttpClient, type HttpManagementClientOptions } from "../management-http-client.js";

export interface DataTemplateApi {
  getCatalog(): Promise<DataTemplateCatalog>;
  save(id: string | null, input: DataTemplateSaveInput): Promise<DataTemplateCatalog>;
  delete(id: string): Promise<DataTemplateCatalog>;
  instantiate(id: string, input: DataTemplateInstantiateInput): Promise<DataOverlayState>;
  insert(id: string, input: DataTemplateInsertInput): Promise<DataOverlayState>;
}
export function createHttpDataTemplateApi(options: HttpManagementClientOptions = {}): DataTemplateApi {
  const client = createManagementHttpClient(options);
  const path = (id: string) => `/data-overlays/templates/${encodeURIComponent(id)}`;
  return {
    async getCatalog() { return dataTemplateCatalogSchema.parse(await client.getJson("/data-overlays/templates", "Unable to load templates. Retry loading.")); },
    async save(id, input) { const body = dataTemplateSaveInputSchema.parse(input); return dataTemplateCatalogSchema.parse(await (id === null ? client.postJson("/data-overlays/templates/save", body, "Unable to save template.") : client.putJson(path(id), body, "Unable to update template."))); },
    async delete(id) { return dataTemplateCatalogSchema.parse(await client.deleteJson(path(id), "Unable to delete template.")); },
    async instantiate(id, input) { return dataOverlayStateSchema.parse(await client.postJson(`${path(id)}/instantiate`, dataTemplateInstantiateInputSchema.parse(input), "Unable to create canvas. Check slot mappings and names.")); },
    async insert(id, input) { return dataOverlayStateSchema.parse(await client.postJson(`${path(id)}/insert`, dataTemplateInsertInputSchema.parse(input), "Unable to insert template. Check mappings, profile and bounds.")); }
  };
}
export const defaultDataTemplateApi = createHttpDataTemplateApi();
