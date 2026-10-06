import {
  createScreenEffectDocument,
  DefaultEffectQueue,
  DefaultPlaybackCooldownService,
  DefaultPlaybackDedupeService,
  screenEffectDocumentSchema,
  type ScreenEffectDocument,
  type ScreenEffectRepository
} from "@stream-jams/core";
import { describe, expect, it, vi } from "vitest";
import { createScreenEffectRouteTestApp as createServerApp } from "./test-support/route-test-app.js";
import { LocalManagementSessionService } from "../../modules/auth/management-session-service.js";
import {
  EffectDefinitionNotFoundError,
  EffectManagementService,
  EffectLiveImpactConfirmationRequiredError
} from "../../modules/screen-effects/effect-management-service.js";
import { createTestManagementSecurity, managementTestHeaders } from "../test-support/management-security-fixture.js";
import { createLocalManagementRateLimitPreHandler, LocalManagementRateLimiter } from "../middleware/local-management-rate-limit.js";
import { EffectAdmissionService } from "../../modules/screen-effects/effect-admission-service.js";
import { EffectReferenceUnavailableError } from "../../modules/screen-effects/effect-errors.js";

function effect(): ScreenEffectDocument {
  const draft = createScreenEffectDocument({ id: "effect-one", name: "Effect one", defaultVariantId: "variant-one" });
  return screenEffectDocumentSchema.parse({
    ...draft,
    variants: [{
      ...draft.variants[0],
      sound: { assetId: "tone-one", volume: 0.5 },
      outputs: { browserSource: true, deviceRouteIds: [] }
    }]
  });
}

