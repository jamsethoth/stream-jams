import { describe, expect, it } from "vitest";
import { DefaultTwitchApiClient, TwitchApiResponseError } from "./twitch-api-client.js";

describe("DefaultTwitchApiClient", () => {
  it("exchanges authorization codes and refresh tokens with form-encoded token requests", async () => {
    const fetcher = createRecordingFetch([
      jsonResponse({
        access_token: "access-token-1",
        refresh_token: "refresh-token-1",
        expires_in: 14_400,
        scope: ["bits:read"],
        token_type: "bearer"
      }),
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
      client.exchangeAuthorizationCode({
        clientId: "client-id",
        clientSecret: "client-secret",
        code: "oauth-code",
        redirectUri: "http://127.0.0.1:39187/twitch/auth/callback"
      })
    ).resolves.toMatchObject({
      accessToken: "access-token-1",
      refreshToken: "refresh-token-1",
      scopes: ["bits:read"]
    });
    await expect(
      client.refreshUserToken({
        clientId: "client-id",
        clientSecret: "client-secret",
        refreshToken: "refresh-token-1"
      })
    ).resolves.toMatchObject({
      accessToken: "access-token-2",
      refreshToken: "refresh-token-2",
      scopes: ["channel:read:subscriptions"]
    });

    expect(fetcher.requests.map((request) => request.url)).toEqual([
      "https://id.twitch.tv/oauth2/token",
      "https://id.twitch.tv/oauth2/token"
    ]);
    expect(String(fetcher.requests[0]?.init.body)).toBe(
      "client_id=client-id&client_secret=client-secret&code=oauth-code&grant_type=authorization_code&redirect_uri=http%3A%2F%2F127.0.0.1%3A39187%2Ftwitch%2Fauth%2Fcallback"
    );
    expect(String(fetcher.requests[1]?.init.body)).toBe(
      "client_id=client-id&client_secret=client-secret&grant_type=refresh_token&refresh_token=refresh-token-1"
    );
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

  it("rejects malformed Twitch responses without exposing token values", async () => {
    const fetcher = createRecordingFetch([
      jsonResponse({
        access_token: "access-token",
        refresh_token: "refresh-token",
        token_type: "bearer"
      })
    ]);
    const client = createClient(fetcher.fetch);

    await expect(
      client.exchangeAuthorizationCode({
        clientId: "client-id",
        clientSecret: "client-secret",
        code: "oauth-code",
        redirectUri: "http://127.0.0.1:39187/twitch/auth/callback"
      })
    ).rejects.toBeInstanceOf(TwitchApiResponseError);
    await expect(
      client.exchangeAuthorizationCode({
        clientId: "client-id",
        clientSecret: "client-secret",
        code: "oauth-code",
        redirectUri: "http://127.0.0.1:39187/twitch/auth/callback"
      })
    ).rejects.not.toThrow(/access-token|refresh-token/);
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
