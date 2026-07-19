import {
  InvalidMediaImportError,
  defaultAssetValidationPolicy,
  type AssetRepository,
  type MediaImportPipeline,
  type OverlayAccessService,
  type OverlayPurpose,
  type OverlayRouteAccessRequest
} from "@stream-jams/core";
import type { FastifyInstance, FastifyReply, FastifyRequest, preHandlerHookHandler } from "fastify";
import { AssetFileNotFoundError, AssetPathTraversalError, type LocalAssetStore } from "../../modules/assets/local-asset-store.js";
import type { AssetLibraryService } from "../../modules/assets/asset-library-service.js";
import {
  createOverlayAuthPreHandler,
  parseOverlayTargetProfileQuery
} from "../middleware/overlay-auth.js";
import { sendHttpError } from "../errors.js";

export interface AssetRouteDependencies {
  readonly assetRepository: Pick<AssetRepository, "list" | "findById">;
  readonly mediaImportPipeline: Pick<MediaImportPipeline, "importMedia">;
  readonly assetStore: Pick<LocalAssetStore, "read">;
  readonly assetLibraryService?: Pick<AssetLibraryService, "registerAsset" | "getChangeImpact" | "completeReplacement">;
  readonly managementAuthPreHandler: preHandlerHookHandler;
  readonly managementRateLimitPreHandler: preHandlerHookHandler;
  readonly overlayAccessService?: Pick<OverlayAccessService, "verifyRouteAccess">;
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
      await dependencies.assetLibraryService?.registerAsset(record);
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

  const assetLibraryService = dependencies.assetLibraryService;
  if (assetLibraryService !== undefined) {
    app.post("/assets/:assetId/replace", { preHandler, bodyLimit: maximumAssetImportBodyBytes }, async (request, reply) => {
      const assetId = readAssetId(request.params);
      const existing = await dependencies.assetRepository.findById(assetId);
      if (existing === null) {
        return sendHttpError(reply, 404, { code: "ASSET_NOT_FOUND", message: "Asset not found" });
      }
      const importRequest = parseImportRequest(request.body, request.headers);
      if (importRequest === null) {
        return sendHttpError(reply, 400, {
          code: "INVALID_ASSET_IMPORT_REQUEST",
          message: "Asset replacement requires file name, MIME type, and bytes"
        });
      }
      const impact = await assetLibraryService.getChangeImpact(assetId);
      if (impact.requiresConfirmation && readSingleHeader(request.headers["x-stream-jams-confirm-impact"]) !== "true") {
        return reply.status(409).send({
          error: {
            code: "ASSET_REPLACEMENT_CONFIRMATION_REQUIRED",
            message: "Review affected usages and confirm the global replacement."
          },
          impact
        });
      }
      try {
        const replacement = await dependencies.mediaImportPipeline.importMedia({ ...importRequest, assetId });
        await assetLibraryService.completeReplacement(existing, replacement);
        return replacement;
      } catch (error) {
        if (error instanceof InvalidMediaImportError) {
          return sendHttpError(reply, 400, { code: "INVALID_ASSET_REPLACEMENT", message: error.reason });
        }
        throw error;
      }
    });
  }

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

  if (dependencies.overlayAccessService !== undefined) {
    registerOverlayAssetRoutes(app, {
      assetRepository: dependencies.assetRepository,
      assetStore: dependencies.assetStore,
      overlayAccessService: dependencies.overlayAccessService
    });
  }
}

