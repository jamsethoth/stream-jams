import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildSpeakerBotWebSocketUrl,
  SpeakerBotClient,
  type SpeakerBotSocket
} from "./speakerbot-client.js";

describe("SpeakerBotClient", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends the official Speak request and resolves its matching response", async () => {
    const harness = createHarness();
    const request = harness.client.speak(buildSpeakerBotWebSocketUrl(), {
      voice: "EventVoice",
      message: "Raid incoming",
      badWordFilter: true
    });

    await harness.socket.emitOpen();
    expect(harness.urls).toEqual(["ws://127.0.0.1:7680/"]);
    expect(harness.socket.sent).toEqual([
      {
        id: "request-1",
        request: "Speak",
        voice: "EventVoice",
        message: "Raid incoming",
        badWordFilter: true
      }
    ]);

    await harness.socket.emitMessage({ id: "request-1", request: "Speak", status: "ok" });

    await expect(request).resolves.toMatchObject({ id: "request-1", status: "ok" });
    expect(harness.socket.closeCount).toBe(1);
  });

  it("rejects timed out requests", async () => {
    const harness = createHarness();
    const result = harness.client.validateConnection("ws://127.0.0.1:7680/").catch((error: unknown) => error);

    await vi.advanceTimersByTimeAsync(100);

    await expect(result).resolves.toMatchObject({ message: "Speaker.bot connection timed out" });
    expect(harness.socket.closeCount).toBe(1);
  });

  it("rejects malformed responses", async () => {
    const harness = createHarness();
    const result = harness.client.speak("ws://127.0.0.1:7680/", {
      voice: "EventVoice",
      message: "Raid incoming",
      badWordFilter: true
    }).catch((error: unknown) => error);

    await harness.socket.emitOpen();
    await harness.socket.emitRawMessage("not json");

    await expect(result).resolves.toMatchObject({ message: "Speaker.bot returned an invalid response" });
  });

  it("rejects error responses with bounded provider guidance only", async () => {
    const harness = createHarness();
    const result = harness.client.speak("ws://127.0.0.1:7680/private", {
      voice: "private-voice",
      message: "private-message",
      badWordFilter: true
    }).catch((error: unknown) => error);

    await harness.socket.emitOpen();
    await harness.socket.emitMessage({
      id: "request-1",
      request: "Speak",
      status: "error",
      error: "  Voice Alias 'EventVoice' was not found.\r\n",
      details: "private-response-payload"
    });

    const error = await result;
    expect(error).toMatchObject({
      message: "Speaker.bot Speak request failed: Voice Alias 'EventVoice' was not found."
    });
    expect(String(error)).not.toContain("private");
  });

  it("uses the generic failure when Speaker.bot omits a usable error message", async () => {
    const harness = createHarness();
    const result = harness.client.speak("ws://127.0.0.1:7680/", {
      voice: "EventVoice",
      message: "Raid incoming",
      badWordFilter: true
    }).catch((error: unknown) => error);

    await harness.socket.emitOpen();
    await harness.socket.emitMessage({
      id: "request-1",
      request: "Speak",
      status: "error",
      error: { raw: "private-response-payload" }
    });

    await expect(result).resolves.toMatchObject({ message: "Speaker.bot Speak request failed" });
  });

  it("caps provider error messages", async () => {
    const harness = createHarness();
    const result = harness.client.speak("ws://127.0.0.1:7680/", {
      voice: "EventVoice",
      message: "Raid incoming",
      badWordFilter: true
    }).catch((error: unknown) => error);

    await harness.socket.emitOpen();
    await harness.socket.emitMessage({ id: "request-1", status: "error", error: "x".repeat(400) });

    await expect(result).resolves.toMatchObject({
      message: `Speaker.bot Speak request failed: ${"x".repeat(300)}`
    });
  });

  it.each([
    ["close", "Speaker.bot closed before the connection was ready"],
    ["error", "Speaker.bot WebSocket connection failed"]
  ] as const)("rejects when the socket emits %s", async (event, message) => {
    const harness = createHarness();
    const result = harness.client.validateConnection("ws://127.0.0.1:7680/").catch((error: unknown) => error);

    if (event === "close") {
      await harness.socket.emitClose();
    } else {
      await harness.socket.emitError();
    }

    await expect(result).resolves.toMatchObject({ message });
  });
});

function createHarness() {
  const socket = new FakeSocket();
  const urls: string[] = [];
  const client = new SpeakerBotClient({
    socketFactory(url) {
      urls.push(url);
      return socket;
    },
    generateRequestId: () => "request-1",
    timeoutMs: 100
  });
  return { client, socket, urls };
}

class FakeSocket implements SpeakerBotSocket {
  closeCount = 0;
  readonly sent: unknown[] = [];
  readonly #listeners = {
    open: [] as (() => void | Promise<void>)[],
    message: [] as ((event: { readonly data: unknown }) => void | Promise<void>)[],
    close: [] as ((event: { readonly code?: number; readonly reason?: string }) => void | Promise<void>)[],
    error: [] as ((event: unknown) => void | Promise<void>)[]
  };

  addEventListener(event: "open", listener: () => void | Promise<void>): void;
  addEventListener(event: "message", listener: (event: { readonly data: unknown }) => void | Promise<void>): void;
  addEventListener(
    event: "close",
    listener: (event: { readonly code?: number; readonly reason?: string }) => void | Promise<void>
  ): void;
  addEventListener(event: "error", listener: (event: unknown) => void | Promise<void>): void;
  addEventListener(event: "open" | "message" | "close" | "error", listener: unknown): void {
    this.#listeners[event].push(listener as never);
  }

  send(data: string): void {
    this.sent.push(JSON.parse(data) as unknown);
  }

  close(): void {
    this.closeCount += 1;
  }

  async emitOpen(): Promise<void> {
    for (const listener of this.#listeners.open) await listener();
  }

  async emitMessage(message: unknown): Promise<void> {
    await this.emitRawMessage(JSON.stringify(message));
  }

  async emitRawMessage(data: string): Promise<void> {
    for (const listener of this.#listeners.message) await listener({ data });
  }

  async emitClose(): Promise<void> {
    for (const listener of this.#listeners.close) await listener({});
  }

  async emitError(): Promise<void> {
    for (const listener of this.#listeners.error) await listener(new Error("private socket detail"));
  }
}
