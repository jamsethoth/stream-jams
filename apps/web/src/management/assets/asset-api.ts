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

  function invalidateSession(session: ManagementSessionResponse): void {
    if (sessionId === session.id) {
      sessionId = null;
      csrfToken = null;
    }
  }

  async function requestWithSession(
    path: string,
    createOptions: (session: ManagementSessionResponse) => RequestInit,
    fallbackMessage: string
  ): Promise<Response> {
    let session = await getSession();
    let response = await fetcher(path, createOptions(session));
    if (response.status === 401) {
      invalidateSession(session);
      session = await getSession();
      response = await fetcher(path, createOptions(session));
    }
    if (!response.ok) {
      throw new Error(await readHttpError(response, fallbackMessage));
    }
    return response;
  }

  return {
    async listAssets() {
      const response = await requestWithSession("/assets", (session) => ({
        headers: { authorization: `Bearer ${session.id}` }
      }), "Unable to load assets.");

      return (await response.json()) as readonly AssetRecord[];
    },

    async importAsset(file: File) {
      const body = await file.arrayBuffer();
      const response = await requestWithSession("/assets/import", (session) => ({
        method: "POST",
        headers: {
          "content-type": "application/octet-stream",
          "x-stream-jams-file-name": file.name,
          "x-stream-jams-mime-type": file.type || "application/octet-stream",
          authorization: `Bearer ${session.id}`,
          "x-stream-jams-csrf": session.csrfToken
        },
        body
      }), "Unable to import asset.");

      return (await response.json()) as AssetRecord;
    },

    async getAssetFile(assetId) {
      const path = `/assets/${encodeURIComponent(assetId)}/file`;
      const response = await requestWithSession(path, (session) => ({
        headers: { authorization: `Bearer ${session.id}` }
      }), "Unable to load asset preview.");

      return response.blob();
    },

    async replaceAsset(assetId, file, confirmImpact) {
      const path = `/assets/${encodeURIComponent(assetId)}/replace`;
      const body = await file.arrayBuffer();
      const response = await requestWithSession(path, (session) => ({
        method: "POST",
        headers: {
          "content-type": "application/octet-stream",
          "x-stream-jams-confirm-impact": String(confirmImpact),
          "x-stream-jams-file-name": file.name,
          "x-stream-jams-mime-type": file.type || "application/octet-stream",
          authorization: `Bearer ${session.id}`,
          "x-stream-jams-csrf": session.csrfToken
        },
        body
      }), "Unable to replace asset.");

      return (await response.json()) as AssetRecord;
    }
  };
}
