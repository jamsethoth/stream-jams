import { randomBytes } from "node:crypto";
import type { SecretRef, SecretStore } from "@stream-jams/core";
import { KeyringCredentialAdapter } from "./keyring-credential-adapter.js";
import { OsSecretStore, type OsCredentialAdapter } from "./os-secret-store.js";

export const runtimeSecretStoreUnavailableMessage =
  "Credential store is unavailable. Configure Windows Credential Manager, macOS Keychain, or Linux Secret Service/libsecret before connecting Twitch.";

export interface RuntimeSecretStoreStatus {
  readonly state: "ready" | "degraded";
  readonly lastErrorAt: string | null;
  readonly message: string | null;
}

export interface RuntimeSecretStoreOptions {
  readonly secretStore?: SecretStore;
  readonly credentials?: OsCredentialAdapter;
  readonly now?: () => Date;
  readonly generateHealthCheckValue?: () => string;
}

export interface RuntimeSecretStoreSelection {
  readonly secretStore: SecretStore;
  readonly status: RuntimeSecretStoreStatus;
  assertAvailable(): void;
}

const healthCheckRef: SecretRef = {
  namespace: "management",
  accountId: "local-runtime",
  name: "credential-store-health-check"
};

export async function createRuntimeSecretStore(
  options: RuntimeSecretStoreOptions = {}
): Promise<RuntimeSecretStoreSelection> {
  const now = options.now ?? (() => new Date());

  if (options.secretStore !== undefined) {
    return {
      secretStore: options.secretStore,
      status: readyStatus(),
      assertAvailable() {
        return undefined;
      }
    };
  }

  const secretStore = new OsSecretStore({
    credentials: options.credentials ?? new KeyringCredentialAdapter()
  });
  const status = await checkSecretStoreAvailability(secretStore, {
    now,
    generateHealthCheckValue: options.generateHealthCheckValue ?? (() => "health_" + randomBytes(16).toString("base64url"))
  });

  if (status.state === "degraded") {
    const fail = (): never => {
      throw new SecretStoreUnavailableError(status.message ?? runtimeSecretStoreUnavailableMessage);
    };
    return {
      secretStore: {
        async setSecret(): Promise<void> {
          return fail();
        },
        async getSecret(): Promise<string | null> {
          return fail();
        },
        async deleteSecret(): Promise<void> {
          return fail();
        }
      },
      status,
      assertAvailable() {
        return fail();
      }
    };
  }

  return {
    secretStore,
    status,
    assertAvailable() {
      return undefined;
    }
  };
}

export class SecretStoreUnavailableError extends Error {
  readonly code = "SECRET_STORE_UNAVAILABLE";

  constructor(message = runtimeSecretStoreUnavailableMessage) {
    super(message);
    this.name = "SecretStoreUnavailableError";
  }
}

async function checkSecretStoreAvailability(
  secretStore: SecretStore,
  options: {
    readonly now: () => Date;
    readonly generateHealthCheckValue: () => string;
  }
): Promise<RuntimeSecretStoreStatus> {
  try {
    const expected = options.generateHealthCheckValue();
    await secretStore.setSecret(healthCheckRef, expected);
    const actual = await secretStore.getSecret(healthCheckRef);
    await secretStore.deleteSecret(healthCheckRef);

    if (actual !== expected) {
      return degradedStatus(options.now);
    }

    return readyStatus();
  } catch {
    return degradedStatus(options.now);
  }
}

function readyStatus(): RuntimeSecretStoreStatus {
  return {
    state: "ready",
    lastErrorAt: null,
    message: null
  };
}

function degradedStatus(now: () => Date): RuntimeSecretStoreStatus {
  return {
    state: "degraded",
    lastErrorAt: now().toISOString(),
    message: runtimeSecretStoreUnavailableMessage
  };
}
