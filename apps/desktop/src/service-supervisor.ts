import { randomUUID } from "node:crypto";
import { workerMessageSchema, type WorkerRequest } from "./desktop-ipc.js";
import { overlayPlaybackFailureSchema, type AudioTransportCommand, type AudioTransportResult, type DesktopVisualCommand, type DesktopVisualReply, type OverlayPlaybackFailure, type SerializedException } from "@stream-jams/core";
import type { DesktopDiagnosticInput, DesktopDiagnosticReport } from "./desktop-diagnostics.js";

export interface SupervisedOverlayHost {
  beginOwnership(): void;
  refreshLease(): void;
  serviceLost(): void;
  handle(command: DesktopVisualCommand): Promise<DesktopVisualReply>;
}

export interface SupervisedAudioHost {
  beginOwnership(): void;
  refreshLease(): void;
  serviceLost(): void;
  handle(command: AudioTransportCommand): Promise<AudioTransportResult>;
}

export interface ServiceWorker {
  postMessage(message: Record<string, unknown>): void;
  kill(): boolean;
  on(event: "message", listener: (message: unknown) => void): unknown;
  on(event: "exit", listener: (code: number) => void): unknown;
}
export interface ServiceSnapshot { readonly url: string; readonly closeToTray: boolean; readonly muted: boolean }
export type ServiceState = "starting" | "running" | "stopping" | "stopped" | "failed";

/** Owns exactly the worker it creates. Never discovers or kills a port's owner. */
export class ServiceSupervisor {
  state: ServiceState = "stopped";
  snapshot: ServiceSnapshot | null = null;
  error: string | null = null;
  #worker: ServiceWorker | null = null;
  #generation = 0;
  #startPromise: Promise<ServiceSnapshot> | null = null;
  #startResolve: ((snapshot: ServiceSnapshot) => void) | null = null;
  #startReject: ((error: Error) => void) | null = null;
  #startId: string | null = null;
  #startTimer: ReturnType<typeof setTimeout> | undefined;
  #stopPromise: Promise<void> | null = null;
  #stopResolve: (() => void) | null = null;
  #stopReject: ((error: Error) => void) | null = null;
  #stopTimer: ReturnType<typeof setTimeout> | undefined;
  #stopError: Error | null = null;
  #commands = new Map<string, { resolve(): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>();
  #diagnostics = new Map<string, { report: DesktopDiagnosticReport; timer: ReturnType<typeof setTimeout> }>();

  constructor(private readonly spawn: () => ServiceWorker, private readonly changed: () => void = () => {}, private readonly audio?: SupervisedAudioHost, private readonly overlay?: SupervisedOverlayHost, private readonly diagnose?: (input: DesktopDiagnosticInput) => void, private readonly diagnosticFallback?: (report: DesktopDiagnosticReport) => void) {}

