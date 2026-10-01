import { mediaPreviewDescriptorSchema, type MediaPreviewDescriptor } from "@stream-jams/core";
import { createManagementHttpClient, type HttpManagementClientOptions, type ManagementHttpClient } from "../management-http-client.js";

export interface MediaPreviewApi {
  createPreview(assetId: string): Promise<MediaPreviewDescriptor>;
  renewPreview(previewId: string): Promise<MediaPreviewDescriptor>;
  releasePreview(previewId: string): Promise<void>;
}
export function createHttpMediaPreviewApi(options: HttpManagementClientOptions & { readonly client?: ManagementHttpClient } = {}): MediaPreviewApi {
  const client = options.client ?? createManagementHttpClient(options);
  const parse = (candidate: unknown): MediaPreviewDescriptor => {
    const result = mediaPreviewDescriptorSchema.safeParse(candidate);
    if (!result.success) throw new Error("Media preview response is invalid. Reselect the asset and retry.");
    return result.data;
  };
  return {
    async createPreview(assetId) {
      return parse(await client.postJson(`/assets/${encodeURIComponent(assetId)}/preview`, undefined, "Unable to load asset preview."));
    },
    async renewPreview(previewId) {
      return parse(await client.postJson(`/assets/previews/${encodeURIComponent(previewId)}/renew`, undefined, "Preview expired. Reselect the asset and retry."));
    },
    async releasePreview(previewId) {
      await client.deleteRequest(`/assets/previews/${encodeURIComponent(previewId)}`, "Unable to release asset preview.");
    }
  };
}
