import { describe, expect, it } from "vitest";
import {
  DefaultTwitchApiClient,
  TwitchApiHttpError,
  TwitchApiResponseError
} from "./twitch-api-client.js";

const deviceAuthorizationRequest = {
  clientId: "client-id",
  scopes: ["bits:read", "moderator:read:followers"]
} as const;

const deviceTokenRequest = {
  ...deviceAuthorizationRequest,
  deviceCode: "device-code"
} as const;

describe("DefaultTwitchApiClient", () => {
  it("starts device authorization with the requested scopes", async () => {
    const fetcher = createRecordingFetch([
      jsonResponse({
        device_code: "device-code",
        user_code: "ABCD-EFGH",
        verification_uri: "https://www.twitch.tv/activate",
        expires_in: 1_800,
        interval: 5
      })
    ]);
    const client = createClient(fetcher.fetch);

    await expect(client.startDeviceAuthorization(deviceAuthorizationRequest)).resolves.toEqual({
      deviceCode: "device-code",
      userCode: "ABCD-EFGH",
      verificationUri: "https://www.twitch.tv/activate",
      expiresIn: 1_800,
      interval: 5
    });

    expect(fetcher.requests).toHaveLength(1);
    expect(fetcher.requests[0]?.url).toBe("https://id.twitch.tv/oauth2/device");
    expect(fetcher.requests[0]?.init.method).toBe("POST");
    expect(String(fetcher.requests[0]?.init.body)).toBe(
      "client_id=client-id&scopes=bits%3Aread+moderator%3Aread%3Afollowers"
    );
  });

  it("maps known device authorization polling responses", async () => {
    const fetcher = createRecordingFetch([
      jsonResponse({ message: "authorization_pending" }, { status: 400 }),
      jsonResponse({ message: "access_denied" }, { status: 400 }),
      jsonResponse({ message: "invalid device code" }, { status: 400 })
    ]);
    const client = createClient(fetcher.fetch);

    await expect(client.pollDeviceAuthorization(deviceTokenRequest)).resolves.toEqual({ status: "pending" });
    await expect(client.pollDeviceAuthorization(deviceTokenRequest)).resolves.toEqual({ status: "denied" });
    await expect(client.pollDeviceAuthorization(deviceTokenRequest)).resolves.toEqual({ status: "expired" });

    expect(fetcher.requests.map((request) => request.url)).toEqual([
      "https://id.twitch.tv/oauth2/token",
      "https://id.twitch.tv/oauth2/token",
      "https://id.twitch.tv/oauth2/token"
    ]);
    expect(fetcher.requests.map((request) => String(request.init.body))).toEqual([
      "client_id=client-id&scopes=bits%3Aread+moderator%3Aread%3Afollowers&device_code=device-code&grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Adevice_code",
      "client_id=client-id&scopes=bits%3Aread+moderator%3Aread%3Afollowers&device_code=device-code&grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Adevice_code",
      "client_id=client-id&scopes=bits%3Aread+moderator%3Aread%3Afollowers&device_code=device-code&grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Adevice_code"
    ]);
  });

  it("returns a token grant when device authorization succeeds", async () => {
    const fetcher = createRecordingFetch([
      jsonResponse({
        access_token: "access-token-1",
        refresh_token: "refresh-token-1",
        expires_in: 14_400,
        scope: ["bits:read"],
        token_type: "bearer"
      })
    ]);
    const client = createClient(fetcher.fetch);

    await expect(client.pollDeviceAuthorization(deviceTokenRequest)).resolves.toEqual({
      status: "granted",
      grant: {
        accessToken: "access-token-1",
        refreshToken: "refresh-token-1",
        expiresIn: 14_400,
        scopes: ["bits:read"],
        tokenType: "bearer"
      }
    });
  });

  it("refreshes user tokens without a client secret", async () => {
    const fetcher = createRecordingFetch([
      jsonResponse({
        access_token: "access-token-2",
        refresh_token: "refresh-token-2",
        expires_in: 14_000,
        scope: ["channel:read:subscriptions"],
        token_type: "bearer"
      })
    ]);
    const client = createClient(fetcher.fetch);

    await expect(
      client.refreshUserToken({
        clientId: "client-id",
        refreshToken: "refresh-token-1"
      })
    ).resolves.toMatchObject({
      accessToken: "access-token-2",
      refreshToken: "refresh-token-2",
      scopes: ["channel:read:subscriptions"]
    });

    expect(fetcher.requests[0]?.url).toBe("https://id.twitch.tv/oauth2/token");
    expect(String(fetcher.requests[0]?.init.body)).toBe(
      "client_id=client-id&grant_type=refresh_token&refresh_token=refresh-token-1"
    );
  });

  it("rejects malformed device authorization success bodies", async () => {
    const malformedBodies = [
      {
        device_code: "device-code",
        user_code: "ABCD-EFGH",
        verification_uri: "https://www.twitch.tv/activate",
        expires_in: 0,
        interval: 5
      },
      {
        device_code: "device-code",
        user_code: "ABCD-EFGH",
        verification_uri: "https://www.twitch.tv/activate",
        expires_in: 1_800,
        interval: 0
      },
      {
        device_code: "",
        user_code: "ABCD-EFGH",
        verification_uri: "https://www.twitch.tv/activate",
        expires_in: 1_800,
        interval: 5
      },
      {
        device_code: "device-code",
        user_code: "",
        verification_uri: "https://www.twitch.tv/activate",
        expires_in: 1_800,
        interval: 5
      },
      {
        device_code: "device-code",
        user_code: "ABCD-EFGH",
        verification_uri: "",
        expires_in: 1_800,
        interval: 5
      },
      {
        device_code: "device-code",
        user_code: "ABCD-EFGH",
        verification_uri: "http://www.twitch.tv/activate",
        expires_in: 1_800,
        interval: 5
      },
      {
        device_code: "device-code",
        user_code: "ABCD-EFGH",
        verification_uri: "https://twitch.tv/activate",
        expires_in: 1_800,
        interval: 5
      }
    ];
    const fetcher = createRecordingFetch(malformedBodies.map((body) => jsonResponse(body)));
    const client = createClient(fetcher.fetch);

    for (let index = 0; index < malformedBodies.length; index += 1) {
      await expect(client.startDeviceAuthorization(deviceAuthorizationRequest)).rejects.toBeInstanceOf(
        TwitchApiResponseError
      );
    }
  });

  it("rejects malformed token and device polling error bodies without exposing token values", async () => {
    const fetcher = createRecordingFetch([
      jsonResponse({
        access_token: "access-token-secret",
        refresh_token: "refresh-token-secret",
        token_type: "bearer"
      }),
      jsonResponse({ message: 123 }, { status: 400 }),
      new Response("not JSON", { status: 400 })
    ]);
    const client = createClient(fetcher.fetch);

    const malformedTokenGrant = client.pollDeviceAuthorization(deviceTokenRequest);
    await expect(malformedTokenGrant).rejects.toBeInstanceOf(TwitchApiResponseError);
    await expect(malformedTokenGrant).rejects.not.toThrow(/access-token-secret|refresh-token-secret/);
    await expect(client.pollDeviceAuthorization(deviceTokenRequest)).rejects.toBeInstanceOf(TwitchApiHttpError);
    await expect(client.pollDeviceAuthorization(deviceTokenRequest)).rejects.toBeInstanceOf(TwitchApiResponseError);
  });

  it("validates tokens and reads the current Helix user with Twitch auth headers", async () => {
    const fetcher = createRecordingFetch([
      jsonResponse({
        client_id: "client-id",
        login: "streamer",
        scopes: ["bits:read", "channel:read:redemptions"],
        user_id: "141981764",
        expires_in: 12_000
      }),
      jsonResponse({
        data: [
          {
            id: "141981764",
            login: "streamer",
            display_name: "Streamer"
          }
        ]
      })
    ]);
    const client = createClient(fetcher.fetch);

    await expect(client.validateToken({ accessToken: "access-token" })).resolves.toEqual({
      clientId: "client-id",
      login: "streamer",
      scopes: ["bits:read", "channel:read:redemptions"],
      userId: "141981764",
      expiresIn: 12_000
    });
    await expect(client.getCurrentUser({ accessToken: "access-token", clientId: "client-id" })).resolves.toEqual({
      id: "141981764",
      login: "streamer",
      displayName: "Streamer"
    });

    expect(fetcher.requests[0]?.init.headers).toEqual({
      authorization: "OAuth access-token"
    });
    expect(fetcher.requests[1]?.init.headers).toEqual({
      authorization: "Bearer access-token",
      "client-id": "client-id"
    });
  });

  it("retrieves and projects every custom reward with Twitch auth headers", async () => {
    const fetcher = createRecordingFetch([
      jsonResponse({
        data: [
          {
            id: "reward-enabled",
            title: "Hydrate",
            prompt: "Drink some water",
            cost: 500,
            background_color: "#00AAFF",
            is_user_input_required: false,
            is_enabled: true,
            is_paused: false,
            is_in_stock: true,
            image: { url_1x: "https://provider.invalid/reward.png" },
            default_image: { url_1x: "https://provider.invalid/default.png" },
            unknown_provider_field: "not returned"
          },
          {
            id: "reward-paused",
            title: "Paused reward",
            prompt: "",
            cost: 1_000,
            background_color: "#112233",
            is_user_input_required: true,
            is_enabled: true,
            is_paused: true,
            is_in_stock: true
          },
          {
            id: "reward-out-of-stock",
            title: "Out of stock reward",
            prompt: "Unavailable for now",
            cost: 2_000,
            background_color: "#ABCDEF",
            is_user_input_required: false,
            is_enabled: false,
            is_paused: false,
            is_in_stock: false
          }
        ]
      })
    ]);
    const client = createClient(fetcher.fetch);

    await expect(
      client.getCustomRewards({
        accessToken: "access-token",
        clientId: "client-id",
        broadcasterId: "broadcaster-1"
      })
    ).resolves.toEqual({
      rewards: [
        {
          id: "reward-enabled",
          title: "Hydrate",
          prompt: "Drink some water",
          cost: 500,
          backgroundColor: "#00AAFF",
          isUserInputRequired: false,
          isEnabled: true,
          isPaused: false,
          isInStock: true
        },
        {
          id: "reward-paused",
          title: "Paused reward",
          prompt: "",
          cost: 1_000,
          backgroundColor: "#112233",
          isUserInputRequired: true,
          isEnabled: true,
          isPaused: true,
          isInStock: true
        },
        {
          id: "reward-out-of-stock",
          title: "Out of stock reward",
          prompt: "Unavailable for now",
          cost: 2_000,
          backgroundColor: "#ABCDEF",
          isUserInputRequired: false,
          isEnabled: false,
          isPaused: false,
          isInStock: false
        }
      ]
    });

    expect(fetcher.requests).toHaveLength(1);
    expect(fetcher.requests[0]).toEqual({
      url: "https://api.twitch.tv/helix/channel_points/custom_rewards?broadcaster_id=broadcaster-1",
      init: {
        headers: {
          authorization: "Bearer access-token",
          "client-id": "client-id"
        }
      }
    });
    expect(fetcher.requests[0]?.url).not.toContain("only_manageable_rewards");
  });

  it("accepts an empty custom reward catalog", async () => {
    const fetcher = createRecordingFetch([jsonResponse({ data: [] })]);
    const client = createClient(fetcher.fetch);

    await expect(
      client.getCustomRewards({
        accessToken: "access-token",
        clientId: "client-id",
        broadcasterId: "broadcaster-1"
      })
    ).resolves.toEqual({ rewards: [] });
  });

  it("rejects invalid, oversized, and malformed custom reward responses", async () => {
    const validReward = {
      id: "reward-1",
      title: "Hydrate",
      prompt: "Drink some water",
      cost: 500,
      background_color: "#00AAFF",
      is_user_input_required: false,
      is_enabled: true,
      is_paused: false,
      is_in_stock: true
    };
    const fetcher = createRecordingFetch([
      new Response("not JSON", { status: 200 }),
      jsonResponse({ data: Array.from({ length: 51 }, (_, index) => ({ ...validReward, id: `reward-${index}` })) }),
      jsonResponse({ data: [{ ...validReward, title: "" }] }),
      jsonResponse({ data: "not-an-array" })
    ]);
    const client = createClient(fetcher.fetch);
    const request = {
      accessToken: "access-token",
      clientId: "client-id",
      broadcasterId: "broadcaster-1"
    };

    for (let index = 0; index < 4; index += 1) {
      await expect(client.getCustomRewards(request)).rejects.toBeInstanceOf(TwitchApiResponseError);
    }
  });

  it("preserves non-success custom reward response status without exposing the body", async () => {
    const fetcher = createRecordingFetch([
      jsonResponse({ message: "provider body must stay private" }, { status: 403 })
    ]);
    const client = createClient(fetcher.fetch);

    const failure = client.getCustomRewards({
      accessToken: "access-token",
      clientId: "client-id",
      broadcasterId: "broadcaster-1"
    });

    await expect(failure).rejects.toMatchObject({ status: 403 });
    await expect(failure).rejects.toBeInstanceOf(TwitchApiHttpError);
    await expect(failure).rejects.not.toThrow(/provider body must stay private/u);
  });

  it.each([
    [401, null],
    [403, "not JSON"]
  ] as const)("preserves HTTP %s before parsing an invalid custom reward error body", async (status, body) => {
    const fetcher = createRecordingFetch([new Response(body, { status })]);
    const client = createClient(fetcher.fetch);

    const failure = client.getCustomRewards({
      accessToken: "access-token",
      clientId: "client-id",
      broadcasterId: "broadcaster-1"
    });

    await expect(failure).rejects.toBeInstanceOf(TwitchApiHttpError);
    await expect(failure).rejects.toMatchObject({ status });
  });

  it("normalizes rejected custom reward fetches without retaining transport details", async () => {
    const client = createClient(async () => {
      throw new Error("network failure containing access-token-secret-value");
    });

    const failure = client.getCustomRewards({
      accessToken: "access-token",
      clientId: "client-id",
      broadcasterId: "broadcaster-1"
    });

    await expect(failure).rejects.toMatchObject({
      code: "TWITCH_API_REQUEST_FAILED",
      message: "Twitch API request failed"
    });
    await expect(failure).rejects.not.toThrow(/access-token-secret-value/u);
  });
});

function createClient(fetcher: typeof fetch): DefaultTwitchApiClient {
  return new DefaultTwitchApiClient({
    fetch: fetcher
  });
}

function createRecordingFetch(responses: Response[]): {
  readonly fetch: typeof fetch;
  readonly requests: { readonly url: string; readonly init: RequestInit }[];
} {
  const requests: { url: string; init: RequestInit }[] = [];
  return {
    requests,
    async fetch(input, init = {}) {
      requests.push({
        url: String(input),
        init
      });
      const response = responses.shift();
      if (response === undefined) {
        throw new Error("No mock response queued");
      }

      return response;
    }
  };
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: {
      "content-type": "application/json"
    }
  });
}
