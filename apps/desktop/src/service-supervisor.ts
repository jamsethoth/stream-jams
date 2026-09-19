import { randomUUID } from "node:crypto";
import { workerMessageSchema, type WorkerRequest } from "./desktop-ipc.js";
import type { AudioTransportCommand, AudioTransportResult, DesktopVisualCommand, DesktopVisualReply } from "@stream-jams/core";

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

  constructor(private readonly spawn: () => ServiceWorker, private readonly changed: () => void = () => {}, private readonly audio?: SupervisedAudioHost, private readonly overlay?: SupervisedOverlayHost) {}

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
    } catch { this.#fail("The local service process could not be started. Retry or quit."); }
    this.changed();
    return this.#startPromise;
  }

  setMuted(muted: boolean): Promise<void> {
    if (this.state !== "running") return Promise.reject(new Error("The local service is not running."));
    const requestId = randomUUID();
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#commands.delete(requestId);
        reject(new Error("Mute state could not be confirmed. Check the operator controls."));
      }, 10_000);
      this.#commands.set(requestId, { resolve, reject, timer });
      try { this.#send({ type: "set-muted", generation: this.#generation, requestId, muted }); }
      catch { this.#finishCommand(requestId, new Error("The local service connection was lost.")); }
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
      this.#worker?.kill();
      // An unsuccessful kill must not leave the shutdown caller waiting forever.
      this.#stopReject?.(this.#stopError);
      this.changed();
    }, 10_000);
    try { this.#send({ type: "stop", generation: this.#generation, requestId: randomUUID() }); }
    catch { this.#worker?.kill(); }
    this.changed();
    return this.#stopPromise;
  }

  #send(message: WorkerRequest): void { this.#worker?.postMessage(message); }

  #receive(candidate: unknown, generation: number): void {
    if (typeof candidate !== "object" || candidate === null || !("generation" in candidate) || candidate.generation !== generation) return;
    const parsed = workerMessageSchema.safeParse(candidate);
    if (!parsed.success) { this.#fail("The service sent an invalid desktop message. Retry or quit."); return; }
    const message = parsed.data;
    if (message.type === "overlay-lease") { this.overlay?.refreshLease(); return; }
    if (message.type === "overlay-request") {
      const worker = this.#worker;
      const permitted = this.state === "running" || this.state === "starting" ||
        (this.state === "stopping" && ["stop", "close"].includes(message.command.type));
      const result = permitted && this.overlay !== undefined ? this.overlay.handle(message.command) : Promise.reject(new Error("Overlay unavailable"));
      void result.catch(() => null).then(reply => {
        if (worker !== null && this.#worker === worker && generation === this.#generation) {
          try { this.#send({ type: "overlay-response", generation, requestId: message.requestId, result: reply }); }
          catch { this.#fail("The local overlay connection was lost. Retry or quit."); }
        }
      });
      return;
    }
    if (message.type === "audio-lease") { this.audio?.refreshLease(); return; }
    if (message.type === "audio-request") {
      const worker = this.#worker;
      const permitted = this.state === "running" || this.state === "starting" ||
        (this.state === "stopping" && ["stop", "close", "set-muted"].includes(message.command.type));
      const result = permitted && this.audio !== undefined ? this.audio.handle(message.command) : Promise.reject(new Error("Audio unavailable"));
      void result.catch(() => null).then(reply => {
        if (worker !== null && this.#worker === worker && generation === this.#generation) {
          try { this.#send({ type: "audio-response", generation, requestId: message.requestId, result: reply }); }
          catch { this.#fail("The local audio connection was lost. Retry or quit."); }
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
    } else if (message.type === "failed") {
      this.#fail(message.message);
    } else if (message.type === "command-failed") {
      if (message.requestId !== null) this.#finishCommand(message.requestId, new Error(message.message));
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

  #fail(message: string): void {
    this.overlay?.serviceLost();
    this.audio?.serviceLost();
    clearTimeout(this.#startTimer);
    this.state = "failed";
    this.error = message;
    this.snapshot = null;
    this.#startReject?.(new Error(message));
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
    this.snapshot = null;
    if (this.state === "stopping") {
      this.state = "stopped";
      if (this.#stopError !== null) this.#stopReject?.(this.#stopError); else if (code !== 0) this.#stopReject?.(new Error("The local service exited abnormally.")); else this.#stopResolve?.();
    } else if (this.state !== "failed") {
      this.#fail("The local service exited unexpectedly. Retry or quit.");
    }
    this.changed();
  }
}