describe("Screen Effects routes", () => {
  it.each([
    ["visual-asset", 'Screen Effect visual asset "missing" is missing or incompatible'],
    ["sound-asset", 'Screen Effect sound asset "missing" is missing or incompatible'],
    ["audio-route", 'Screen Effect audio route "missing" does not exist']
  ] as const)("maps typed %s reference failures to the safe conflict contract", async (kind, message) => {
    const { app, headers, service } = await fixture();
    service.update.mockRejectedValueOnce(new EffectReferenceUnavailableError(kind, "missing"));
    try {
      const response = await app.inject({ method: "PUT", url: "/screen-effects/effect-one", headers,
        payload: { document: effect(), confirmLiveImpact: true } });
      expect(response.statusCode).toBe(409);
      expect(response.json()).toEqual({ error: { code: "SCREEN_EFFECT_REFERENCE_UNAVAILABLE", message } });
    } finally { await app.close(); }
  });
  it("does not classify an unrelated exception by reference-message wording", async () => {
    const { app, headers, service } = await fixture();
    service.update.mockRejectedValueOnce(new Error("Screen Effect sound asset private-detail"));
    try {
      const response = await app.inject({ method: "PUT", url: "/screen-effects/effect-one", headers,
        payload: { document: effect(), confirmLiveImpact: true } });
      expect(response.statusCode).toBe(500);
      expect(response.body).not.toContain("private-detail");
    } finally { await app.close(); }
  });
  it.each(["definition", "variant", "success", "unknown"] as const)(
    "maps %s outcomes across management and asynchronous admission",
    async (outcome) => {
      let current: ScreenEffectDocument | null = { ...effect(), enabled: true };
      const repository: ScreenEffectRepository = {
        list: async () => current === null ? [] : [current],
        find: async () => current,
        save: async (value) => { current = value; },
        remove: async () => { current = null; }
      };
      let release!: () => void;
      let entered!: () => void;
      const reachedAdmission = new Promise<void>((resolve) => { entered = resolve; });
      const resumeAdmission = new Promise<void>((resolve) => { release = resolve; });
      const admission = new EffectAdmissionService({
        repository, queue: new DefaultEffectQueue(),
        dedupe: new DefaultPlaybackDedupeService(),
        cooldowns: new DefaultPlaybackCooldownService(),
        getModuleCooldownSeconds: async () => 0,
        generateOccurrenceId: () => "test-occurrence",
        isModuleEnabled: async () => {
          entered();
          await resumeAdmission;
          if (outcome === "unknown") throw new Error("private transport detail");
          return true;
        }
      });
      const service = new EffectManagementService({
        repository,
        testEffectVariant: (id, variantId) => admission.testEffectVariant(id, variantId)
      });
      const serverErrors = vi.fn();
      const app = createServerApp({
        metadata: { appName: "stream-jams", version: "test" },
        effectManagementService: service,
        managementAuthPreHandler: async () => {},
        managementRateLimitPreHandler: async () => {},
        generateServerErrorId: () => "failure-reference",
        serverErrorLogger: serverErrors
      });
      try {
        const responsePromise = app.inject({ method: "POST", url: "/screen-effects/effect-one/test",
          payload: { variantId: "variant-one", confirmLiveImpact: true } });
        await reachedAdmission;
        if (outcome === "definition") current = null;
        if (outcome === "variant") current = screenEffectDocumentSchema.parse({
          ...current!,
          variants: [{ ...current!.variants[0]!, id: "variant-two" }]
        });
        release();
        const response = await responsePromise;
        if (outcome === "definition") {
          expect(response.statusCode).toBe(404);
          expect(response.json()).toEqual({ error: { code: "SCREEN_EFFECT_NOT_FOUND", message: 'Screen Effect "effect-one" was not found' } });
        } else if (outcome === "variant") {
          expect(response.statusCode).toBe(409);
          expect(response.json()).toEqual({ error: { code: "SCREEN_EFFECT_VARIANT_UNAVAILABLE", message: 'Screen Effect variant "variant-one" is unavailable for live testing' } });
        } else if (outcome === "unknown") {
          expect(response.statusCode).toBe(500);
          expect(response.json()).toMatchObject({ error: { code: "INTERNAL_SERVER_ERROR" } });
          expect(response.body).not.toContain("private transport detail");
        } else {
          expect(response.statusCode).toBe(200);
          expect(response.json()).toMatchObject({ status: "queued" });
        }
        expect(serverErrors).toHaveBeenCalledTimes(outcome === "unknown" ? 1 : 0);
      } finally { release(); await app.close(); }
    }
  );
  it("protects set CRUD and delegates explicit activation and scoped effect creation", async () => {
    const { app, headers, service, sets } = await fixture();
    expect((await app.inject({ method: "GET", url: "/screen-effect-sets" })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: "/screen-effect-sets", payload: { id: "new", name: "New" } })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/screen-effect-sets", headers })).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: "/screen-effect-sets", headers, payload: { id: "new", name: "New", sourceId: "default" } })).statusCode).toBe(201);
    expect(sets.createSet).toHaveBeenCalledWith({ id: "new", name: "New" }, "default");
    expect((await app.inject({ method: "PUT", url: "/screen-effect-sets/new", headers, payload: { name: "Renamed" } })).statusCode).toBe(200);
    sets.activateSet.mockRejectedValueOnce(new EffectLiveImpactConfirmationRequiredError());
    expect((await app.inject({ method: "POST", url: "/screen-effect-sets/new/activate", headers, payload: {} })).statusCode).toBe(409);
    expect((await app.inject({ method: "POST", url: "/screen-effect-sets/new/activate", headers, payload: { confirmLiveImpact: true } })).statusCode).toBe(204);
    expect(sets.activateSet).toHaveBeenLastCalledWith("new", true);
    expect((await app.inject({ method: "POST", url: "/screen-effects?set=new", headers, payload: effect() })).statusCode).toBe(201);
    expect(service.create).toHaveBeenCalledWith(effect(), "new");
    expect((await app.inject({ method: "DELETE", url: "/screen-effect-sets/new", headers })).statusCode).toBe(204);
    expect((await app.inject({ method: "POST", url: "/screen-effect-sets", headers, payload: { id: "new", name: " " } })).statusCode).toBe(400);
  });

  it("protects and delegates the complete document workflow", async () => {
    const { app, headers, service } = await fixture();
    const candidate = effect();

    expect((await app.inject({ method: "GET", url: "/screen-effects", headers })).json()).toEqual([candidate]);
    expect((await app.inject({ method: "GET", url: "/screen-effects/effect-one", headers })).json()).toEqual(candidate);
    expect((await app.inject({ method: "POST", url: "/screen-effects", headers, payload: candidate })).statusCode).toBe(201);
    expect((await app.inject({ method: "PUT", url: "/screen-effects/effect-one", headers, payload: { document: candidate, confirmLiveImpact: true } })).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: "/screen-effects/effect-one/test", headers, payload: { variantId: "variant-one", confirmLiveImpact: true } })).json()).toMatchObject({ status: "queued" });
    expect((await app.inject({ method: "DELETE", url: "/screen-effects/effect-one", headers })).statusCode).toBe(204);

    expect(service.update).toHaveBeenCalledWith("effect-one", candidate, true);
    expect(service.test).toHaveBeenCalledWith("effect-one", "variant-one", true);
  });

  it("rejects invalid or unauthenticated requests and maps bounded errors", async () => {
    const { app, headers, service } = await fixture();
    expect((await app.inject({ method: "GET", url: "/screen-effects" })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: "/screen-effects", headers, payload: { id: "invalid" } })).statusCode).toBe(400);
    expect((await app.inject({
      method: "POST",
      url: "/screen-effects/effect-one/test",
      headers,
      payload: { variantId: "variant-one", confirmLiveImpact: true, command: "not-allowed" }
    })).statusCode).toBe(400);
    service.get.mockRejectedValueOnce(new EffectDefinitionNotFoundError("missing"));
    expect((await app.inject({ method: "GET", url: "/screen-effects/missing", headers })).statusCode).toBe(404);
    service.update.mockRejectedValueOnce(new EffectLiveImpactConfirmationRequiredError());
    const response = await app.inject({
      method: "PUT",
      url: "/screen-effects/effect-one",
      headers,
      payload: { document: effect(), confirmLiveImpact: false }
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: { code: "SCREEN_EFFECT_LIVE_IMPACT_CONFIRMATION_REQUIRED" }
    });
  });
});

