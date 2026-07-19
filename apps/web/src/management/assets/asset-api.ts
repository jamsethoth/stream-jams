import { readHttpError } from "../http-errors.js";

export interface AssetRecord {
  readonly id: string;
  readonly originalFileName: string;
  readonly mediaType: "image" | "gif" | "video" | "audio";
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly checksum: string;
  readonly storagePath: string;
}

export interface AssetApi {
  listAssets(): Promise<readonly AssetRecord[]>;
  importAsset(file: File): Promise<AssetRecord>;
  getAssetFile(assetId: string): Promise<Blob>;
  replaceAsset(assetId: string, file: File, confirmImpact: boolean): Promise<AssetRecord>;
}

export interface HttpAssetApiOptions {
  readonly fetch?: typeof fetch;
}

interface ManagementSessionResponse {
  readonly id: string;
  readonly csrfToken: string;
}

export function createHttpAssetApi(options: HttpAssetApiOptions = {}): AssetApi {
  const fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  let sessionId: string | null = null;
  let csrfToken: string | null = null;

  async function getSession(): Promise<{ readonly id: string; readonly csrfToken: string }> {
    if (sessionId !== null && csrfToken !== null) {
      return {
        id: sessionId,
        csrfToken
      };
    }

    const response = await fetcher("/auth/management/sessions", {
      method: "POST"
    });
    if (!response.ok) {
      throw new Error(await readHttpError(response, "Unable to create management session."));
    }

    const session = (await response.json()) as ManagementSessionResponse;
    sessionId = session.id;
    csrfToken = session.csrfToken;
    return session;
  }

  async function managementHeaders(extraHeaders: HeadersInit = {}, includeCsrf = false): Promise<HeadersInit> {
    const session = await getSession();
    return {
      ...extraHeaders,
      authorization: `Bearer ${session.id}`,
      ...(includeCsrf ? { "x-stream-jams-csrf": session.csrfToken } : {})
    };
  }

  return {
    async listAssets() {
      const response = await fetcher("/assets", {
        headers: await managementHeaders()
      });
      if (!response.ok) {
        throw new Error(await readHttpError(response, "Unable to load assets."));
      }

      return (await response.json()) as readonly AssetRecord[];
    },

    async importAsset(file: File) {
      const response = await fetcher("/assets/import", {
        method: "POST",
        headers: await managementHeaders({
          "content-type": "application/octet-stream",
          "x-stream-jams-file-name": file.name,
          "x-stream-jams-mime-type": file.type || "application/octet-stream"
        }, true),
        body: await file.arrayBuffer()
      });
      if (!response.ok) {
        throw new Error(await readHttpError(response, "Unable to import asset."));
      }

      return (await response.json()) as AssetRecord;
    },

    async getAssetFile(assetId) {
      const response = await fetcher(`/assets/${encodeURIComponent(assetId)}/file`, {
        headers: await managementHeaders()
      });
      if (!response.ok) {
        throw new Error(await readHttpError(response, "Unable to load asset preview."));
      }

      return response.blob();
    },

    async replaceAsset(assetId, file, confirmImpact) {
      const response = await fetcher(`/assets/${encodeURIComponent(assetId)}/replace`, {
        method: "POST",
        headers: await managementHeaders({
          "content-type": "application/octet-stream",
          "x-stream-jams-confirm-impact": String(confirmImpact),
          "x-stream-jams-file-name": file.name,
          "x-stream-jams-mime-type": file.type || "application/octet-stream"
        }, true),
        body: await file.arrayBuffer()
      });
      if (!response.ok) {
        throw new Error(await readHttpError(response, "Unable to replace asset."));
      }

      return (await response.json()) as AssetRecord;
    }
  };
}