  start(): Promise<ServiceSnapshot> {
    if (this.state === "starting" || this.state === "running") return this.#startPromise!;
    if (this.#worker !== null || this.state === "stopping") return Promise.reject(new Error("Wait for the previous service to stop before retrying."));
    this.state = "starting";
    this.error = null;
    this.#stopPromise = null;
    this.#stopError = null;
    this.#generation += 1;
    const generation = this.#generation;
    this.#startId = randomUUID();
    this.#startPromise = new Promise((resolve, reject) => { this.#startResolve = resolve; this.#startReject = reject; });
    try {
      const worker = this.spawn();
      this.#worker = worker;
      this.audio?.beginOwnership();
      this.overlay?.beginOwnership();
      worker.on("message", (message) => { if (this.#worker === worker) this.#receive(message, generation); });
      worker.on("exit", (code) => { if (this.#worker === worker) this.#exited(code); });
      this.#startTimer = setTimeout(() => this.#fail("The local service did not start within 20 seconds. Retry or quit."), 20_000);
      this.#send({ type: "start", generation, requestId: this.#startId });
    } catch (error) { this.#fail("The local service process could not be started. Retry or quit.", error); }
    this.changed();
    return this.#startPromise;
  }

  setMuted(muted: boolean): Promise<void> {
    if (this.state !== "running") return Promise.reject(new Error("The local service is not running."));
    const requestId = randomUUID();
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#commands.delete(requestId);
        const error = new Error("Mute state could not be confirmed. Check the operator controls.");
        this.#record("desktop.worker.command-timeout", error.message, error);
        reject(error);
      }, 10_000);
      this.#commands.set(requestId, { resolve, reject, timer });
      try { this.#send({ type: "set-muted", generation: this.#generation, requestId, muted }); }
      catch (error) {
        this.#record("desktop.worker.send-failed", "The local service connection was lost while changing mute state.", error);
        this.#finishCommand(requestId, new Error("The local service connection was lost.", { cause: error }));
      }
    });
  }

  stop(): Promise<void> {
    if (this.#stopPromise !== null) return this.#stopPromise;
    if (this.#worker === null) return Promise.resolve();
    this.state = "stopping";
    this.overlay?.serviceLost();
    clearTimeout(this.#startTimer);
    this.#startReject?.(new Error("Startup was cancelled by shutdown."));
    this.#startReject = null;
    this.#stopPromise = new Promise<void>((resolve, reject) => { this.#stopResolve = resolve; this.#stopReject = reject; });
    this.#stopTimer = setTimeout(() => {
      this.#stopError = new Error("The service did not stop within 10 seconds. Its owned process was terminated.");
      this.error = this.#stopError.message;
      this.#record("desktop.worker.stop-timeout", this.#stopError.message, this.#stopError);
      this.#worker?.kill();
      // An unsuccessful kill must not leave the shutdown caller waiting forever.
      this.#stopReject?.(this.#stopError);
      this.changed();
    }, 10_000);
    try { this.#send({ type: "stop", generation: this.#generation, requestId: randomUUID() }); }
    catch (error) {
      this.#record("desktop.worker.send-failed", "The local service connection was lost during shutdown.", error);
      this.#worker?.kill();
    }
    this.changed();
    return this.#stopPromise;
  }

  #send(message: WorkerRequest): void { this.#worker?.postMessage(message); }

  recordDiagnostic(report: DesktopDiagnosticReport): boolean {
    if (this.#worker === null || (this.state !== "starting" && this.state !== "running")) return false;
    const requestId = randomUUID();
    const timer = setTimeout(() => this.#finishDiagnostic(requestId, false), 5_000);
    this.#diagnostics.set(requestId, { report, timer });
    try {
      this.#send({ type: "record-diagnostic", generation: this.#generation, requestId, report });
      return true;
    }
    // error-provenance: allow expected -- failure is intentionally converted to the bounded fallback at this boundary
    catch {
      this.#diagnostics.delete(requestId);
      clearTimeout(timer);
      return false;
    }
  }

  #receive(candidate: unknown, generation: number): void {
    if (typeof candidate !== "object" || candidate === null || !("generation" in candidate) || candidate.generation !== generation) return;
    const parsed = workerMessageSchema.safeParse(candidate);
    if (!parsed.success) {
      const message = "The service sent an invalid desktop message. Retry or quit.";
      this.#fail(message, new Error(message, { cause: parsed.error }));
      return;
    }
    const message = parsed.data;
    if (message.type === "overlay-lease") {
      if (this.state === "running" || this.state === "starting") this.overlay?.refreshLease();
      return;
    }
    if (message.type === "overlay-request") {
      const worker = this.#worker;
      const permitted = this.state === "running" || this.state === "starting" ||
        (this.state === "stopping" && ["stop", "close"].includes(message.command.type));
      const result = permitted && this.overlay !== undefined ? this.overlay.handle(message.command) : Promise.reject(new Error("Overlay unavailable"));
      void result.then(reply => ({ result: reply })).catch((error: unknown) => {
        const failure = findOverlayFailure(error);
        this.#record(
          "desktop.overlay.command-failed",
          failure?.message ?? "The desktop overlay command failed.",
          failure?.exception ?? error,
          failure?.referenceId
        );
        return { result: null, ...(failure === undefined ? {} : { failure }) };
      }).then(reply => {
        if (worker !== null && this.#worker === worker && generation === this.#generation) {
          try { this.#send({ type: "overlay-response", generation, requestId: message.requestId, ...reply }); }
          catch (error) { this.#fail("The local overlay connection was lost. Retry or quit.", error); }
        }
      });
      return;
    }
    if (message.type === "audio-lease") {
      if (this.state === "running" || this.state === "starting") this.audio?.refreshLease();
      return;
    }
    if (message.type === "audio-request") {
      const worker = this.#worker;
      const permitted = this.state === "running" || this.state === "starting" ||
        (this.state === "stopping" && ["stop", "close", "set-muted"].includes(message.command.type));
      const result = permitted && this.audio !== undefined ? this.audio.handle(message.command) : Promise.reject(new Error("Audio unavailable"));
      void result.catch((error: unknown) => {
        this.#record("desktop.audio.command-failed", "The desktop audio command failed.", error);
        return null;
      }).then(reply => {
        if (worker !== null && this.#worker === worker && generation === this.#generation) {
          try { this.#send({ type: "audio-response", generation, requestId: message.requestId, result: reply }); }
          catch (error) { this.#fail("The local audio connection was lost. Retry or quit.", error); }
        }
      });
      return;
    }
    if (message.type === "playback-state-changed" && message.requestId !== null && !this.#commands.has(message.requestId)) return;
    if (message.type === "desktop-config-changed" && message.requestId !== null) return;
    if (message.type === "failed" && message.requestId !== null && message.requestId !== this.#startId) return;
    if (message.type === "ready") {
      if (this.state !== "starting" || message.requestId !== this.#startId) return;
      clearTimeout(this.#startTimer);
      this.state = "running";
      this.snapshot = { url: message.url, closeToTray: message.closeToTray, muted: message.muted };
      this.#startResolve?.(this.snapshot);
      this.#startReject = null;
    } else if (message.type === "diagnostic-recorded") {
      this.#finishDiagnostic(message.requestId, true);
    } else if (message.type === "failed") {
      const error = remoteWorkerError(message.message, message.referenceId, message.exception);
      this.#fail(message.message, error, message.referenceId);
    } else if (message.type === "command-failed") {
      if (message.requestId !== null && this.#diagnostics.has(message.requestId)) {
        this.#finishDiagnostic(message.requestId, false);
        return;
      }
      const error = remoteWorkerError(message.message, message.referenceId, message.exception);
      this.#record("desktop.worker.command-failed", message.message, error, message.referenceId);
      if (message.requestId !== null) this.#finishCommand(message.requestId, error);
    } else if (this.state === "running" && this.snapshot !== null) {
      if (message.type === "desktop-config-changed") this.snapshot = { ...this.snapshot, closeToTray: message.closeToTray };
      if (message.type === "playback-state-changed") {
        this.snapshot = { ...this.snapshot, muted: message.muted };
        if (message.requestId !== null) this.#finishCommand(message.requestId);
      }
    }
    // A stopped acknowledgement is not proof of process exit; wait for exit.
    this.changed();
  }

  #finishCommand(id: string, error?: Error): void {
    const command = this.#commands.get(id);
    if (command === undefined) return;
    this.#commands.delete(id);
    clearTimeout(command.timer);
    if (error === undefined) command.resolve(); else command.reject(error);
  }

  #fail(message: string, exception?: unknown, referenceId?: string): void {
    this.overlay?.serviceLost();
    this.audio?.serviceLost();
    clearTimeout(this.#startTimer);
    this.state = "failed";
    this.error = message;
    this.snapshot = null;
    const error = exception instanceof Error ? exception : new Error(message, exception === undefined ? undefined : { cause: exception });
    this.#record("desktop.worker.failed", message, error, referenceId);
    this.#startReject?.(error);
    this.#startReject = null;
    this.#worker?.kill();
    this.changed();
  }

  #exited(code: number): void {
    this.overlay?.serviceLost();
    this.audio?.serviceLost();
    this.#worker = null;
    clearTimeout(this.#startTimer);
    clearTimeout(this.#stopTimer);
    for (const id of this.#commands.keys()) this.#finishCommand(id, new Error("The local service stopped."));
    for (const id of this.#diagnostics.keys()) this.#finishDiagnostic(id, false);
    this.snapshot = null;
    if (this.state !== "stopping" || code !== 0) {
      this.#record("desktop.worker.exit", "The local service worker exited.", undefined, undefined, "exited", code);
    }
    if (this.state === "stopping") {
      this.state = "stopped";
      if (this.#stopError !== null) this.#stopReject?.(this.#stopError); else if (code !== 0) this.#stopReject?.(new Error("The local service exited abnormally.")); else this.#stopResolve?.();
    } else if (this.state !== "failed") {
      this.#fail("The local service exited unexpectedly. Retry or quit.");
    }
    this.changed();
  }

  #record(source: string, message: string, exception?: unknown, referenceId?: string, reason: string | null = null, exitCode: number | null = null): void {
    this.diagnose?.({ component: "service-worker", source, message, ...(exception === undefined ? {} : { exception }), ...(referenceId === undefined ? {} : { referenceId }), reason, exitCode });
  }

  #finishDiagnostic(id: string, delivered: boolean): void {
    const pending = this.#diagnostics.get(id);
    if (pending === undefined) return;
    this.#diagnostics.delete(id);
    clearTimeout(pending.timer);
    if (!delivered) this.diagnosticFallback?.(pending.report);
  }
}

function remoteWorkerError(message: string, referenceId: string, exception: SerializedException): Error {
  const error = new Error(message, { cause: exception });
  error.name = "ServiceWorkerError";
  Object.defineProperty(error, "referenceId", { value: referenceId, enumerable: true });
  return error;
}

function findOverlayFailure(value: unknown): OverlayPlaybackFailure | undefined {
  const seen = new Set<unknown>();
  let candidate: unknown = value;
  while (candidate !== null && candidate !== undefined && !seen.has(candidate)) {
    seen.add(candidate);
    const parsed = overlayPlaybackFailureSchema.safeParse(candidate);
    if (parsed.success) return parsed.data;
    candidate = typeof candidate === "object" && "cause" in candidate ? candidate.cause : undefined;
  }
  return undefined;
}
