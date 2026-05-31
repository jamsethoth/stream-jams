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

export type TwitchConnectionStatus =
  | {
      readonly connected: false;
      readonly account: null;
    }
  | {
      readonly connected: true;
      readonly account: TwitchConnectedAccountView;
    };

export interface TwitchAccountRepository {
  saveAccount(account: TwitchAccount): Promise<TwitchAccount>;
  findConnectedAccount(): Promise<TwitchAccount | null>;
  deleteAccount(accountId: string): Promise<void>;
}

export function toTwitchConnectionStatus(account: TwitchAccount | null): TwitchConnectionStatus {
  return account === null
    ? {
        connected: false,
        account: null
      }
    : {
        connected: true,
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
