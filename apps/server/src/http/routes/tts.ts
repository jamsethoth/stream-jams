import type { TtsProviderTestInput, TtsService } from "@stream-jams/core";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { sendHttpError } from "../errors.js";

export interface TtsRouteDependencies {
  readonly ttsService: Pick<TtsService, "listProviders" | "testProvider">;
  readonly managementAuthPreHandler: preHandlerHookHandler;
  readonly managementRateLimitPreHandler: preHandlerHookHandler;
}

export function registerTtsRoutes(app: FastifyInstance, dependencies: TtsRouteDependencies): void {
  const preHandler = [dependencies.managementRateLimitPreHandler, dependencies.managementAuthPreHandler];

  app.get("/tts/providers", { preHandler }, async () => dependencies.ttsService.listProviders());
  app.post("/tts/test", { preHandler }, async (request, reply) => {
    const input = parseTtsTestInput(request.body);
    if (input === null) {
      return sendHttpError(reply, 400, {
        code: "INVALID_TTS_TEST_REQUEST",
        message: "Invalid TTS test request"
      });
    }

    try {
      return await dependencies.ttsService.testProvider(input);
    } catch (error) {
      if (isTtsClientError(error)) {
        return sendHttpError(reply, 400, {
          code: error.code,
          message: error.message
        });
      }

      if (isTtsProviderFailureError(error)) {
        return sendHttpError(reply, 502, {
          code: error.code,
          message: error.message
        });
      }

      throw error;
    }
  });
}

function parseTtsTestInput(body: unknown): TtsProviderTestInput | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }

  const candidate = body as Partial<Record<keyof TtsProviderTestInput, unknown>>;
  if (typeof candidate.providerId !== "string" || candidate.providerId.trim() === "") {
    return null;
  }

  if (typeof candidate.text !== "string" || candidate.text.trim() === "") {
    return null;
  }

  const voiceId = parseNullableString(candidate.voiceId);
  const rate = parseNullableFiniteNumber(candidate.rate);
  const pitch = parseNullableFiniteNumber(candidate.pitch);
  const volume = parseNullableFiniteNumber(candidate.volume);
  const metadata = parseMetadata(candidate.metadata);
  if (voiceId === undefined || rate === undefined || pitch === undefined || volume === undefined || metadata === undefined) {
    return null;
  }

  return {
    providerId: candidate.providerId,
    text: candidate.text,
    voiceId,
    rate,
    pitch,
    volume,
    metadata
  };
}

function isTtsClientError(error: unknown): error is Error & { readonly code: string } {
  return isTtsErrorWithCode(error, "UNKNOWN_TTS_PROVIDER") || isTtsErrorWithCode(error, "UNSUPPORTED_TTS_OPTION");
}

function isTtsProviderFailureError(error: unknown): error is Error & { readonly code: string } {
  return isTtsErrorWithCode(error, "TTS_PROVIDER_FAILURE");
}

function isTtsErrorWithCode(error: unknown, code: string): error is Error & { readonly code: string } {
  return error instanceof Error && "code" in error && error.code === code;
}

function parseNullableString(value: unknown): string | null | undefined {
  if (value === undefined || value === null) {
    return null;
  }

  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function parseNullableFiniteNumber(value: unknown): number | null | undefined {
  if (value === undefined || value === null) {
    return null;
  }

  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function parseMetadata(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined || value === null) {
    return {};
  }

  return typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}
