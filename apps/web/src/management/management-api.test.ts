import { describe, expect, it, vi } from "vitest";
import { createHttpManagementApi } from "./management-api.js";

describe("createHttpManagementApi", () => {
  it("creates one management session and sends bearer headers to protected routes", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/auth/management/sessions") {
        return jsonResponse({ id: "mgmt_session" });
      }

      if (url === "/config/server") {
        expect(init?.headers).toMatchObject({
          authorization: "Bearer mgmt_session"
        });
        return jsonResponse({ host: "127.0.0.1", port: 39187 });
      }

      if (url === "/playback") {
        expect(init?.headers).toMatchObject({
          authorization: "Bearer mgmt_session"
        });
        return jsonResponse({
          current: null,
          queued: [],
          recent: [],
          paused: false,
          muted: false,
          doNotDisturb: false
        });
      }

      throw new Error(`Unexpected request ${url}`);
    });
    const api = createHttpManagementApi({ fetch: fetcher });

    await api.getServerConfig();
    await api.getPlayback();

    expect(fetcher.mock.calls.filter(([url]) => String(url) === "/auth/management/sessions")).toHaveLength(1);
  });

  it("loads module definitions with config and updates module enabled state", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/auth/management/sessions") {
        return jsonResponse({ id: "mgmt_session" });
      }

      if (url === "/overlay-modules") {
        return jsonResponse([
          {
            id: "alerts",
            displayName: "Alerts",
            version: "0.0.0",
            defaultEnabled: true,
            configSchemaVersion: 1,
            defaultConfig: {},
            wizard: {
              steps: []
            },
            renderer: {
              entryPoint: "overlay/modules/alerts",
              supportedOutputs: ["module", "unified"]
            }
          }
        ]);
      }

      if (url === "/overlay-modules/alerts/config") {
        return jsonResponse({
          moduleId: "alerts",
          enabled: true,
          config: {
            canvas: {
              width: 1920,
              height: 1080
            }
          },
          updatedAt: "2026-05-30T12:00:00.000Z"
        });
      }

      if (url === "/overlay-modules/alerts/enabled") {
        expect(init).toMatchObject({
          method: "PATCH",
          body: JSON.stringify({ enabled: false })
        });
        expect(init?.headers).toMatchObject({
          authorization: "Bearer mgmt_session",
          "content-type": "application/json"
        });
        return jsonResponse({
          moduleId: "alerts",
          enabled: false,
          config: {},
          updatedAt: "2026-05-30T12:00:00.000Z"
        });
      }

      throw new Error(`Unexpected request ${url}`);
    });
    const api = createHttpManagementApi({ fetch: fetcher });

    await expect(api.listModules()).resolves.toEqual([
      expect.objectContaining({
        id: "alerts",
        displayName: "Alerts",
        enabled: true
      })
    ]);
    await expect(api.setModuleEnabled("alerts", false)).resolves.toMatchObject({
      moduleId: "alerts",
      enabled: false
    });
  });


  it("loads and updates moderation settings with management headers", async () => {
    const settings = {
      renderedText: {
        maxLength: 240,
        blockedTerms: ["spoiler"],
        stripUrls: true
      },
      ttsText: {
        maxLength: 180,
        blockedTerms: ["spoiler"],
        stripUrls: false
      }
    };
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/auth/management/sessions") {
        return jsonResponse({ id: "mgmt_session" });
      }

      if (url === "/moderation/settings" && init?.method === undefined) {
        expect(init?.headers).toMatchObject({
          authorization: "Bearer mgmt_session"
        });
        return jsonResponse(settings);
      }

      if (url === "/moderation/settings") {
        expect(init).toMatchObject({
          method: "PATCH",
          body: JSON.stringify(settings)
        });
        expect(init?.headers).toMatchObject({
          authorization: "Bearer mgmt_session",
          "content-type": "application/json"
        });
        return jsonResponse(settings);
      }

      throw new Error("Unexpected request " + url);
    });
    const api = createHttpManagementApi({ fetch: fetcher });

    await expect(api.getModerationSettings()).resolves.toEqual(settings);
    await expect(api.updateModerationSettings(settings)).resolves.toEqual(settings);
  });
  it("loads diagnostics and redacted exports with management headers and limits", async () => {
    const diagnostics = {
      eventLogs: [],
      alertMatchLogs: [],
      playbackLogs: [],
      providerErrors: []
    };
    const exported = {
      generatedAt: "2026-05-31T02:05:00.000Z",
      rawEventLogs: [],
      ...diagnostics
    };
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/auth/management/sessions") {
        return jsonResponse({ id: "mgmt_session" });
      }

      if (url === "/diagnostics?limit=2") {
        expect(init?.headers).toMatchObject({
          authorization: "Bearer mgmt_session"
        });
        return jsonResponse(diagnostics);
      }

      if (url === "/diagnostics/export?limit=2") {
        expect(init?.headers).toMatchObject({
          authorization: "Bearer mgmt_session"
        });
        return jsonResponse(exported);
      }

      throw new Error("Unexpected request " + url);
    });
    const api = createHttpManagementApi({ fetch: fetcher });

    await expect(api.getDiagnostics({ limit: 2 })).resolves.toEqual(diagnostics);
    await expect(api.exportDiagnostics({ limit: 2 })).resolves.toEqual(exported);
  });

  it("loads Twitch EventSub status with management headers", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/auth/management/sessions") {
        return jsonResponse({ id: "mgmt_session" });
      }

      if (url === "/twitch/eventsub/status") {
        expect(init?.headers).toMatchObject({
          authorization: "Bearer mgmt_session"
        });
        return jsonResponse({
          state: "ready",
          acceptedCount: 3,
          duplicateCount: 1,
          rejectedCount: 0,
          lastEventAt: "2026-05-30T12:00:00.000Z",
          lastErrorAt: null,
          message: null
        });
      }

      throw new Error("Unexpected request " + url);
    });
    const api = createHttpManagementApi({ fetch: fetcher });

    await expect(api.getTwitchEventSubStatus()).resolves.toEqual({
      state: "ready",
      acceptedCount: 3,
      duplicateCount: 1,
      rejectedCount: 0,
      lastEventAt: "2026-05-30T12:00:00.000Z",
      lastErrorAt: null,
      message: null
    });
  });

  it("includes backend error code and id in thrown messages", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/auth/management/sessions") {
        return jsonResponse({ id: "mgmt_session" });
      }

      if (url === "/config/server") {
        return jsonResponse(
          {
            error: {
              code: "WEB_BUILD_UNAVAILABLE",
              id: "err_reference",
              message: "Web build assets are unavailable."
            }
          },
          { status: 503 }
        );
      }

      throw new Error("Unexpected request " + url);
    });
    const api = createHttpManagementApi({ fetch: fetcher });

    await expect(api.getServerConfig()).rejects.toThrow(
      "Web build assets are unavailable. (WEB_BUILD_UNAVAILABLE, err_reference)"
    );
  });
});

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json"
    },
    ...init
  });
}
