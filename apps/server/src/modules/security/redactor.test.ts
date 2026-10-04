import { describe, expect, it } from "vitest";
import { createRedactor } from "./redactor.js";

describe("createRedactor", () => {
  it.each(["http", "https", "ws", "wss", "HTTPS"])("removes URL user information from %s URLs", (scheme) => {
    const redactor = createRedactor();
    const output = redactor.redactText(`Connect ${scheme}://user%40name:p%3Assword@localhost:8080/events?view=public#status`);

    expect(output).toBe(`Connect ${scheme}://localhost:8080/events?view=public#status`);
  });

  it("fails closed for malformed credential URLs with encoded query secrets", () => {
    const output = createRedactor().redactText("wss://user:secret@[invalid]/events?access%5ftoken=hidden");
    expect(output).toBe("[REDACTED]");
  });

  it("removes protocol-relative and malformed URL credentials while preserving safe destinations", () => {
    const redactor = createRedactor();

    expect(redactor.redactText("Connect //username:password@[::1]:8080/events?token=opaque&view=public"))
      .toBe("Connect //[::1]:8080/events?token=%5BREDACTED%5D&view=public");
    expect(redactor.redactText("Failed wss://username:password@[invalid]:8080/events"))
      .toBe("Failed wss://[invalid]:8080/events");
    expect(redactor.redactText("http://localhost:8080/events ws://localhost:8080/events"))
      .toBe("http://localhost:8080/events ws://localhost:8080/events");
  });

  it("redacts authentication and credential fields in objects and encoded JSON text", () => {
    const redactor = createRedactor();
    const payload = {
      request: "Authenticate",
      authentication: "challenge-response-secret",
      credentials: { username: "secret-user", value: "credential-secret" },
      public: "retained"
    };

    expect(redactor.redact(payload)).toEqual({
      request: "Authenticate", authentication: "[REDACTED]", credentials: "[REDACTED]", public: "retained"
    });
    expect(JSON.parse(redactor.redactText(JSON.stringify(payload)))).toEqual({
      request: "Authenticate", authentication: "[REDACTED]", credentials: "[REDACTED]", public: "retained"
    });
    expect(redactor.redactText('Provider failed: {"authentication":"response-secret","credential":"escaped \\" secret"}'))
      .toBe('Provider failed: {"authentication":"[REDACTED]","credential":"[REDACTED]"}');
  });

  it("redacts complete OAuth header parameter lists and quoted credential assignments", () => {
    const redactor = createRedactor();

    expect(redactor.redactText('Authorization: OAuth oauth_consumer_key="consumer-secret", oauth_token="oauth-secret", oauth_signature="signature-secret"; status=failed'))
      .toBe("Authorization: OAuth [REDACTED]; status=failed");
    expect(redactor.redactText('authentication="challenge response" credential=opaque-secret'))
      .toBe("authentication=[REDACTED] credential=[REDACTED]");
  });

  it("redacts media capabilities in URLs and ordinary text", () => {
    const redactor = createRedactor();
    expect(redactor.redactText("/media/med_private-capability grant med_other_capability"))
      .toBe("/media/[REDACTED] grant [REDACTED]");
  });
  it("redacts nested secrets, auth headers, URLs, and overlay route keys without mutating input", () => {
    const input = {
      headers: {
        authorization: "Bearer oauth-token-value",
        "x-api-key": "api-key-value",
        accept: "application/json"
      },
      events: [
        {
          oauthToken: "nested-oauth-token",
          message: "Copy http://127.0.0.1:39187/overlay/modules/alerts/live/ovl_liveSecretValue"
        }
      ],
      callbackUrl: "https://example.test/callback?access_token=oauth-secret&state=public",
      downloadUrl: "https://cdn.example.test/asset.mp4?Signature=signed-value&Key-Pair-Id=pair-value&expires=123",
      speakerBotActionName: "configured-secret"
    };
    const redactor = createRedactor({ secretNames: ["speakerBotActionName"] });

    const redacted = redactor.redact(input);

    expect(redacted).toEqual({
      headers: {
        authorization: "[REDACTED]",
        "x-api-key": "[REDACTED]",
        accept: "application/json"
      },
      events: [
        {
          oauthToken: "[REDACTED]",
          message: "Copy http://127.0.0.1:39187/overlay/modules/alerts/live/[REDACTED]"
        }
      ],
      callbackUrl: "https://example.test/callback?access_token=%5BREDACTED%5D&state=public",
      downloadUrl:
        "https://cdn.example.test/asset.mp4?Signature=%5BREDACTED%5D&Key-Pair-Id=%5BREDACTED%5D&expires=123",
      speakerBotActionName: "[REDACTED]"
    });
    expect(input.headers.authorization).toBe("Bearer oauth-token-value");
    expect(input.events[0]?.oauthToken).toBe("nested-oauth-token");
  });

  it("redacts sensitive tokens from plain text", () => {
    const redactor = createRedactor();

    expect(
      redactor.redactText(
        "Authorization: Bearer oauth-token-value; overlay=http://127.0.0.1:39187/overlay/unified/test/ovl_testSecretValue"
      )
    ).toBe("Authorization: Bearer [REDACTED]; overlay=http://127.0.0.1:39187/overlay/unified/test/[REDACTED]");
    expect(redactor.redactText("password=hunter2 token: oauth-secret client_secret=value"))
      .toBe("password=[REDACTED] token=[REDACTED] client_secret=[REDACTED]");
    expect(redactor.redactText("authorization=opaque-secret credential: first credentials=second"))
      .toBe("authorization=[REDACTED] credential=[REDACTED] credentials=[REDACTED]");
  });

  it("redacts generated-style overlay route keys from module and unified URLs", () => {
    const redactor = createRedactor();

    expect(
      redactor.redactText(
        "module=http://127.0.0.1:39187/overlay/modules/alerts/live/ovl_abcDEF123_- unified=http://127.0.0.1:39187/overlay/unified/test/ovl_XYZ789_-"
      )
    ).toBe(
      "module=http://127.0.0.1:39187/overlay/modules/alerts/live/[REDACTED] unified=http://127.0.0.1:39187/overlay/unified/test/[REDACTED]"
    );
  });

  it("redacts timer automation bearer material even outside an authorization header", () => {
    const redactor = createRedactor();
    const token = "tmr_generatedTimerAutomationSecret_1234567890";

    expect(redactor.redactText(`Timer automation failed for ${token}`)).toBe(
      "Timer automation failed for [REDACTED]"
    );
    expect(redactor.redact({ timerAutomationToken: token })).toEqual({ timerAutomationToken: "[REDACTED]" });
  });

  it("redacts sensitive query values from relative request URLs", () => {
    const redactor = createRedactor();

    expect(redactor.redactText("GET /manage?token=secret-value&view=raw")).toBe(
      "GET /manage?token=%5BREDACTED%5D&view=raw"
    );
  });

  it("normalizes control characters across nested exception text", () => {
    const redactor = createRedactor();

    expect(redactor.redact({
      exception: {
        message: "first\r\nsecond\u0000third",
        stack: "Error: failed\n    at file.ts:1:1",
        cause: { message: "Bearer oauth-secret\u007fhidden" }
      }
    })).toEqual({
      exception: {
        message: "first  second third",
        stack: "Error: failed     at file.ts:1:1",
        cause: { message: "Bearer [REDACTED] hidden" }
      }
    });
  });
});
