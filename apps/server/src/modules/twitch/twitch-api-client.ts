export interface TwitchTokenRequest {
  readonly clientId: string;
  readonly clientSecret: string;
}

export interface TwitchAuthorizationCodeRequest extends TwitchTokenRequest {
  readonly code: string;
  readonly redirectUri: string;
}

export interface TwitchRefreshTokenRequest extends TwitchTokenRequest {
  readonly refreshToken: string;
}

export interface TwitchTokenGrant {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresIn: number;
  readonly scopes: readonly string[];
  readonly tokenType: "bearer";
}

export interface TwitchValidateTokenRequest {
  readonly accessToken: string;
}

export interface TwitchValidatedToken {
  readonly clientId: string;
  readonly login: string;
  readonly scopes: readonly string[];
  readonly userId: string;
  readonly expiresIn: number;
}

export interface TwitchCurrentUserRequest {
  readonly accessToken: string;
  readonly clientId: string;
}

export interface TwitchCurrentUser {
  readonly id: string;
  readonly login: string;
  readonly displayName: string;
}

export interface TwitchApiClient {
  exchangeAuthorizationCode(input: TwitchAuthorizationCodeRequest): Promise<TwitchTokenGrant>;
  refreshUserToken(input: TwitchRefreshTokenRequest): Promise<TwitchTokenGrant>;
  validateToken(input: TwitchValidateTokenRequest): Promise<TwitchValidatedToken>;
  getCurrentUser(input: TwitchCurrentUserRequest): Promise<TwitchCurrentUser>;
}

export interface TwitchApiClientOptions {
  readonly fetch?: typeof fetch | undefined;
  readonly authBaseUrl?: string | undefined;
  readonly apiBaseUrl?: string | undefined;
}

export class TwitchApiHttpError extends Error {
  readonly code = "TWITCH_API_REQUEST_FAILED";

  constructor(readonly status: number) {
    super("Twitch API request failed");
    this.name = "TwitchApiHttpError";
  }
}

export class TwitchApiResponseError extends Error {
  readonly code = "TWITCH_API_RESPONSE_INVALID";

  constructor() {
    super("Twitch API response was invalid");
    this.name = "TwitchApiResponseError";
  }
}

export class DefaultTwitchApiClient implements TwitchApiClient {
  readonly #fetch: typeof fetch;
  readonly #authBaseUrl: string;
  readonly #apiBaseUrl: string;

  constructor(options: TwitchApiClientOptions = {}) {
    this.#fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.#authBaseUrl = options.authBaseUrl ?? "https://id.twitch.tv/oauth2";
    this.#apiBaseUrl = options.apiBaseUrl ?? "https://api.twitch.tv/helix";
  }

  exchangeAuthorizationCode(input: TwitchAuthorizationCodeRequest): Promise<TwitchTokenGrant> {
    return this.#requestToken(
      new URLSearchParams({
        client_id: input.clientId,
        client_secret: input.clientSecret,
        code: input.code,
        grant_type: "authorization_code",
        redirect_uri: input.redirectUri
      })
    );
  }

  refreshUserToken(input: TwitchRefreshTokenRequest): Promise<TwitchTokenGrant> {
    return this.#requestToken(
      new URLSearchParams({
        client_id: input.clientId,
        client_secret: input.clientSecret,
        grant_type: "refresh_token",
        refresh_token: input.refreshToken
      })
    );
  }

  async validateToken(input: TwitchValidateTokenRequest): Promise<TwitchValidatedToken> {
    const body = await this.#requestJson(this.#authBaseUrl + "/validate", {
      headers: {
        authorization: "OAuth " + input.accessToken
      }
    });

    return parseValidatedToken(body);
  }

  async getCurrentUser(input: TwitchCurrentUserRequest): Promise<TwitchCurrentUser> {
    const body = await this.#requestJson(this.#apiBaseUrl + "/users", {
      headers: {
        authorization: "Bearer " + input.accessToken,
        "client-id": input.clientId
      }
    });

    return parseCurrentUser(body);
  }

  async #requestToken(body: URLSearchParams): Promise<TwitchTokenGrant> {
    const responseBody = await this.#requestJson(this.#authBaseUrl + "/token", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded"
      },
      body
    });

    return parseTokenGrant(responseBody);
  }

  async #requestJson(url: string, init: RequestInit): Promise<unknown> {
    const response = await this.#fetch(url, init);
    if (!response.ok) {
      throw new TwitchApiHttpError(response.status);
    }

    try {
      return await response.json();
    } catch {
      throw new TwitchApiResponseError();
    }
  }
}

function parseTokenGrant(body: unknown): TwitchTokenGrant {
  if (!isRecord(body)) {
    throw new TwitchApiResponseError();
  }

  const accessToken = body.access_token;
  const refreshToken = body.refresh_token;
  const expiresIn = body.expires_in;
  const scopes = parseScopes(body.scope);
  const tokenType = body.token_type;
  if (
    typeof accessToken !== "string" ||
    typeof refreshToken !== "string" ||
    !isInteger(expiresIn) ||
    scopes === null ||
    tokenType !== "bearer"
  ) {
    throw new TwitchApiResponseError();
  }

  return {
    accessToken,
    refreshToken,
    expiresIn,
    scopes,
    tokenType
  };
}

function parseValidatedToken(body: unknown): TwitchValidatedToken {
  if (!isRecord(body)) {
    throw new TwitchApiResponseError();
  }

  const clientId = body.client_id;
  const login = body.login;
  const scopes = parseScopes(body.scopes);
  const userId = body.user_id;
  const expiresIn = body.expires_in;
  if (
    typeof clientId !== "string" ||
    typeof login !== "string" ||
    scopes === null ||
    typeof userId !== "string" ||
    !isInteger(expiresIn)
  ) {
    throw new TwitchApiResponseError();
  }

  return {
    clientId,
    login,
    scopes,
    userId,
    expiresIn
  };
}

function parseCurrentUser(body: unknown): TwitchCurrentUser {
  if (!isRecord(body) || !Array.isArray(body.data) || body.data.length < 1 || !isRecord(body.data[0])) {
    throw new TwitchApiResponseError();
  }

  const user = body.data[0];
  if (typeof user.id !== "string" || typeof user.login !== "string" || typeof user.display_name !== "string") {
    throw new TwitchApiResponseError();
  }

  return {
    id: user.id,
    login: user.login,
    displayName: user.display_name
  };
}

function parseScopes(value: unknown): readonly string[] | null {
  if (Array.isArray(value) && value.every((scope) => typeof scope === "string")) {
    return value;
  }

  if (typeof value === "string") {
    return value.trim() === "" ? [] : value.split(/\s+/);
  }

  return null;
}

function isInteger(value: unknown): value is number {
  return Number.isInteger(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
