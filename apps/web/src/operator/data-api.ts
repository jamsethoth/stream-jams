import { dataOverlayStateSchema, dataValueSetInputSchema, type DataOverlayState, type DataValueSetInput } from "@stream-jams/core";
import { createManagementHttpClient, type HttpManagementClientOptions } from "../management/management-http-client.js";

export interface OperatorDataApi {
  getState(): Promise<DataOverlayState>;
  setValue(id: string, input: DataValueSetInput): Promise<DataOverlayState>;
  delta(id: string, action: "add" | "subtract"): Promise<DataOverlayState>;
  resetValue(id: string): Promise<DataOverlayState>;
  resetGroup(id: string): Promise<DataOverlayState>;
  restartGoal(id: string): Promise<DataOverlayState>;
  setVisibility(id: string, enabled: boolean): Promise<DataOverlayState>;
}
export function createHttpOperatorDataApi(options: HttpManagementClientOptions = {}): OperatorDataApi {
  const http = createManagementHttpClient(options);
  const path = (kind: string, id: string, command: string) => `/operator/data-overlays/${kind}/${encodeURIComponent(id)}/${command}`;
  const post = async (url: string, body?: unknown) => dataOverlayStateSchema.parse(await http.postJson(url, body, "Data command failed. Check the current content and retry."));
  return {
    getState: async () => dataOverlayStateSchema.parse(await http.getJson("/operator/data-overlays", "Unable to load Data. Check the local service and retry.")),
    setValue: (id, input) => post(path("values", id, "set"), dataValueSetInputSchema.parse(input)),
    delta: (id, action) => post(path("values", id, action), { amount: 1 }),
    resetValue: id => post(path("values", id, "reset")),
    resetGroup: id => post(path("groups", id, "reset")),
    restartGoal: id => post(path("goals", id, "restart")),
    setVisibility: async (id, enabled) => dataOverlayStateSchema.parse(await http.putJson(path("canvases", id, "visibility"), { enabled }, "Unable to change canvas visibility. Retry after checking the local service."))
  };
}
export const defaultOperatorDataApi = createHttpOperatorDataApi();
