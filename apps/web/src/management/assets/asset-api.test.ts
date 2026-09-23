import { describe, expect, it, vi } from "vitest";
import { ManagementHttpError } from "../management-http-client.js";
import { createHttpAssetApi } from "./asset-api.js";

describe("createHttpAssetApi", () => {
  it("loads asset bytes through the authenticated management boundary", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/auth/management/sessions") return sessionResponse();
      expect(String(input)).toBe("/assets/asset_1/file");
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer session_asset");
      return new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/png" } });
    });
    const api = createHttpAssetApi({ fetch: fetcher });

    const blob = await api.getAssetFile("asset_1");

    expect(blob.type).toBe("image/png");
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("replaces an asset with its stable ID and explicit impact confirmation", async () => {
    const file = new File([new Uint8Array([9, 8, 7])], "replacement.png", { type: "image/png" });
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/auth/management/sessions") return sessionResponse();
      expect(String(input)).toBe("/assets/asset_1/replace");
      expect(init).toMatchObject({ method: "POST" });
      const headers = new Headers(init?.headers);
      expect(headers.get("authorization")).toBe("Bearer session_asset");
      expect(headers.get("content-type")).toBe("application/octet-stream");
      expect(headers.get("x-stream-jams-confirm-impact")).toBe("true");
      expect(headers.get("x-stream-jams-csrf")).toBe("csrf_asset");
      expect(headers.get("x-stream-jams-file-name")).toBe("replacement.png");
      expect(headers.get("x-stream-jams-mime-type")).toBe("image/png");
      return jsonResponse(assetRecord());
    });
    const api = createHttpAssetApi({ fetch: fetcher });

    await expect(api.replaceAsset("asset_1", file, true)).resolves.toEqual(assetRecord());
  });

  it("renews an expired management session and retries an asset upload once", async () => {
    const file = new File([new Uint8Array([9, 8, 7])], "sound.wav", { type: "audio/wav" });
    let sessionNumber = 0;
    let uploadNumber = 0;
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/auth/management/sessions") {
        sessionNumber += 1;
        return jsonResponse({ id: `session_asset_${sessionNumber}`, csrfToken: `csrf_asset_${sessionNumber}` });
      }
      expect(String(input)).toBe("/assets/import");
      uploadNumber += 1;
      const headers = new Headers(init?.headers);
      expect(headers.get("authorization")).toBe(`Bearer session_asset_${uploadNumber}`);
      expect(headers.get("x-stream-jams-csrf")).toBe(`csrf_asset_${uploadNumber}`);
      expect(new Uint8Array(init?.body as ArrayBuffer)).toEqual(new Uint8Array([9, 8, 7]));
      return uploadNumber === 1
        ? jsonResponse({ error: { code: "MANAGEMENT_SESSION_UNAUTHORIZED", message: "Management session is not authorized" } }, 401)
        : jsonResponse({ ...assetRecord(), originalFileName: "sound.wav", mediaType: "audio", mimeType: "audio/wav" });
    });
    const api = createHttpAssetApi({ fetch: fetcher });

    await expect(api.importAsset(file)).resolves.toMatchObject({ originalFileName: "sound.wav", mediaType: "audio" });
    expect(sessionNumber).toBe(2);
    expect(uploadNumber).toBe(2);
  });

  it("preserves media duration in list and import responses", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "clip.mp4", { type: "video/mp4" });
    const record = {
      ...assetRecord(),
      originalFileName: "clip.mp4",
      mediaType: "video" as const,
      mimeType: "video/mp4",
      durationMs: 1_250
    };
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/auth/management/sessions") return sessionResponse();
      if (url === "/assets") return jsonResponse([record]);
      if (url === "/assets/import") return jsonResponse(record);
      throw new Error("Unexpected request " + url);
    });
    const api = createHttpAssetApi({ fetch: fetcher });

    await expect(api.listAssets()).resolves.toEqual([record]);
    await expect(api.importAsset(file)).resolves.toEqual(record);
  });

  it("retains structured server errors from the shared management client", async () => {
    const file = new File([new Uint8Array([9])], "replacement.png", { type: "image/png" });
    const fetcher = vi.fn(async (input: RequestInfo | URL) =>
      String(input) === "/auth/management/sessions"
        ? sessionResponse()
        : jsonResponse({
            error: {
              code: "ASSET_REPLACE_REFERENCED",
              id: "err_asset_1",
              message: "The asset is still referenced.",
              nextStep: "Confirm the affected uses before replacing it."
            }
          }, 409)
    );
    const api = createHttpAssetApi({ fetch: fetcher });

    const error = await api.replaceAsset("asset_1", file, false).catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(ManagementHttpError);
    expect(error).toMatchObject({
      code: "ASSET_REPLACE_REFERENCED",
      referenceId: "err_asset_1",
      nextStep: "Confirm the affected uses before replacing it.",
      status: 409
    });
  });
});

function sessionResponse(): Response {
  return jsonResponse({ id: "session_asset", csrfToken: "csrf_asset" });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function assetRecord() {
  return {
    id: "asset_1",
    originalFileName: "replacement.png",
    mediaType: "image" as const,
    mimeType: "image/png",
    sizeBytes: 3,
    checksum: "sha256:replacement",
    storagePath: "image/asset_1-sha256_replacement.png",
    durationMs: null
  };
}
