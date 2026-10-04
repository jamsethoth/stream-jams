import { randomBytes, randomUUID } from "node:crypto";
import * as http from "node:http";
import * as https from "node:https";
import type { PearConfiguration, SecretRef } from "@stream-jams/core";
import { buildPearAuthUrl, parsePearConfiguration, resolvePearDestination } from "./pear-config.js";

const lifetimeMs = 60_000;
const maxAttempts = 32;
const identityRef: SecretRef = { namespace: "music", accountId: "pear-desktop", name: "client-id" };
type PairingStatus = "pending" | "approved" | "denied" | "expired" | "cancelled";
export interface MusicPairingAttemptView { readonly attemptId: string; readonly status: PairingStatus; readonly expiresAt: string; }
export interface PearApprovalResponse { readonly status: number; readonly body: unknown; }
export interface PearPairingClaim {
  readonly token: string;
  readonly clientId: string;
  assertActive(): void;
  release(): void;
  complete(): void;
}
export interface PearPairingServiceOptions {
  readonly identityStore: Pick<{ getSecret(ref: SecretRef): Promise<string | null>; setSecret(ref: SecretRef, value: string): Promise<void> }, "getSecret" | "setSecret">;
  readonly requestApproval?: (url: URL, signal: AbortSignal) => Promise<PearApprovalResponse>;
  readonly now?: () => number;
  readonly generateId?: () => string;
  readonly generateClientId?: () => string;
}
interface Attempt {
  readonly id: string;
  readonly config: PearConfiguration;
  readonly clientId: string;
  readonly expiresAt: number;
  readonly abort: AbortController;
  readonly timer: ReturnType<typeof setTimeout>;
  status: PairingStatus;
  token: string | null;
  claimed: boolean;
  claimVersion: number;
}

export class PearPairingService {
  readonly #options: PearPairingServiceOptions;
  readonly #attempts = new Map<string, Attempt>();
  readonly #now: () => number;
  readonly #requestApproval: (url: URL, signal: AbortSignal) => Promise<PearApprovalResponse>;
  #identityPromise: Promise<string> | null = null;
  #identityEpoch = 0;
  #identityChanging = false;
  #pendingBegins = 0;

  constructor(options: PearPairingServiceOptions) {
    this.#options = options;
    this.#now = options.now ?? Date.now;
    this.#requestApproval = options.requestApproval ?? requestPearApproval;
  }

