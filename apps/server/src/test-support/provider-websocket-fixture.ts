import { createServer } from "node:https";
import { once } from "node:events";
import { WebSocket, WebSocketServer } from "ws";

export interface ProviderFixtureOptions {
  readonly kind: "streamerbot" | "speakerbot";
  readonly host?: "127.0.0.1" | "::1";
  readonly tls?: { readonly key: string | Buffer; readonly cert: string | Buffer };
  readonly expectedAuthentication?: string;
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
    let ready = options.expectedAuthentication === undefined;
    socket.on("error", () => {});
    socket.on("message", data => {
      const message = JSON.parse(String(data)) as Record<string, unknown>;
      requests.push({ connection, message });
      if (options.autoRespond === false) return;
      const authenticated = options.expectedAuthentication === undefined || message.authentication === options.expectedAuthentication;
      if (message.request === "Authenticate") { ready = authenticated; send({ id: message.id, status: authenticated ? "ok" : "error" }, connection); }
      else if (!ready && options.enforce !== false) send({ id: message.id, status: "error" }, connection);
      else send({ id: message.id, status: "ok", info: { name: "Fixture" }, events: { Twitch: ["Follow"] } }, connection);
    });
    if (options.kind === "streamerbot" && options.autoRespond !== false) {
      send({ request: "Hello", info: { name: "Fixture" }, ...(options.expectedAuthentication === undefined ? {} : { authentication: { salt: "fixture-salt", challenge: "fixture-challenge" } }) }, connection);
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

// Public synthetic known-answer vectors calculated independently once:
// base64(SHA256(base64(SHA256(password + salt)) + challenge)).
// The peer never hashes passwords or imports the production authentication helper.
export const providerAuthenticationVectors = {
  "fixture-password": "c2JC/0iz1OnAFlxoRN7VPCl01BBUOZN+YaBU0/FEYwM=",
  "required": "O1VKkrQo/F5uN8iItDVl3S87v4oTXrjRq9Dg2Uu30ls=",
  "synthetic-lifecycle-password": "fo5ml4R/SQHw8eG5ep7ewPFxXzCQAPDO0FeHWgRM2tk=",
  "backup-password-sentinel": "wEizXJZOK7dMGpSy+om4o5c0yS87z6NkJSu/EBqwkWM=",
  "public-fixture-password": "nrGUCfae2paUiObpx0OKlcGsjalTlTMSXs1xIHkGUdM="
} as const;
