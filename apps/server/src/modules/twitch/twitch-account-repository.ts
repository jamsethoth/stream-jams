export interface TwitchAccount {
  readonly accountId: string;
  readonly login: string;
  readonly displayName: string;
  readonly scopes: readonly string[];
  readonly connectedAt: string;
  readonly updatedAt: string;
}

export interface TwitchConnectedAccountView {
  readonly accountId: string;
  readonly login: string;
  readonly displayName: string;
  readonly scopes: readonly string[];
  readonly connectedAt: string;
  readonly updatedAt: string;
}

export type TwitchAuthorizationState = "disconnected" | "ready" | "update-required";

export type TwitchConnectionStatus =
  | {
      readonly connected: false;
      readonly authorizationState: "disconnected";
      readonly missingScopes: readonly string[];
      readonly account: null;
    }
  | {
      readonly connected: true;
      readonly authorizationState: "ready" | "update-required";
      readonly missingScopes: readonly string[];
      readonly account: TwitchConnectedAccountView;
    };

export interface TwitchAccountRepository {
  saveAccount(account: TwitchAccount): Promise<TwitchAccount>;
  findConnectedAccount(): Promise<TwitchAccount | null>;
  deleteAccount(accountId: string): Promise<void>;
}

export function toTwitchConnectionStatus(
  account: TwitchAccount | null,
  missingScopes: readonly string[] = []
): TwitchConnectionStatus {
  return account === null
    ? {
        connected: false,
        authorizationState: "disconnected",
        missingScopes: [],
        account: null
      }
    : {
        connected: true,
        authorizationState: missingScopes.length === 0 ? "ready" : "update-required",
        missingScopes,
        account: {
          accountId: account.accountId,
          login: account.login,
          displayName: account.displayName,
          scopes: account.scopes,
          connectedAt: account.connectedAt,
          updatedAt: account.updatedAt
        }
      };
}
