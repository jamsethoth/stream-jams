import type { MusicRuntimeSourceAdapter, MusicArtworkCapability } from "./music-source-adapter.js";
import { isPearProtocolSocketError } from "./pear-socket-error.js";
import { NamedError } from "@stream-jams/core";
import { pearArtworkPolicy, type MusicArtworkPolicy, type PrivateArtworkDescriptor } from "./music-artwork-policy.js";
import { randomUUID } from "node:crypto";
import * as http from "node:http";
import * as https from "node:https";
import { isIP } from "node:net";
import WebSocket, { type RawData } from "ws";
import { musicSnapshotSchema, musicStatusSchema, type MusicConnectionTestResult, type MusicSnapshot, type MusicStatus, type PearConfiguration, type ProviderValidationResult } from "@stream-jams/core";
import { parsePearConfiguration, resolvePearDestination } from "./pear-config.js";
import { extractPearArtworkDescriptor, normalizePearObservation } from "./pear-normalization.js";

const requestTimeoutMs = 5_000;
const pollIntervalMs = 3_000;
const reconciliationIntervalMs = 15_000;
const staleAfterMs = 45_000;
const maxFrameBytes = 256 * 1024;
const retryDelaysMs = [1_000, 2_000, 5_000] as const;
const capabilities = { artwork: true, position: true, duration: true, sessionSelection: false } as const;

export class PearAuthenticationError extends NamedError { constructor() { super("PearAuthenticationError", "Pear authorization is required"); } }
export class PearTransportUnavailableError extends NamedError {
  constructor(readonly retryAfterMs: number | null = null, readonly webSocketUnavailable = false) { super("PearTransportUnavailableError", "Pear transport is unavailable"); }
}
export class PearProtocolError extends NamedError { constructor() { super("PearProtocolError", "Pear returned invalid player data"); } }

export interface PearMusicSourceOptions {
  readonly config: PearConfiguration;
  /** Server-only credential. Never put it in status or diagnostic output. */
  readonly token: string;
  readonly providerId: string;
  readonly generation: string;
  readonly now?: () => number;
  readonly jitter?: () => number;
}

interface SongResponse { readonly observation: unknown; }
interface OpenSocket { readonly socket: WebSocket; readonly closed: Promise<never>; }

export class PearMusicSource implements MusicRuntimeSourceAdapter {
  readonly artwork: MusicArtworkCapability = {
    getArtworkPolicy: () => this.getArtworkPolicy(),
    getArtworkDescriptor: (ref, owner) => this.getArtworkDescriptor(ref, owner)
  };
  readonly #options: PearMusicSourceOptions;
  readonly #config: PearConfiguration;
  readonly #now: () => number;
  #snapshot: MusicSnapshot | null = null;
  #status: MusicStatus = { state: "disconnected", stale: false, diagnosticReference: null };
  #revision = 0;
  #songRevision = 0;
  #transportEpoch = 0;
  #run: Promise<void> | null = null;
  #controller: AbortController | null = null;
  #socket: WebSocket | null = null;
  #requestInFlight: Promise<SongResponse> | null = null;
  #staleTimer: ReturnType<typeof setTimeout> | null = null;
  #artwork = new Map<string, PrivateArtworkDescriptor>();
  #onSnapshot: ((snapshot: MusicSnapshot) => void) | null = null;
  #onStatus: ((status: MusicStatus) => void) | null = null;

  constructor(options: PearMusicSourceOptions) {
    this.#options = options;
    this.#config = parsePearConfiguration(options.config);
    if (!options.token || options.token.length > 4096) throw new Error("Invalid Pear credential");
    this.#now = options.now ?? Date.now;
  }

  getArtworkPolicy(): MusicArtworkPolicy { return pearArtworkPolicy; }

