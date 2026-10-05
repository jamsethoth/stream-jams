import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";

type SongResponse = { readonly status: number; readonly body?: unknown; readonly retryAfter?: string; readonly delayMs?: number };

/** Disposable test-only Pear protocol peer. Never registered as a production provider. */
export interface PearProtocolFixture {
  readonly baseUrl: string;
  readonly requests: Array<{ readonly path: string; readonly authorization: string | undefined }>;
  readonly sockets: Array<{ readonly token: string | null; readonly socket: WebSocket }>;
  setSong(response: SongResponse): void;
  setFirstFrame(frame: unknown | null): void;
  setWsStatus(status: number | null): void;
  send(frame: unknown): void;
  sendRaw(raw: string): void;
  closeSockets(code?: number): void;
  close(): Promise<void>;
}

export async function startPearProtocolFixture(token = "throwaway-token"): Promise<PearProtocolFixture> {
  let song: SongResponse = { status: 204 };
  let firstFrame: unknown | null = { type: "PLAYER_INFO", isPlaying: false };
  let wsStatus: number | null = null;
  const requests: PearProtocolFixture["requests"] = [];
  const sockets: PearProtocolFixture["sockets"] = [];
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    requests.push({ path: request.url ?? "", authorization: request.headers.authorization });
    if (request.url?.startsWith("/auth/")) {
      response.writeHead(200, { "content-type": "application/json" }); response.end(JSON.stringify({ accessToken: token })); return;
    }
    if (request.url !== "/api/v1/song") { response.writeHead(404); response.end(); return; }
    if (request.headers.authorization !== `Bearer ${token}`) { response.writeHead(401); response.end(); return; }
    const reply = () => {
      response.writeHead(song.status, {
        ...(song.status === 200 ? { "content-type": "application/json" } : {}),
        ...(song.retryAfter ? { "retry-after": song.retryAfter } : {})
      });
      response.end(song.body === undefined ? undefined : JSON.stringify(song.body));
    };
    if (song.delayMs) setTimeout(reply, song.delayMs); else reply();
  });
  const wsServer = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 });
  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (url.pathname !== "/api/v1/ws") { socket.destroy(); return; }
    if (wsStatus !== null) { socket.end(`HTTP/1.1 ${wsStatus} Unavailable\r\nContent-Length: 0\r\n\r\n`); return; }
    wsServer.handleUpgrade(request, socket, head, peer => {
      const selectedToken = url.searchParams.get("token");
      sockets.push({ token: selectedToken, socket: peer });
      if (selectedToken !== token) peer.close(1008);
      else if (firstFrame !== null) peer.send(JSON.stringify(firstFrame));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Pear fixture did not bind");
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    requests, sockets,
    setSong(value) { song = value; },
    setFirstFrame(value) { firstFrame = value; },
    setWsStatus(value) { wsStatus = value; },
    send(value) { for (const peer of wsServer.clients) peer.send(JSON.stringify(value)); },
    sendRaw(value) { for (const peer of wsServer.clients) peer.send(value); },
    closeSockets(code = 1000) { for (const peer of wsServer.clients) peer.close(code); },
    async close() {
      for (const peer of wsServer.clients) peer.terminate();
      await new Promise<void>(resolve => wsServer.close(() => resolve()));
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  };
}
