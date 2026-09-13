import { describe, expect, it, vi } from "vitest";
import { createHttpAssetApi } from "./asset-api.js";

describe("createHttpAssetApi", () => {
  it("loads asset bytes through the authenticated management boundary", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/auth/management/sessions") return sessionResponse();
      expect(String(input)).toBe("/assets/asset_1/file");
      expect(init?.headers).toMatchObject({ authorization: "Bearer session_asset" });
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
      expect(init?.headers).toMatchObject({
        authorization: "Bearer session_asset",
        "content-type": "application/octet-stream",
        "x-stream-jams-confirm-impact": "true",
        "x-stream-jams-csrf": "csrf_asset",
        "x-stream-jams-file-name": "replacement.png",
        "x-stream-jams-mime-type": "image/png"
      });
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
      expect(init?.headers).toMatchObject({
        authorization: `Bearer session_asset_${uploadNumber}`,
        "x-stream-jams-csrf": `csrf_asset_${uploadNumber}`
      });
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
    storagePath: "image/asset_1-sha256_replacement.png"
  };
}
