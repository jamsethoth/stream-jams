import {
  twitchCustomRewardCatalogSchema,
  type TwitchCustomRewardCatalog
} from "@stream-jams/core";

export interface TwitchDeviceAuthorizationRequest {
  readonly clientId: string;
  readonly scopes: readonly string[];
}

export interface TwitchDeviceAuthorization {
  readonly deviceCode: string;
  readonly userCode: string;
  readonly verificationUri: string;
  readonly expiresIn: number;
  readonly interval: number;
}

export interface TwitchDeviceTokenRequest extends TwitchDeviceAuthorizationRequest {
  readonly deviceCode: string;
}

export type TwitchDeviceTokenPollResult =
  | { readonly status: "pending" }
  | { readonly status: "denied" }
  | { readonly status: "expired" }
  | { readonly status: "granted"; readonly grant: TwitchTokenGrant };

export interface TwitchRefreshTokenRequest {
  readonly clientId: string;
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
  startDeviceAuthorization(input: TwitchDeviceAuthorizationRequest): Promise<TwitchDeviceAuthorization>;
  pollDeviceAuthorization(input: TwitchDeviceTokenRequest): Promise<TwitchDeviceTokenPollResult>;
  refreshUserToken(input: TwitchRefreshTokenRequest): Promise<TwitchTokenGrant>;
  validateToken(input: TwitchValidateTokenRequest): Promise<TwitchValidatedToken>;
  getCurrentUser(input: TwitchCurrentUserRequest): Promise<TwitchCurrentUser>;
}

export interface TwitchCustomRewardsRequest {
  readonly accessToken: string;
  readonly clientId: string;
  readonly broadcasterId: string;
}

export interface TwitchRewardApiClient {
  getCustomRewards(input: TwitchCustomRewardsRequest): Promise<TwitchCustomRewardCatalog>;
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

export class DefaultTwitchApiClient implements TwitchApiClient, TwitchRewardApiClient {
  readonly #fetch: typeof fetch;
  readonly #authBaseUrl: string;
  readonly #apiBaseUrl: string;

  constructor(options: TwitchApiClientOptions = {}) {
    this.#fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.#authBaseUrl = options.authBaseUrl ?? "https://id.twitch.tv/oauth2";
    this.#apiBaseUrl = options.apiBaseUrl ?? "https://api.twitch.tv/helix";
  }

  async startDeviceAuthorization(input: TwitchDeviceAuthorizationRequest): Promise<TwitchDeviceAuthorization> {
    const body = await this.#requestJson(this.#authBaseUrl + "/device", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        client_id: input.clientId,
        scopes: input.scopes.join(" ")
      })
    });

    return parseDeviceAuthorization(body);
  }

  async pollDeviceAuthorization(input: TwitchDeviceTokenRequest): Promise<TwitchDeviceTokenPollResult> {
    const response = await this.#fetch(this.#authBaseUrl + "/token", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        client_id: input.clientId,
        scopes: input.scopes.join(" "),
        device_code: input.deviceCode,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code"
      })
    });
    const body = await readJsonResponse(response);

    if (!response.ok) {
      const message = isRecord(body) ? body.message : undefined;
      switch (message) {
        case "authorization_pending":
          return { status: "pending" };
        case "access_denied":
          return { status: "denied" };
        case "invalid device code":
          return { status: "expired" };
        default:
          throw new TwitchApiHttpError(response.status);
      }
    }

    return { status: "granted", grant: parseTokenGrant(body) };
  }

  refreshUserToken(input: TwitchRefreshTokenRequest): Promise<TwitchTokenGrant> {
    return this.#requestToken(
      new URLSearchParams({
        client_id: input.clientId,
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

  async getCustomRewards(input: TwitchCustomRewardsRequest): Promise<TwitchCustomRewardCatalog> {
    const query = new URLSearchParams({ broadcaster_id: input.broadcasterId });
    const body = await this.#requestJson(this.#apiBaseUrl + "/channel_points/custom_rewards?" + query.toString(), {
      headers: {
        authorization: "Bearer " + input.accessToken,
        "client-id": input.clientId
      }
    });

    return parseCustomRewards(body);
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
    const body = await readJsonResponse(response);
    if (!response.ok) {
      throw new TwitchApiHttpError(response.status);
    }

    return body;
  }
}

function parseDeviceAuthorization(body: unknown): TwitchDeviceAuthorization {
  if (!isRecord(body)) {
    throw new TwitchApiResponseError();
  }

  const deviceCode = body.device_code;
  const userCode = body.user_code;
  const verificationUri = body.verification_uri;
  const expiresIn = body.expires_in;
  const interval = body.interval;
  if (
    !isNonEmptyString(deviceCode) ||
    !isNonEmptyString(userCode) ||
    !isNonEmptyString(verificationUri) ||
    !isPositiveInteger(expiresIn) ||
    !isPositiveInteger(interval) ||
    !isTwitchVerificationUri(verificationUri)
  ) {
    throw new TwitchApiResponseError();
  }

  return {
    deviceCode,
    userCode,
    verificationUri,
    expiresIn,
    interval
  };
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

function parseCustomRewards(body: unknown): TwitchCustomRewardCatalog {
  if (!isRecord(body) || !Array.isArray(body.data)) {
    throw new TwitchApiResponseError();
  }

  try {
    return twitchCustomRewardCatalogSchema.parse({
      rewards: body.data.map((reward) => {
        if (!isRecord(reward)) {
          throw new TwitchApiResponseError();
        }

        return {
          id: reward.id,
          title: reward.title,
          prompt: reward.prompt,
          cost: reward.cost,
          backgroundColor: reward.background_color,
          isUserInputRequired: reward.is_user_input_required,
          isEnabled: reward.is_enabled,
          isPaused: reward.is_paused,
          isInStock: reward.is_in_stock
        };
      })
    });
  } catch {
    throw new TwitchApiResponseError();
  }
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

function isPositiveInteger(value: unknown): value is number {
  return isInteger(value) && value > 0;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isTwitchVerificationUri(value: string): boolean {
  try {
    const uri = new URL(value);
    return uri.protocol === "https:" && uri.hostname === "www.twitch.tv";
  } catch {
    return false;
  }
}

async function readJsonResponse(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new TwitchApiResponseError();
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
