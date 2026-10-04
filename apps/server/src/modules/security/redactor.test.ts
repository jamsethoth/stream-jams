import { describe, expect, it } from "vitest";
import { createRedactor } from "./redactor.js";

describe("createRedactor", () => {
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

  it("redacts Pear credentials in WS, WSS and HTTP URL forms and nested diagnostics", () => {
    const redactor = createRedactor();
    const sentinel = "pear-secret-sentinel";
    const diagnostic = redactor.redact({
      websocket: `wss://localhost:26538/api/v1/ws?token=${sentinel}`,
      insecureWebsocket: `ws://localhost:26538/api/v1/ws?token=${sentinel}`,
      url: `https://pear:${sentinel}@localhost:26538/auth/client`,
      authorization: `Bearer ${sentinel}`,
      cause: { message: `Authorization: Bearer ${sentinel}` }
    });
    expect(JSON.stringify(diagnostic)).not.toContain(sentinel);
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
