import { describe, expect, it } from "vitest";
import { createServerApp } from "./app.js";

describe("createServerApp", () => {
  it("returns health without binding a production port", async () => {
    const app = createServerApp({
      metadata: {
        appName: "stream-jams",
        version: "1.2.3"
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/health"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: "ok",
      app: "stream-jams",
      version: "1.2.3"
    });
    expect(response.headers["content-type"]).toContain("application/json");
  });

  it("does not register config routes without management auth and rate-limit hooks", () => {
    expect(() =>
      createServerApp({
        metadata: {
          appName: "stream-jams",
          version: "1.2.3"
        },
        serverConfigService: {
          async getServerConfig() {
            return {
              host: "127.0.0.1",
              port: 39187
            };
          },
          async updateServerConfig() {
            return {
              host: "127.0.0.1",
              port: 39187
            };
          }
        }
      })
    ).toThrow("Config routes require management auth and rate-limit hooks");
  });

  it("does not register diagnostics routes without management auth and rate-limit hooks", () => {
    expect(() =>
      createServerApp({
        metadata: {
          appName: "stream-jams",
          version: "1.2.3"
        },
        diagnosticsService: {
          async getDiagnostics() {
            throw new Error("not called");
          },
          async createExport() {
            throw new Error("not called");
          },
          async createDebugExport() {
            throw new Error("not called");
          }
        }
      })
    ).toThrow("Diagnostics routes require service, management auth, and rate-limit hooks");
  });

  it("does not register alert routes without management auth and rate-limit hooks", () => {
    expect(() =>
      createServerApp({
        metadata: {
          appName: "stream-jams",
          version: "1.2.3"
        },
        alertService: {
          async listCollections() {
            return [];
          },
          async createCollection() {
            throw new Error("not called");
          },
          async updateCollection() {
            throw new Error("not called");
          },
          async setCollectionEnabled() {
            throw new Error("not called");
          },
          async deleteCollection() {},
          async listRules() {
            return [];
          },
          async createRule() {
            throw new Error("not called");
          },
          async updateRule() {
            throw new Error("not called");
          },
          async setRuleEnabled() {
            throw new Error("not called");
          },
          async deleteRule() {},
          async createVariant() {
            throw new Error("not called");
          },
          async saveVariant() {
            throw new Error("not called");
          },
          async deleteVariant() {
            throw new Error("not called");
          },
          async getActivationState() {
            return {
              enabledCollectionIds: [],
              disabledRuleIds: []
            };
          },
          async listActiveRules() {
            return [];
          }
        }
      })
    ).toThrow("Alert routes require alert service, management auth, and rate-limit hooks");
  });

  it("does not register asset routes without management auth and rate-limit hooks", () => {
    expect(() =>
      createServerApp({
        metadata: {
          appName: "stream-jams",
          version: "1.2.3"
        },
        assetRepository: {
          async list() {
            return [];
          },
          async findById() {
            return null;
          }
        },
        mediaImportPipeline: {
          async importMedia() {
            throw new Error("not called");
          }
        },
        assetStore: {
          async read() {
            throw new Error("not called");
          }
        }
      })
    ).toThrow("Asset routes require repository, import pipeline, asset store, management auth, and rate-limit hooks");
  });

  it("does not register playback routes without management auth and rate-limit hooks", () => {
    expect(() =>
      createServerApp({
        metadata: {
          appName: "stream-jams",
          version: "1.2.3"
        },
        playbackCoordinator: {
          getSnapshot() {
            throw new Error("not called");
          },
          pause() {
            throw new Error("not called");
          },
          resume() {
            throw new Error("not called");
          },
          mute() {
            throw new Error("not called");
          },
          unmute() {
            throw new Error("not called");
          },
          setDoNotDisturb() {
            throw new Error("not called");
          },
          skipCurrent() {
            throw new Error("not called");
          },
          replayRecent() {
            throw new Error("not called");
          }
        }
      })
    ).toThrow("Playback routes require coordinator, management auth, and rate-limit hooks");
  });

  it("does not register overlay module routes without management auth and rate-limit hooks", () => {
    expect(() =>
      createServerApp({
        metadata: {
          appName: "stream-jams",
          version: "1.2.3"
        },
        overlayModuleRegistry: {
          listModules() {
            return [];
          }
        },
        overlayModuleConfigService: {
          async getModuleConfig() {
            throw new Error("not called");
          },
          async saveModuleConfig() {
            throw new Error("not called");
          },
          async setModuleEnabled() {
            throw new Error("not called");
          }
        }
      })
    ).toThrow("Overlay module routes require registry, config service, management auth, and rate-limit hooks");
  });
  it("does not register TTS routes without management auth and rate-limit hooks", () => {
    expect(() =>
      createServerApp({
        metadata: {
          appName: "stream-jams",
          version: "1.2.3"
        },
        ttsService: {
          async listProviders() {
            return [];
          },
          async testProvider() {
            throw new Error("not called");
          }
        }
      })
    ).toThrow("TTS routes require service, management auth, and rate-limit hooks");
  });

  it("does not register Twitch auth routes without management auth and rate-limit hooks", () => {
    expect(() =>
      createServerApp({
        metadata: {
          appName: "stream-jams",
          version: "1.2.3"
        },
        twitchAuthService: {
          async getStatus() {
            throw new Error("not called");
          },
          async createConnectionStart() {
            throw new Error("not called");
          },
          async pollConnection() {
            throw new Error("not called");
          },
          async refreshConnectedAccount() {
            throw new Error("not called");
          },
          async disconnect() {
            throw new Error("not called");
          }
        }
      })
    ).toThrow("Twitch auth routes require service, management auth, and rate-limit hooks");
  });

  it("does not register Twitch EventSub routes without management auth and rate-limit hooks", () => {
    expect(() =>
      createServerApp({
        metadata: {
          appName: "stream-jams",
          version: "1.2.3"
        },
        twitchEventSubStatusService: {
          getStatus() {
            throw new Error("not called");
          }
        }
      })
    ).toThrow("Twitch EventSub routes require service, management auth, and rate-limit hooks");
  });

});