  getSnapshot(): MusicSnapshot | null { return this.#snapshot; }

  /** Private descriptor lookup; Task 8 can resolve these refs through the artwork service. */
  getArtworkDescriptor(ref: string, owner: Pick<MusicSnapshot, "providerId" | "generation">): PrivateArtworkDescriptor | null {
    if (owner.providerId !== this.#options.providerId || owner.generation !== this.#options.generation) return null;
    return this.#artwork.get(ref) ?? null;
  }

  async testConnection(signal: AbortSignal): Promise<MusicConnectionTestResult> {
    const combined = AbortSignal.any([signal, AbortSignal.timeout(requestTimeoutMs)]);
    if (this.#config.transport !== "poll") {
      try {
        const opened = await this.#openWs(combined, () => {});
        opened.socket.terminate();
        return { transport: "ws", capabilities };
      } catch (error) {
        if (this.#config.transport === "ws" || !(error instanceof PearTransportUnavailableError) || !error.webSocketUnavailable) throw error;
      }
    }
    const response = await this.#fetchSong(combined);
    normalizePearObservation(response.observation, null, this.#context(1));
    return { transport: "poll", capabilities };
  }

  async start(onSnapshot: (snapshot: MusicSnapshot) => void, onStatus: (status: MusicStatus) => void, signal: AbortSignal): Promise<void> {
    if (this.#run !== null) throw new Error("Pear source is already running");
    if (signal.aborted) throw signal.reason;
    const controller = new AbortController();
    this.#controller = controller;
    const abort = () => controller.abort(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    this.#onSnapshot = onSnapshot; this.#onStatus = onStatus;
    this.#setStatus("connecting", false);
    let firstResolve!: () => void;
    let firstReject!: (error: unknown) => void;
    const first = new Promise<void>((resolve, reject) => { firstResolve = resolve; firstReject = reject; });
    const run = this.#runLoop(controller.signal, firstResolve, firstReject).finally(() => {
      signal.removeEventListener("abort", abort);
      if (this.#run === run) this.#run = null;
    });
    this.#run = run;
    void run.catch(
      // error-provenance: allow cleanup -- run-loop status and first-start promise own the failure
      () => {}
    );
    return first;
  }

  async stop(): Promise<void> {
    const run = this.#run;
    this.#transportEpoch += 1;
    this.#controller?.abort();
    this.#socket?.terminate();
    if (this.#staleTimer !== null) clearTimeout(this.#staleTimer);
    this.#staleTimer = null;
    if (run !== null) await run.catch(
      // error-provenance: allow cleanup -- stop intentionally drains a failing aborted run
      () => {}
    );
    this.#controller = null; this.#socket = null; this.#snapshot = null;
    this.#onSnapshot = null; this.#onStatus = null;
    this.#artwork.clear();
    this.#status = { state: "disconnected", stale: false, diagnosticReference: null };
  }

  async #runLoop(signal: AbortSignal, firstResolve: () => void, firstReject: (error: unknown) => void): Promise<void> {
    let firstPending = true;
    let failureCount = 0;
    let transport: "ws" | "poll" = this.#config.transport === "poll" ? "poll" : "ws";
    let nextWsProbeAt: number | null = null;
    try {
      while (!signal.aborted) {
        const epoch = ++this.#transportEpoch;
        try {
          if (transport === "ws") {
            const opened = await this.#openWs(signal, observation => this.#publish(observation, signal, epoch));
            this.#socket = opened.socket;
            nextWsProbeAt = null;
            this.#setStatus("connected", false);
            failureCount = 0;
            if (firstPending) { firstResolve(); firstPending = false; }
            await this.#reconcileWs(opened, signal, epoch);
          } else {
            await this.#pollOnce(signal, epoch);
            this.#setStatus("connected", false);
            failureCount = 0;
            if (firstPending) { firstResolve(); firstPending = false; }
            await delay(pollIntervalMs, signal);
            if (nextWsProbeAt !== null && this.#now() >= nextWsProbeAt) transport = "ws";
          }
        } catch (error) {
          this.#transportEpoch += 1;
          this.#socket?.terminate(); this.#socket = null;
          if (signal.aborted) break;
          await this.#requestInFlight?.catch(
            // error-provenance: allow cleanup -- original transport error above controls reconnect status
            () => {}
          );
          if (error instanceof PearAuthenticationError) {
            this.#clearLive();
            this.#setStatus("auth-required", false);
            if (firstPending) { firstReject(error); firstPending = false; }
            return;
          }
          if (transport === "ws" && this.#config.transport === "auto" && error instanceof PearTransportUnavailableError
            && (error.webSocketUnavailable || nextWsProbeAt !== null)) {
            transport = "poll";
            nextWsProbeAt = this.#now() + Math.max(reconciliationIntervalMs, error.retryAfterMs ?? 0);
            continue;
          }
          this.#clearLive();
          this.#setStatus("reconnecting", this.#status.stale);
          if (firstPending && !(error instanceof PearTransportUnavailableError)) { firstReject(error); firstPending = false; }
          const retryAfter = error instanceof PearTransportUnavailableError ? error.retryAfterMs : null;
          const base = retryDelaysMs[Math.min(failureCount, retryDelaysMs.length - 1)]!;
          failureCount += 1;
          const jitter = Math.max(0, Math.min(1, this.#options.jitter?.() ?? Math.random()));
          await delay(Math.max(retryAfter ?? 0, Math.min(5_000, Math.round(base * (0.8 + jitter * 0.4)))), signal).catch(
            // error-provenance: allow cleanup -- delay rejects only when cancellation ends this generation
            () => {}
          );
        }
      }
    } finally {
      if (firstPending) firstReject(signal.reason ?? new Error("Pear source stopped"));
      this.#socket?.terminate(); this.#socket = null;
      if (this.#staleTimer !== null) clearTimeout(this.#staleTimer);
      this.#staleTimer = null;
    }
  }

  async #reconcileWs(opened: OpenSocket, signal: AbortSignal, epoch: number): Promise<void> {
    const session = new AbortController();
    const combined = AbortSignal.any([signal, session.signal]);
    try {
      if (this.#snapshot?.track == null) {
        await Promise.race([this.#pollOnce(combined, epoch), opened.closed]);
      }
      while (!combined.aborted) {
        await Promise.race([delay(reconciliationIntervalMs, combined), opened.closed]);
        if (combined.aborted) break;
        await Promise.race([this.#pollOnce(combined, epoch), opened.closed]);
      }
    } finally { session.abort(); opened.socket.terminate(); }
  }

  async #pollOnce(signal: AbortSignal, epoch: number): Promise<void> {
    const songRevision = this.#songRevision;
    this.#requestInFlight ??= this.#fetchSong(signal).finally(() => { this.#requestInFlight = null; });
    const response = await this.#requestInFlight;
    // Newer WS metadata (including an explicit clear) supersedes an in-flight REST observation.
    if (this.#songRevision !== songRevision) return;
    this.#publish(response.observation, signal, epoch);
  }

  #publish(observation: unknown, signal: AbortSignal, epoch: number): void {
    if (signal.aborted || this.#controller?.signal.aborted || epoch !== this.#transportEpoch) return;
    const source = observation as Record<string, unknown>;
    if (Object.hasOwn(source, "song")) this.#songRevision += 1;
    const descriptor = extractPearArtworkDescriptor(source.song);
    let artworkRef: string | null | undefined = source.song !== null && typeof source.song === "object"
      && !Array.isArray(source.song) && Object.hasOwn(source.song, "imageSrc") ? null : undefined;
    if (descriptor !== null) {
      const priorRef = this.#snapshot?.track?.artworkRef;
      const sameTrack = source.song !== null && typeof source.song === "object" && !Array.isArray(source.song)
        && (source.song as Record<string, unknown>).videoId === this.#snapshot?.track?.id;
      if (sameTrack && priorRef && this.#artwork.get(priorRef)?.url === descriptor.url) artworkRef = priorRef;
      else {
        artworkRef = `art_${randomUUID().replaceAll("-", "")}`;
        this.#artwork.set(artworkRef, descriptor);
        if (this.#artwork.size > 32) this.#artwork.delete(this.#artwork.keys().next().value!);
      }
    }
    const snapshot = normalizePearObservation(observation, this.#snapshot, {
      ...this.#context(++this.#revision), ...(artworkRef === undefined ? {} : { artworkRef })
    });
    if (snapshot.track?.artworkRef) {
      for (const ref of this.#artwork.keys()) if (ref !== snapshot.track.artworkRef) this.#artwork.delete(ref);
    } else this.#artwork.clear();
    this.#snapshot = musicSnapshotSchema.parse(snapshot);
    this.#onSnapshot?.(snapshot);
    this.#setStatus("connected", false);
    if (this.#staleTimer !== null) clearTimeout(this.#staleTimer);
    this.#staleTimer = setTimeout(() => {
      if (signal.aborted) return;
      this.#clearLive(); this.#setStatus("reconnecting", true);
    }, staleAfterMs);
    this.#staleTimer.unref?.();
  }

  #context(revision: number) {
    return { providerId: this.#options.providerId, generation: this.#options.generation, revision, observedAtEpochMs: this.#now() };
  }

  #clearLive(): void {
    if (this.#staleTimer !== null) clearTimeout(this.#staleTimer);
    this.#staleTimer = null; this.#snapshot = null; this.#artwork.clear();
  }

  #setStatus(state: MusicStatus["state"], stale: boolean): void {
    const next = musicStatusSchema.parse({ state, stale, diagnosticReference: null });
    if (next.state === this.#status.state && next.stale === this.#status.stale) return;
    this.#status = next; this.#onStatus?.(next);
  }

  async #fetchSong(signal: AbortSignal): Promise<SongResponse> {
    const url = new URL("/api/v1/song", this.#config.baseUrl);
    const destination = await resolvePearDestination(url);
    if (signal.aborted) throw signal.reason;
    const combined = AbortSignal.any([signal, AbortSignal.timeout(requestTimeoutMs)]);
    return new Promise((resolve, reject) => {
      const request = (url.protocol === "https:" ? https : http).request({
        protocol: url.protocol, hostname: destination, port: url.port, path: url.pathname,
        method: "GET", headers: { host: url.host, authorization: `Bearer ${this.#options.token}` },
        ...(url.protocol === "https:" ? { servername: url.hostname.replace(/^\[|\]$/g, "") } : {}), signal: combined
      }, response => {
        const status = response.statusCode ?? 0;
        if (status === 401 || status === 403) { response.resume(); reject(new PearAuthenticationError()); return; }
        if (status === 204) { response.resume(); resolve({ observation: { type: "REST_EMPTY" } }); return; }
        if (status !== 200) {
          response.resume(); reject(new PearTransportUnavailableError(parseRetryAfter(response.headers["retry-after"], this.#now()))); return;
        }
        const chunks: Buffer[] = []; let size = 0;
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxFrameBytes) request.destroy(new PearProtocolError());
          else chunks.push(chunk);
        });
        response.on("end", () => {
          try { resolve({ observation: { type: "REST_SONG", song: JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown } }); }
          // error-provenance: allow expected -- raw Pear JSON errors are converted to a credential-safe protocol error
          catch { reject(new PearProtocolError()); }
        });
      });
      request.on("error", error => reject(signal.aborted ? signal.reason : error));
      request.end();
    });
  }

  async #openWs(signal: AbortSignal, onObservation: (value: unknown) => void): Promise<OpenSocket> {
    const url = new URL("/api/v1/ws", this.#config.baseUrl);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.searchParams.set("token", this.#options.token);
    const destination = await resolvePearDestination(url);
    if (signal.aborted) throw signal.reason;
    const socket = new WebSocket(url, {
      handshakeTimeout: requestTimeoutMs, maxPayload: maxFrameBytes, followRedirects: false,
      lookup: (_host, _options, callback) => callback(null, destination, isIP(destination))
    });
    let closeReject!: (error: unknown) => void;
    const closed = new Promise<never>((_resolve, reject) => { closeReject = reject; });
    void closed.catch(
      // error-provenance: allow cleanup -- the racing socket-close promise is observed by reconciliation
      () => {}
    );
    return new Promise<OpenSocket>((resolve, reject) => {
      let ready = false; let settled = false;
      const firstTimer = setTimeout(() => fail(new PearProtocolError()), requestTimeoutMs);
      const abort = () => fail(signal.reason ?? new Error("Pear source aborted"));
      const cleanup = () => { clearTimeout(firstTimer); signal.removeEventListener("abort", abort); };
      const fail = (error: unknown) => {
        if (!settled) { settled = true; cleanup(); reject(error); }
        closeReject(error); socket.terminate();
      };
      signal.addEventListener("abort", abort, { once: true });
      socket.on("message", (data: RawData, isBinary: boolean) => {
        try {
          if (isBinary) throw new PearProtocolError();
          const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
          if (bytes.length > maxFrameBytes) throw new PearProtocolError();
          const value = JSON.parse(bytes.toString("utf8")) as unknown;
          if (typeof value !== "object" || value === null || Array.isArray(value)) throw new PearProtocolError();
          const event = value as Record<string, unknown>;
          if (!ready) {
            if (event.type !== "PLAYER_INFO") throw new PearProtocolError();
            normalizePearObservation(value, null, this.#context(1));
            ready = true; settled = true; cleanup();
            onObservation(value); resolve({ socket, closed }); return;
          }
          if (["PLAYER_INFO", "VIDEO_CHANGED", "PLAYER_STATE_CHANGED", "POSITION_CHANGED"].includes(String(event.type))) onObservation(value);
        }
        // error-provenance: allow expected -- discard upstream message errors that may contain a token-bearing WebSocket URL
        catch (error) { fail(error instanceof PearProtocolError ? error : new PearProtocolError()); }
      });
      socket.on("unexpected-response", (_request, response) => {
        response.resume();
        const status = response.statusCode ?? 0;
        fail(status === 401 || status === 403 ? new PearAuthenticationError()
          : status >= 300 && status < 400 ? new PearProtocolError()
            : new PearTransportUnavailableError(parseRetryAfter(response.headers["retry-after"], this.#now()), [404, 405, 501, 503].includes(status)));
      });
      socket.on("error", error => {
        fail(isPearProtocolSocketError(error)
          ? new PearProtocolError() : new PearTransportUnavailableError());
      });
      socket.on("close", code => {
        const error = code === 1008 ? new PearAuthenticationError() : new PearTransportUnavailableError();
        if (!settled) { settled = true; cleanup(); reject(error); }
        closeReject(error);
      });
    });
  }
}

function parseRetryAfter(value: string | string[] | undefined, now: number): number | null {
  if (Array.isArray(value) || !value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return seconds >= 0 ? Math.min(Number.MAX_SAFE_INTEGER, seconds * 1_000) : null;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, date - now)) : null;
}

async function delay(ms: number, signal: AbortSignal): Promise<void> {
  let remaining = ms;
  do {
    const chunk = Math.min(remaining, 2_147_483_647);
    await delayChunk(chunk, signal);
    remaining -= chunk;
  } while (remaining > 0);
}

function delayChunk(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return; }
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms);
    timer.unref?.();
    const abort = () => { clearTimeout(timer); reject(signal.reason ?? new Error("Aborted")); };
    signal.addEventListener("abort", abort, { once: true });
  });
}

/** Task 5 registration callback: performs real authenticated validation without publishing playback. */
export async function validatePearMusicConnection(
  config: PearConfiguration, token: string, signal: AbortSignal, now: () => Date = () => new Date()
): Promise<ProviderValidationResult> {
  const source = new PearMusicSource({ config, token, providerId: "pear_validation", generation: "validation" });
  try {
    await source.testConnection(signal);
    return { valid: true, connectionState: "connected", intakeState: null, validatedAt: now().toISOString(), availableVoices: [], error: null };
  } finally { await source.stop(); }
}
