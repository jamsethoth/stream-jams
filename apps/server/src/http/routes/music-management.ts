import { musicCredentialReplacementInputSchema, musicCredentialReplacementResultSchema, musicManagementStatusSchema, musicPairingAttemptViewSchema, musicPairingCertificateAcceptanceSchema, pearConfigurationSchema } from "@stream-jams/core";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import type { PearPairingService } from "../../modules/music/pear-pairing-service.js";
import type { MusicManagementService } from "../../modules/music/music-management-service.js";
import { MusicSourceNotFoundError } from "../../modules/music/music-management-service.js";
import type { ProviderManagementService } from "../../modules/providers/provider-management-service.js";
import { MusicCredentialReplacementUnavailableError } from "../../modules/providers/provider-management-service.js";
import { sendHttpError } from "../errors.js";
import { readParam, sendProviderCommandError } from "./management-route-errors.js";

export interface MusicManagementRouteDependencies {
  readonly pairing: Pick<PearPairingService, "begin" | "get" | "cancel" | "acceptCertificate">;
  readonly management?: Pick<MusicManagementService, "getStatus" | "reconnect"> | undefined;
  readonly providers?: Pick<ProviderManagementService, "replaceMusicCredential"> | undefined;
  readonly preHandlers: preHandlerHookHandler[];
}

export function registerMusicManagementRoutes(app: FastifyInstance, dependencies: MusicManagementRouteDependencies): void {
  const preHandler = dependencies.preHandlers;
  app.post("/management/music/pairing", { preHandler }, async (request, reply) => {
    const config = pearConfigurationSchema.parse(request.body);
    return reply.status(202).send(musicPairingAttemptViewSchema.parse(await dependencies.pairing.begin(config)));
  });
  app.get("/management/music/pairing/:attemptId", { preHandler }, async (request, reply) => {
    try { return musicPairingAttemptViewSchema.parse(dependencies.pairing.get(readParam(request.params, "attemptId"))); }
    // error-provenance: allow expected -- unknown opaque pairing IDs have one bounded response
    catch { return sendHttpError(reply, 404, { code: "MUSIC_PAIRING_NOT_FOUND", message: "Music pairing attempt was not found" }); }
  });
  app.post("/management/music/pairing/:attemptId/certificate", { preHandler }, async (request, reply) => {
    const { sha256 } = musicPairingCertificateAcceptanceSchema.parse(request.body);
    try { return musicPairingAttemptViewSchema.parse(dependencies.pairing.acceptCertificate(readParam(request.params, "attemptId"), sha256)); }
    // error-provenance: allow expected -- an unknown, expired or mismatched certificate review has one bounded response
    catch { return sendHttpError(reply, 409, { code: "MUSIC_PAIRING_CERTIFICATE_UNAVAILABLE", message: "The certificate review expired or no longer matches. Start a new pairing request." }); }
  });
  app.delete("/management/music/pairing/:attemptId", { preHandler }, async (request, reply) => {
    try { await dependencies.pairing.cancel(readParam(request.params, "attemptId")); }
    // error-provenance: allow expected -- cancelling an unknown pairing ID returns the same bounded response
    catch { return sendHttpError(reply, 404, { code: "MUSIC_PAIRING_NOT_FOUND", message: "Music pairing attempt was not found" }); }
    return reply.status(204).send();
  });
  if (dependencies.management !== undefined) {
    app.get("/management/music/status", { preHandler }, async () =>
      musicManagementStatusSchema.parse(await dependencies.management!.getStatus())
    );
    app.post("/management/music/providers/:providerId/reconnect", { preHandler }, async (request, reply) => {
      try { return musicManagementStatusSchema.parse(await dependencies.management!.reconnect(readParam(request.params, "providerId"))); }
      catch (error) {
        if (error instanceof MusicSourceNotFoundError) return sendHttpError(reply, 404, { code: "MUSIC_SOURCE_NOT_FOUND", message: "Music source was not found. Refresh the list and retry." });
        throw error;
      }
    });
  }
  if (dependencies.providers !== undefined) {
    app.post("/management/music/providers/:providerId/credential", { preHandler }, async (request, reply) => {
      const parsed = musicCredentialReplacementInputSchema.parse(request.body);
      try { return musicCredentialReplacementResultSchema.parse(await dependencies.providers!.replaceMusicCredential(readParam(request.params, "providerId"), parsed)); }
      catch (error) {
        if (error instanceof MusicCredentialReplacementUnavailableError) return sendHttpError(reply, 409, { code: error.code, message: "This source cannot be paired with Pear Desktop. Refresh the list and retry." });
        return sendProviderCommandError(reply, error);
      }
    });
  }
}
