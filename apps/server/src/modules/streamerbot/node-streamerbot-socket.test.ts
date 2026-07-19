import { once } from "node:events";
import { WebSocketServer } from "ws";
import { afterEach, describe, expect, it } from "vitest";
import { createNodeStreamerBotSocket } from "./node-streamerbot-socket.js";
import { StreamerBotClient } from "./streamerbot-client.js";

const servers: WebSocketServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

describe("createNodeStreamerBotSocket", () => {
  it("decodes a compressed GetEvents response from a Streamer.bot-compatible server", async () => {
    const server = new WebSocketServer({ port: 0, perMessageDeflate: { threshold: 0 } });
    servers.push(server);
    await once(server, "listening");
    server.on("connection", (socket) => {
      socket.send(JSON.stringify({ request: "Hello", info: { name: "Local Bot" } }));
      socket.on("message", (data) => {
        const request = JSON.parse(String(data)) as { readonly id: string; readonly request: string };
        socket.send(JSON.stringify({
          id: request.id,
          status: "ok",
          events: {
            Twitch: ["Follow", "Raid"],
            LargeCategory: Array.from({ length: 1_000 }, (_, index) => `Event-${index}`)
          }
        }));
      });
    });

    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Test WebSocket server did not expose a TCP port");
    }
    const client = new StreamerBotClient({
      socketFactory: createNodeStreamerBotSocket,
      onEvent() {},
      requestTimeoutMs: 1_000
    });

    try {
      client.connect({ host: "127.0.0.1", port: address.port });
      await waitFor(() => client.getStatus().state === "connected");

      await expect(client.getEvents()).resolves.toMatchObject({ Twitch: ["Follow", "Raid"] });
    } finally {
      client.disconnect();
    }
  });
});

async function waitFor(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for condition");
}
