import { describe, expect, it } from "vitest";
import {
  evaluateProviderActivation,
  providerCapabilityForKind,
  providerRegistrationAttemptSchema,
  providerSetupInputSchema
} from "./contracts.js";

describe("provider management contracts", () => {
  it.each([
    {
      name: "Main Twitch",
      kind: "twitch",
      configuration: {}
    },
    {
      name: "Local Streamer.bot",
      kind: "streamerbot",
      configuration: { protocol: "ws", host: "127.0.0.1", port: 8080, endpoint: "/" },
      credential: "secret"
    },
    {
      name: "Speaker.bot",
      kind: "speakerbot",
      configuration: { protocol: "ws", host: "127.0.0.1", port: 7680, endpoint: "/" }
    },
    {
      name: "Browser Speech",
      kind: "browser-speech",
      configuration: {}
    }
  ] as const)("accepts $kind provider setup", (input) => {
    expect(providerSetupInputSchema.parse(input)).toEqual(input);
  });

  it("rejects provider-specific configuration on the wrong kind", () => {
    expect(
      providerSetupInputSchema.safeParse({
        name: "Broken Twitch",
        kind: "twitch",
        configuration: { host: "127.0.0.1" }
      }).success
    ).toBe(false);
  });

  it.each([
    ["twitch", "event-source"],
    ["streamerbot", "event-source"],
    ["speakerbot", "tts"],
    ["browser-speech", "tts"]
  ] as const)("maps %s to %s", (kind, capability) => {
    expect(providerCapabilityForKind(kind)).toBe(capability);
  });

  it("represents failed validation without a provider registration", () => {
    expect(
      providerRegistrationAttemptSchema.parse({
        status: "validation-failed",
        provider: null,
        validation: {
          valid: false,
          connectionState: "error",
          intakeState: null,
          validatedAt: "2026-07-15T12:00:00.000Z",
          availableVoices: [],
          error: {
            summary: "Speaker.bot is unreachable",
            cause: "No WebSocket server responded at 127.0.0.1:7680.",
            nextStep: "Start the Speaker.bot WebSocket server and retry.",
            severity: "error",
            occurredAt: "2026-07-15T12:00:00.000Z",
            referenceId: "provider-validation-1",
            correction: null
          }
        }
      }).status
    ).toBe("validation-failed");
  });

  it("blocks activation on blockers and requires confirmation for warnings", () => {
    const error = {
      summary: "No matching alerts",
      cause: null,
      nextStep: "Review the active alert set.",
      severity: "warning" as const,
      occurredAt: null,
      referenceId: null,
      correction: null
    };

    expect(
      evaluateProviderActivation({ matchedAlertCount: 0, unmatchedAlertCount: 2, blockers: [error], warnings: [] })
    ).toEqual({ allowed: false, requiresConfirmation: false });
    expect(
      evaluateProviderActivation({ matchedAlertCount: 1, unmatchedAlertCount: 1, blockers: [], warnings: [error] })
    ).toEqual({ allowed: true, requiresConfirmation: true });
  });
});
