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
});
