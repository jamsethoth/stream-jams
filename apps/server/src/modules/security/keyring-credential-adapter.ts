import { Entry } from "@napi-rs/keyring";
import type { OsCredentialAdapter } from "./os-secret-store.js";

/** OS credential adapter backed by @napi-rs/keyring for Windows, macOS, and Linux. */
export class KeyringCredentialAdapter implements OsCredentialAdapter {
  async setPassword(service: string, account: string, password: string): Promise<void> {
    new Entry(service, account).setPassword(password);
  }

  async getPassword(service: string, account: string): Promise<string | null> {
    return new Entry(service, account).getPassword();
  }

  async deletePassword(service: string, account: string): Promise<boolean> {
    new Entry(service, account).deletePassword();
    return true;
  }
}
