import {
  assetChangeImpactSchema,
  assetLibraryItemSchema,
  assetMediaTypeSchema,
  assetMetadataUpdateInputSchema
} from "@stream-jams/core";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { sendHttpError } from "../errors.js";
import { AssetLibraryNotFoundError, type AssetLibraryService } from "../../modules/assets/asset-library-service.js";
import { parseList, readParam, readValue, sendAssetCommandError } from "./management-route-errors.js";

type AssetLibraryCommands = Pick<
  AssetLibraryService,
  "listItems" | "updateMetadata" | "getChangeImpact" | "deleteAsset" | "repairDuration"
>;

export interface ManagementAssetRouteDependencies {
  readonly assets: AssetLibraryCommands;
  readonly preHandlers: preHandlerHookHandler[];
}

export function registerManagementAssetRoutes(
  app: FastifyInstance,
  dependencies: ManagementAssetRouteDependencies
): void {
  const { assets } = dependencies;
  const preHandler = dependencies.preHandlers;

  app.get("/management/assets/library", { preHandler }, async () =>
    parseList(await assets.listItems(), assetLibraryItemSchema)
  );

  app.patch("/management/assets/:assetId", { preHandler }, async (request, reply) => {
    const input = assetMetadataUpdateInputSchema.safeParse(request.body);
    if (!input.success) {
      return sendHttpError(reply, 400, {
        code: "INVALID_ASSET_METADATA",
        message: "Enter a display name and valid asset tags."
      });
    }
    try {
      return assetLibraryItemSchema.parse(
        await assets.updateMetadata(readParam(request.params, "assetId"), input.data)
      );
    } catch (error) {
      return sendAssetCommandError(reply, error);
    }
  });

  app.get("/management/assets/:assetId/change-impact", { preHandler }, async (request, reply) => {
    const candidateValue = readValue(request.query, "candidateMediaType");
    const candidate = candidateValue === undefined ? undefined : assetMediaTypeSchema.safeParse(candidateValue);
    if (candidate !== undefined && !candidate.success) {
      return sendHttpError(reply, 400, {
        code: "INVALID_ASSET_MEDIA_TYPE",
        message: "candidateMediaType must be image, gif, video, or audio."
      });
    }
    try {
      return assetChangeImpactSchema.parse(
        await assets.getChangeImpact(readParam(request.params, "assetId"), candidate?.data)
      );
    } catch (error) {
      return sendAssetCommandError(reply, error);
    }
  });

  app.post("/management/assets/:assetId/repair-duration", { preHandler }, async (request, reply) => {
    try {
      return assetLibraryItemSchema.parse(await assets.repairDuration(readParam(request.params, "assetId")));
    } catch (error) {
      if (error instanceof AssetLibraryNotFoundError) {
        return sendHttpError(reply, 404, { code: "ASSET_NOT_FOUND", message: error.message });
      }
      throw error;
    }
  });

  app.delete("/management/assets/:assetId", { preHandler }, async (request, reply) => {
    try {
      await assets.deleteAsset(readParam(request.params, "assetId"));
      return reply.status(204).send();
    } catch (error) {
      return sendAssetCommandError(reply, error);
    }
  });
}
