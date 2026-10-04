import { createHash } from "node:crypto";
import { createServer } from "node:https";
import { once } from "node:events";
import { WebSocket, WebSocketServer } from "ws";

export interface ProviderFixtureOptions {
  readonly kind: "streamerbot" | "speakerbot";
  readonly host?: "127.0.0.1" | "::1";
  readonly tls?: { readonly key: string | Buffer; readonly cert: string | Buffer };
  readonly password?: string;
  /** Disable automatic Hello and request replies for deterministic hostile peers. */
  readonly autoRespond?: boolean;
  readonly enforce?: boolean;
}

export async function startProviderFixture(options: ProviderFixtureOptions) {
  const host = options.host ?? "127.0.0.1";
  const https = options.tls === undefined ? undefined : createServer(options.tls);
  const server = new WebSocketServer(https === undefined ? { host, port: 0 } : { server: https });
  const listener = https ?? server;
  if (https !== undefined) https.listen(0, host);
  await once(listener, "listening");
  const address = listener.address();
  if (address === null || typeof address === "string") throw new Error("Provider fixture did not bind TCP");
  const connections: WebSocket[] = [];
  const requests: Array<{ readonly connection: number; readonly message: Record<string, unknown> }> = [];
  const send = (message: unknown, connection = connections.length - 1) => {
    const socket = connections[connection];
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  };
  server.on("connection", socket => {
    const connection = connections.push(socket) - 1;
    let ready = options.password === undefined;
    socket.on("error", () => {});
    socket.on("message", data => {
      const message = JSON.parse(String(data)) as Record<string, unknown>;
      requests.push({ connection, message });
      if (options.autoRespond === false) return;
      const authenticated = options.password === undefined || message.authentication === auth(options.password);
      if (message.request === "Authenticate") { ready = authenticated; send({ id: message.id, status: authenticated ? "ok" : "error" }, connection); }
      else if (!ready && options.enforce !== false) send({ id: message.id, status: "error" }, connection);
      else send({ id: message.id, status: "ok", info: { name: "Fixture" }, events: { Twitch: ["Follow"] } }, connection);
    });
    if (options.kind === "streamerbot" && options.autoRespond !== false) {
      send({ request: "Hello", info: { name: "Fixture" }, ...(options.password === undefined ? {} : { authentication: { salt: "fixture-salt", challenge: "fixture-challenge" } }) }, connection);
    }
  });
  return {
    url: `${https === undefined ? "ws" : "wss"}://${host === "::1" ? "[::1]" : host}:${address.port}/`,
    port: address.port,
    connections,
    requests,
    send,
    sendEvent: (id: string, connection = connections.length - 1) => send({ timeStamp: "2026-10-03T00:00:00.000Z", event: { source: "Twitch", type: "Follow" }, data: { id } }, connection),
    closeClients: () => connections.forEach(socket => socket.close()),
    async close() {
      connections.forEach(socket => socket.terminate());
      await new Promise<void>(resolve => server.close(() => resolve()));
      if (https !== undefined) await new Promise<void>(resolve => https.close(() => resolve()));
    }
  };
}

export async function waitForProvider(condition: () => boolean, label = "provider condition"): Promise<void> {
  const end = Date.now() + 3_000;
  while (!condition()) {
    if (Date.now() >= end) throw new Error(`Timed out waiting for ${label}`);
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}

function auth(password: string): string {
  // Test peer mirrors the documented challenge-response; no password is persisted.
  const digest = (value: string) => createHash("sha256").update(value).digest("base64");
  return digest(digest(password + "fixture-salt") + "fixture-challenge");
}
