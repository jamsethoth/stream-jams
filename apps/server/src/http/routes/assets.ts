import {
  InvalidMediaImportError,
  defaultAssetValidationPolicy,
  type AssetRepository,
  type MediaImportPipeline
} from "@stream-jams/core";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { AssetFileNotFoundError, AssetPathTraversalError, type LocalAssetStore } from "../../modules/assets/local-asset-store.js";
import { sendHttpError } from "../errors.js";

export interface AssetRouteDependencies {
  readonly assetRepository: Pick<AssetRepository, "list" | "findById">;
  readonly mediaImportPipeline: Pick<MediaImportPipeline, "importMedia">;
  readonly assetStore: Pick<LocalAssetStore, "read">;
  readonly managementAuthPreHandler: preHandlerHookHandler;
  readonly managementRateLimitPreHandler: preHandlerHookHandler;
}

const importContentType = "application/octet-stream";
const maximumAssetImportBodyBytes = Math.max(
  defaultAssetValidationPolicy.image.maxSizeBytes,
  defaultAssetValidationPolicy.gif.maxSizeBytes,
  defaultAssetValidationPolicy.video.maxSizeBytes,
  defaultAssetValidationPolicy.audio.maxSizeBytes
);

export function registerAssetRoutes(app: FastifyInstance, dependencies: AssetRouteDependencies): void {
  const preHandler = [dependencies.managementRateLimitPreHandler, dependencies.managementAuthPreHandler];

  if (!app.hasContentTypeParser(importContentType)) {
    app.addContentTypeParser(importContentType, { parseAs: "buffer" }, (_request, body, done) => {
      done(null, body);
    });
  }

  app.get("/assets", { preHandler }, async () => dependencies.assetRepository.list());

  app.post("/assets/import", { preHandler, bodyLimit: maximumAssetImportBodyBytes }, async (request, reply) => {
    const importRequest = parseImportRequest(request.body, request.headers);
    if (importRequest === null) {
      return sendHttpError(reply, 400, {
        code: "INVALID_ASSET_IMPORT_REQUEST",
        message: "Asset import requires file name, MIME type, and bytes"
      });
    }

    try {
      const record = await dependencies.mediaImportPipeline.importMedia(importRequest);
      return reply.status(201).send(record);
    } catch (error) {
      if (error instanceof InvalidMediaImportError) {
        return sendHttpError(reply, 400, {
          code: "INVALID_ASSET_IMPORT",
          message: error.reason
        });
      }

      throw error;
    }
  });

  app.get("/assets/:assetId/file", { preHandler }, async (request, reply) => {
    const assetId = readAssetId(request.params);
    const record = await dependencies.assetRepository.findById(assetId);
    if (record === null) {
      return sendHttpError(reply, 404, {
        code: "ASSET_NOT_FOUND",
        message: "Asset not found"
      });
    }

    try {
      const bytes = await dependencies.assetStore.read(record.storagePath);
      return reply.header("x-content-type-options", "nosniff").type(record.mimeType).send(bytes);
    } catch (error) {
      if (error instanceof AssetPathTraversalError) {
        return sendHttpError(reply, 400, {
          code: "ASSET_STORAGE_PATH_INVALID",
          message: "Asset storage path is invalid"
        });
      }

      if (error instanceof AssetFileNotFoundError) {
        return sendHttpError(reply, 404, {
          code: "ASSET_FILE_NOT_FOUND",
          message: "Asset file not found"
        });
      }

      throw error;
    }
  });
}

function parseImportRequest(
  body: unknown,
  headers: Record<string, string | string[] | undefined>
): { readonly originalFileName: string; readonly mimeType: string; readonly bytes: Uint8Array } | null {
  const originalFileName = readSingleHeader(headers["x-stream-jams-file-name"]);
  const mimeType = readSingleHeader(headers["x-stream-jams-mime-type"]);
  if (originalFileName === null || mimeType === null || !Buffer.isBuffer(body)) {
    return null;
  }

  return {
    originalFileName,
    mimeType,
    bytes: new Uint8Array(body)
  };
}

function readSingleHeader(value: string | string[] | undefined): string | null {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  return value;
}

function readAssetId(params: unknown): string {
  return String((params as { readonly assetId?: string }).assetId ?? "");
}