async function fixture() {
  const sets = {
    listSets: vi.fn(async () => []),
    createSet: vi.fn(async (input: { id: string; name: string }) => ({ ...input, active: false, effectIds: [] })),
    renameSet: vi.fn(async (id: string, name: string) => ({ id, name, active: false, effectIds: [] })),
    activateSet: vi.fn< (id: string, confirmed: boolean) => Promise<void> >(async () => {}),
    removeSet: vi.fn< (id: string) => Promise<void> >(async () => {})
  };
  const candidate = effect();
  const service = {
    list: vi.fn(async () => [candidate]),
    get: vi.fn(async () => candidate),
    create: vi.fn(async (value: ScreenEffectDocument) => value),
    update: vi.fn(async (_id: string, value: ScreenEffectDocument) => value),
    test: vi.fn(async (effectId: string, variantId: string) => ({
      effectId,
      occurrenceId: `occurrence-${variantId}`,
      status: "queued" as const
    })),
    remove: vi.fn(async () => {})
  };
  const sessionService = new LocalManagementSessionService({
    clock: () => new Date("2026-09-13T12:00:00.000Z"),
    generateId: () => "mgmt-screen-effects",
    sessionTtlMs: 60_000
  });
  const session = await sessionService.createSession();
  const limiter = new LocalManagementRateLimiter({ maxRequests: 100, windowMs: 60_000 });
  const app = createServerApp({
    metadata: { appName: "stream-jams", version: "1.2.3" },
    effectManagementService: service,
    effectSets: sets,
    managementAuthPreHandler: createTestManagementSecurity(sessionService),
    managementRateLimitPreHandler: createLocalManagementRateLimitPreHandler({ limiter })
  });
  return { app, headers: managementTestHeaders(session, "POST"), service, sets };
}
