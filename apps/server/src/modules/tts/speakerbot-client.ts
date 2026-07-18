import { randomUUID } from "node:crypto";
import type { StreamerBotSocket } from "../streamerbot/streamerbot-client.js";

export type SpeakerBotSocket = StreamerBotSocket;

export interface SpeakerBotConnectionInput {
  readonly protocol?: "ws" | "wss" | undefined;
  readonly host?: string | undefined;
  readonly port?: number | undefined;
  readonly endpoint?: string | undefined;
}

export interface SpeakerBotSpeakInput {
  readonly voice: string;
  readonly message: string;
  readonly badWordFilter: boolean;
}

export interface SpeakerBotClientOptions {
  readonly socketFactory: (url: string) => SpeakerBotSocket;
  readonly generateRequestId?: (() => string) | undefined;
  readonly timeoutMs: number;
}

export class SpeakerBotClient {
  readonly #socketFactory: (url: string) => SpeakerBotSocket;
  readonly #generateRequestId: () => string;
  readonly #timeoutMs: number;

  constructor(options: SpeakerBotClientOptions) {
    this.#socketFactory = options.socketFactory;
    this.#generateRequestId = options.generateRequestId ?? randomUUID;
    this.#timeoutMs = options.timeoutMs;
  }

  validateConnection(url: string): Promise<void> {
    let socket: SpeakerBotSocket;
    try {
      socket = this.#socketFactory(url);
    } catch {
      return Promise.reject(new Error("Speaker.bot WebSocket connection failed"));
    }

    return new Promise((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => finish(new Error("Speaker.bot connection timed out")), this.#timeoutMs);
      const finish = (error: Error | null): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        socket.close();
        if (error === null) resolve();
        else reject(error);
      };

      socket.addEventListener("open", () => finish(null));
      socket.addEventListener("close", () => finish(new Error("Speaker.bot closed before the connection was ready")));
      socket.addEventListener("error", () => finish(new Error("Speaker.bot WebSocket connection failed")));
    });
  }

  speak(url: string, input: SpeakerBotSpeakInput): Promise<Record<string, unknown>> {
    return this.#request(url, "Speak", { ...input });
  }

  #request(url: string, request: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const id = this.#generateRequestId();
    let socket: SpeakerBotSocket;
    try {
      socket = this.#socketFactory(url);
    } catch {
      return Promise.reject(new Error("Speaker.bot WebSocket connection failed"));
    }

    return new Promise((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => {
        finish(new Error(`Speaker.bot ${request} request timed out`));
      }, this.#timeoutMs);

      const finish = (error: Error | null, response?: Record<string, unknown>): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        socket.close();
        if (error === null && response !== undefined) {
          resolve(response);
          return;
        }
        reject(error ?? new Error(`Speaker.bot ${request} request failed`));
      };

      socket.addEventListener("open", () => {
        try {
          socket.send(JSON.stringify({ id, request, ...payload }));
        } catch {
          finish(new Error(`Speaker.bot ${request} request could not be sent`));
        }
      });
      socket.addEventListener("message", (event) => {
        const response = parseResponse(event.data);
        if (response === null || typeof response.id !== "string") {
          finish(new Error("Speaker.bot returned an invalid response"));
          return;
        }
        if (response.id !== id) return;
        if (response.status !== "ok" && response.status !== "error") {
          finish(new Error("Speaker.bot returned an invalid response"));
          return;
        }
        if (response.status === "error") {
          finish(new Error(`Speaker.bot ${request} request failed`));
          return;
        }
        finish(null, response);
      });
      socket.addEventListener("close", () => {
        finish(new Error(`Speaker.bot closed before the ${request} response arrived`));
      });
      socket.addEventListener("error", () => {
        finish(new Error("Speaker.bot WebSocket connection failed"));
      });
    });
  }
}

export function buildSpeakerBotWebSocketUrl(input: SpeakerBotConnectionInput = {}): string {
  const url = new URL(`${input.protocol ?? "ws"}://${input.host ?? "127.0.0.1"}`);
  url.port = String(input.port ?? 7680);
  const endpoint = input.endpoint?.replace(/^\/+|\/+$/g, "") ?? "";
  url.pathname = endpoint.length === 0 ? "/" : `/${endpoint}`;
  return url.toString();
}

function parseResponse(data: unknown): Record<string, unknown> | null {
  let parsed: unknown = data;
  if (typeof data === "string") {
    try {
      parsed = JSON.parse(data) as unknown;
    } catch {
      return null;
    }
  }
  return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : null;
}