function registerOverlayAssetRoutes(
  app: FastifyInstance,
  dependencies: Pick<AssetRouteDependencies, "assetRepository" | "assetStore"> & {
    readonly overlayAccessService: Pick<OverlayAccessService, "verifyRouteAccess">;
  }
): void {
  const modulePreHandler = createOverlayAuthPreHandler({
    overlayAccessService: dependencies.overlayAccessService,
    resolveAccessRequest: resolveModuleOverlayAccessRequest
  });
  const unifiedPreHandler = createOverlayAuthPreHandler({
    overlayAccessService: dependencies.overlayAccessService,
    resolveAccessRequest: resolveUnifiedOverlayAccessRequest
  });

  app.get("/overlay/modules/:moduleId/:purpose/:overlayKey/assets/:assetId", { preHandler: modulePreHandler }, async (request, reply) =>
    sendOverlayAsset(request, reply, dependencies)
  );
  app.get("/overlay/unified/:purpose/:overlayKey/assets/:assetId", { preHandler: unifiedPreHandler }, async (request, reply) =>
    sendOverlayAsset(request, reply, dependencies)
  );
}

async function sendOverlayAsset(
  request: FastifyRequest,
  reply: FastifyReply,
  dependencies: Pick<AssetRouteDependencies, "assetRepository" | "assetStore">
) {
  const assetId = readAssetId(request.params);
  const record = await dependencies.assetRepository.findById(assetId);
  if (record === null) {
    return sendOverlayAssetNotFound(reply);
  }

  try {
    const bytes = await dependencies.assetStore.read(record.storagePath);
    return reply.header("cache-control", "no-store").header("x-content-type-options", "nosniff").type(record.mimeType).send(bytes);
  } catch (error) {
    if (error instanceof AssetPathTraversalError || error instanceof AssetFileNotFoundError) {
      return sendOverlayAssetNotFound(reply);
    }

    throw error;
  }
}

function sendOverlayAssetNotFound(reply: FastifyReply): FastifyReply {
  return sendHttpError(reply, 404, {
    code: "OVERLAY_ASSET_NOT_FOUND",
    message: "Overlay asset not found"
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

function resolveModuleOverlayAccessRequest(request: FastifyRequest): OverlayRouteAccessRequest | null {
  const params = readModuleOverlayParams(request.params);
  const profile = parseOverlayTargetProfileQuery(request.query, true);
  if (params.moduleId === "" || params.overlayKey === "" || params.purpose === null || !profile.valid) {
    return null;
  }

  return {
    overlayId: "default",
    moduleId: params.moduleId,
    purpose: params.purpose,
    scope: "module",
    targetProfileId: profile.targetProfileId,
    rawKey: params.overlayKey
  };
}

function resolveUnifiedOverlayAccessRequest(request: FastifyRequest): OverlayRouteAccessRequest | null {
  const params = readUnifiedOverlayParams(request.params);
  const profile = parseOverlayTargetProfileQuery(request.query, false);
  if (params.overlayKey === "" || params.purpose === null || !profile.valid) {
    return null;
  }

  return {
    overlayId: "default",
    moduleId: null,
    purpose: params.purpose,
    scope: "unified",
    targetProfileId: null,
    rawKey: params.overlayKey
  };
}

function readModuleOverlayParams(params: unknown): {
  readonly moduleId: string;
  readonly purpose: OverlayPurpose | null;
  readonly overlayKey: string;
} {
  const candidate = params as {
    readonly moduleId?: unknown;
    readonly purpose?: unknown;
    readonly overlayKey?: unknown;
  };

  return {
    moduleId: typeof candidate.moduleId === "string" ? candidate.moduleId : "",
    purpose: parseOverlayPurpose(candidate.purpose),
    overlayKey: typeof candidate.overlayKey === "string" ? candidate.overlayKey : ""
  };
}

function readUnifiedOverlayParams(params: unknown): {
  readonly purpose: OverlayPurpose | null;
  readonly overlayKey: string;
} {
  const candidate = params as {
    readonly purpose?: unknown;
    readonly overlayKey?: unknown;
  };

  return {
    purpose: parseOverlayPurpose(candidate.purpose),
    overlayKey: typeof candidate.overlayKey === "string" ? candidate.overlayKey : ""
  };
}

function parseOverlayPurpose(value: unknown): OverlayPurpose | null {
  return value === "live" || value === "test" ? value : null;
}
