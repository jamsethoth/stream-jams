import { describe, expect, it } from "vitest";
import { createRedactor } from "./redactor.js";

describe("createRedactor", () => {
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
});
