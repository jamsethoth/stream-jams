import { createDefaultMusicModuleConfig, DefaultOverlayModuleConfigService, InMemoryOverlayModuleConfigRepository, createDefaultOverlayModuleRegistry } from "@stream-jams/core";
import { describe, expect, it } from "vitest";
import { createOverlayModuleRouteTestApp } from "../../http/routes/test-support/route-test-app.js";
import { saveValidatedMusicConfig } from "./music-config-save.js";

describe("Music config save boundary", () => {
  it("rejects unsafe CSS before durable save, including when disabled", async () => {
    const service = new DefaultOverlayModuleConfigService({ registry: createDefaultOverlayModuleRegistry(), repository: new InMemoryOverlayModuleConfigRepository() });
    const before = await service.getModuleConfig("music");
    const config = createDefaultMusicModuleConfig();
    config.css = { ...config.css, source: ".sj-title { background: url(https://example.com/pixel) }", enabled: false };
    await expect(saveValidatedMusicConfig(service, { moduleId: "music", enabled: true, config })).rejects.toThrow();
    expect((await service.getModuleConfig("music")).config).toEqual(before.config);
  });

  it("allows only an unchanged corrupt stylesheet to be explicitly disabled", async () => {
    const corrupt = createDefaultMusicModuleConfig();
    corrupt.css = { ...corrupt.css, source: ".sj-title { background: url(https://example.com/pixel) }", enabled: true };
    const repository = new InMemoryOverlayModuleConfigRepository([{ moduleId: "music", enabled: true, config: corrupt, updatedAt: "2026-10-04T00:00:00.000Z" }]);
    const service = new DefaultOverlayModuleConfigService({ registry: createDefaultOverlayModuleRegistry(), repository });
    const disabled = { ...corrupt, css: { ...corrupt.css, enabled: false } };
    expect((await saveValidatedMusicConfig(service, { moduleId: "music", enabled: true, config: disabled })).config).toEqual(disabled);
    const changed = { ...disabled, css: { ...disabled.css, source: `${disabled.css.source} ` } };
    await expect(saveValidatedMusicConfig(service, { moduleId: "music", enabled: true, config: changed })).rejects.toThrow();
  });

  it("rejects an unsafe direct HTTP config save without changing the durable record", async () => {
    const repository = new InMemoryOverlayModuleConfigRepository();
    const registry = createDefaultOverlayModuleRegistry();
    const service = new DefaultOverlayModuleConfigService({ registry, repository });
    const original = createDefaultMusicModuleConfig();
    await service.saveModuleConfig({ moduleId: "music", enabled: false, config: original });
    const app = createOverlayModuleRouteTestApp({
      metadata: { appName: "stream-jams", version: "test" },
      overlayModuleRegistry: registry,
      overlayModuleConfigService: {
        getModuleConfig: id => service.getModuleConfig(id),
        setModuleEnabled: (id, enabled) => service.setModuleEnabled(id, enabled),
        saveModuleConfig: input => saveValidatedMusicConfig(service, input)
      },
      managementAuthPreHandler: (_request, _reply, done) => done(),
      managementRateLimitPreHandler: (_request, _reply, done) => done()
    });
    const invalid = { ...original, css: { ...original.css, source: ".sj-title { background: url(https://example.com/pixel) }", enabled: true } };
    const response = await app.inject({ method: "PUT", url: "/overlay-modules/music/config", payload: { enabled: true, config: invalid } });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("INVALID_OVERLAY_MODULE_CONFIG");
    expect((await repository.getModuleConfig("music"))?.config).toEqual(original);
    await app.close();
  });
});
