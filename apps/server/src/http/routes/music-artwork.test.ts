import { pearArtworkPolicy } from "../../modules/music/music-artwork-policy.js";
import Fastify from "fastify";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { MusicArtworkService } from "../../modules/music/music-artwork-service.js";
import { registerMusicArtworkRoutes } from "./music-artwork.js";

const owner = { providerId: "pear", generation: "generation" };
const sourceRef = "art_source";
const descriptor = { url: "https://i.ytimg.com/vi/id/default.jpg" };
const png = await sharp({ create: { width: 2, height: 2, channels: 4, background: "blue" } }).png().toBuffer();

function setup() {
  let current = true;
  let currentUrl = descriptor.url;
  let revoked = false;
  let desktopVisible = true;
  let clock = 1000;
  const service = new MusicArtworkService({ getPolicy: () => pearArtworkPolicy,
    isCurrentOwner: candidate => current && candidate.providerId === owner.providerId && candidate.generation === owner.generation,
    isCurrentDescriptor: url => url === currentUrl,
    now: () => clock,
    resolveAddresses: async () => ["8.8.8.8"],
    fetchBytes: async () => png
  });
  const app = Fastify();
  registerMusicArtworkRoutes(app, {
    musicArtworkService: service,
    musicRuntimeCoordinator: { getCurrentArtwork: () => current ? { owner, ref: sourceRef, descriptor: { url: currentUrl } } : null },
    managementRateLimitPreHandler: async () => {},
    managementAuthPreHandler: async (request, reply) => {
      if (request.headers.authorization !== "Bearer management") return reply.status(401).send();
    },
    overlayAccessService: { verifyRouteAccess: async request => {
      const valid = !revoked && request.rawKey === "valid" && request.purpose === "live"
        && (request.scope === "unified" ? request.moduleId === null : request.moduleId === "music");
      return valid ? { authorized: true as const, record: {
        id: "key", overlayId: "default", moduleId: request.moduleId, purpose: "live", scope: request.scope,
        targetProfileId: request.targetProfileId ?? null, keyHash: "hash", routeKeySecretRef: null,
        createdAt: "2026-01-01T00:00:00Z", revokedAt: null
      } } : { authorized: false as const, reason: "key-mismatch" as const };
    } },
    isDesktopMusicVisible: async () => desktopVisible
  });
  return { app, service, setCurrent(value: boolean) { current = value; }, setUrl(value: string) { currentUrl = value; },
    setDesktopVisible(value: boolean) { desktopVisible = value; }, advance(ms: number) { clock += ms; }, revoke() { revoked = true; } };
}

describe("music artwork HTTP delivery", () => {
  it("keeps management and live output authorization separate and serves verified raster", async () => {
    const { app, revoke } = setup();
    try {
      const managementUrl = `/management/music/artwork/${sourceRef}`;
      expect((await app.inject({ url: managementUrl })).statusCode).toBe(401);
      const management = await app.inject({ url: managementUrl, headers: { authorization: "Bearer management" } });
      expect(management.statusCode).toBe(200);
      expect(management.headers["content-type"]).toContain("image/png");
      expect(management.headers["x-content-type-options"]).toBe("nosniff");
      expect(management.rawPayload).toEqual(png);
      expect((await app.inject({ url: `/overlay/modules/music/live/wrong/artwork/${sourceRef}` })).statusCode).toBe(401);
      expect((await app.inject({ url: `/overlay/modules/music/test/valid/artwork/${sourceRef}` })).statusCode).toBe(401);
      expect((await app.inject({ url: `/overlay/modules/music/live/valid/artwork/${sourceRef}?profile=wrong` })).statusCode).toBe(401);
      expect((await app.inject({ url: `/overlay/unified/live/valid/music/artwork/${sourceRef}` })).statusCode).toBe(200);
      revoke();
      expect((await app.inject({ url: `/overlay/modules/music/live/valid/artwork/${sourceRef}` })).statusCode).toBe(401);
    } finally { await app.close(); }
  });

  it("denies arbitrary URLs, old descriptors, revoked generations and expired desktop grants", async () => {
    const { app, service, setCurrent, setUrl, setDesktopVisible, advance } = setup();
    try {
      const ref = await service.resolve(descriptor, owner, new AbortController().signal);
      expect(ref).toMatch(/^art_/);
      const handle = service.issueGrant(ref!, owner, "desktop-music:desktop:primary", 1100)!;
      expect((await app.inject({ url: `/media/music-artwork/${handle}` })).statusCode).toBe(200);
      setDesktopVisible(false);
      expect((await app.inject({ url: `/media/music-artwork/${handle}` })).statusCode).toBe(404);
      setDesktopVisible(true);
      advance(100);
      expect((await app.inject({ url: `/media/music-artwork/${handle}` })).statusCode).toBe(404);
      expect((await app.inject({ url: `/management/music/artwork/${encodeURIComponent(descriptor.url)}`, headers: { authorization: "Bearer management" } })).statusCode).toBe(404);
      setUrl("https://i.ytimg.com/vi/new/default.jpg");
      expect((await app.inject({ url: `/media/music-artwork/${handle}` })).statusCode).toBe(404);
      setCurrent(false);
      expect((await app.inject({ url: `/overlay/modules/music/live/valid/artwork/${sourceRef}` })).statusCode).toBe(404);
      await service.clearGeneration(owner);
      expect(await service.readGrant(handle, "desktop-music:desktop:primary")).toBeNull();
    } finally { await app.close(); }
  });
});