  async begin(input: PearConfiguration): Promise<MusicPairingAttemptView> {
    if (this.#identityChanging) throw new Error("Pear pairing identity is changing");
    const identityEpoch = this.#identityEpoch;
    const config = parsePearConfiguration(input);
    this.#makeRoom();
    this.#pendingBegins += 1;
    let clientId: string;
    try { clientId = await this.#stableClientId(); }
    finally { this.#pendingBegins -= 1; }
    if (this.#identityChanging || identityEpoch !== this.#identityEpoch) throw new Error("Pear pairing identity changed; begin pairing again");
    const id = this.#options.generateId?.() ?? `pair_${randomBytes(24).toString("base64url")}`;
    const abort = new AbortController();
    const expiresAt = this.#now() + lifetimeMs;
    const timer = setTimeout(() => this.#expire(id), lifetimeMs);
    timer.unref?.();
    const attempt: Attempt = { id, config, clientId, expiresAt, abort, timer, status: "pending", token: null, claimed: false, claimVersion: 0 };
    this.#attempts.set(id, attempt);
    void this.#requestApproval(buildPearAuthUrl(config, clientId), abort.signal).then((response) => {
      if (attempt.status !== "pending") return;
      if (response.status === 200 && isApprovalBody(response.body)) {
        attempt.token = response.body.accessToken;
        attempt.status = "approved";
      } else {
        attempt.status = "denied";
      }
    }).catch(() => {
      if (attempt.status === "pending") attempt.status = "denied";
    });
    return this.#view(attempt);
  }

  get(attemptId: string): MusicPairingAttemptView {
    const attempt = this.#require(attemptId);
    if (this.#now() >= attempt.expiresAt) this.#expire(attemptId);
    return this.#view(attempt);
  }

  reserve(attemptId: string, input: PearConfiguration): PearPairingClaim {
    const config = parsePearConfiguration(input);
    const attempt = this.#require(attemptId);
    if (this.#now() >= attempt.expiresAt) this.#expire(attemptId);
    if (attempt.status !== "approved" || attempt.token === null || attempt.claimed || JSON.stringify(attempt.config) !== JSON.stringify(config)) {
      throw new Error("Pear pairing attempt is unavailable or does not match this configuration");
    }
    attempt.claimed = true;
    const claimVersion = ++attempt.claimVersion;
    const token = attempt.token;
    const assertActive = (): void => {
      if (this.#now() >= attempt.expiresAt) this.#expire(attemptId);
      if (attempt.status !== "approved" || !attempt.claimed || attempt.claimVersion !== claimVersion || attempt.token !== token) {
        throw new Error("Pear pairing attempt is no longer approved");
      }
    };
    return {
      token, clientId: attempt.clientId, assertActive,
      release: () => { if (attempt.status === "approved" && attempt.claimVersion === claimVersion) attempt.claimed = false; },
      complete: () => { assertActive(); this.#end(attempt, "cancelled"); }
    };
  }

  async cancel(attemptId: string): Promise<void> { this.#end(this.#require(attemptId), "cancelled"); }
  async dispose(): Promise<void> {
    for (const attempt of this.#attempts.values()) this.#end(attempt, "cancelled");
    this.#attempts.clear();
  }

  /** Drop cached identity and pending approvals after restore changes the local client ID. */
  async invalidateIdentity(): Promise<void> {
    await this.changeIdentity(async () => {});
  }

  /** Serialize identity replacement with any in-flight initial keyring read/write. */
  async changeIdentity(update: () => Promise<void>): Promise<void> {
    if (this.#identityChanging) throw new Error("Pear pairing identity is already changing");
    this.#identityChanging = true;
    ++this.#identityEpoch;
    await this.dispose();
    try {
      await this.#identityPromise?.catch(() => {});
      await update();
    } finally {
      this.#identityPromise = null;
      this.#identityChanging = false;
    }
  }

  #expire(id: string): void {
    const attempt = this.#attempts.get(id);
    if (attempt !== undefined && (attempt.status === "pending" || attempt.status === "approved")) this.#end(attempt, "expired");
  }
  #end(attempt: Attempt, status: PairingStatus): void {
    clearTimeout(attempt.timer);
    attempt.abort.abort();
    attempt.token = null;
    attempt.claimed = false;
    attempt.status = status;
  }
  #require(id: string): Attempt {
    const attempt = this.#attempts.get(id);
    if (attempt === undefined) throw new Error("Pear pairing attempt was not found");
    return attempt;
  }
  #view(attempt: Attempt): MusicPairingAttemptView {
    return { attemptId: attempt.id, status: attempt.status, expiresAt: new Date(attempt.expiresAt).toISOString() };
  }
  async #stableClientId(): Promise<string> {
    this.#identityPromise ??= this.#loadClientId();
    try { return await this.#identityPromise; }
    catch (error) { this.#identityPromise = null; throw error; }
  }
  async #loadClientId(): Promise<string> {
    const existing = await this.#options.identityStore.getSecret(identityRef);
    if (existing !== null) return existing;
    const created = this.#options.generateClientId?.() ?? randomUUID();
    await this.#options.identityStore.setSecret(identityRef, created);
    return created;
  }
  #makeRoom(): void {
    for (const [id, attempt] of this.#attempts) {
      if (this.#now() >= attempt.expiresAt) this.#expire(id);
      if (attempt.status !== "pending" && attempt.status !== "approved") this.#attempts.delete(id);
    }
    if (this.#attempts.size + this.#pendingBegins >= maxAttempts) throw new Error("Too many active Pear pairing attempts");
  }
}

function isApprovalBody(value: unknown): value is { accessToken: string } {
  return typeof value === "object" && value !== null && "accessToken" in value
    && typeof value.accessToken === "string" && value.accessToken.length > 0 && value.accessToken.length <= 4096;
}

async function requestPearApproval(url: URL, signal: AbortSignal): Promise<PearApprovalResponse> {
  const destination = await resolvePearDestination(url);
  return new Promise((resolve, reject) => {
    const request = (url.protocol === "https:" ? https : http).request({
      protocol: url.protocol,
      hostname: destination,
      port: url.port,
      path: url.pathname,
      method: "POST",
      headers: { host: url.host },
      ...(url.protocol === "https:" ? { servername: url.hostname.replace(/^\[|\]$/g, "") } : {}),
      signal
    }, (response) => {
      const chunks: Buffer[] = [];
      let size = 0;
      response.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > 8192) { request.destroy(new Error("Pear approval response is too large")); return; }
        chunks.push(chunk);
      });
      response.on("end", () => {
        let body: unknown = null;
        try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown; }
        catch { /* A denial may have no JSON body. */ }
        resolve({ status: response.statusCode ?? 0, body });
      });
    });
    request.on("error", reject);
    request.end();
  });
}
