import { z } from "zod";

const hosts = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
export const localWebSocketConnectionSchema = z.object({
  protocol: z.enum(["ws", "wss"]),
  host: z.string().refine((host) => hosts.has(host), "A literal loopback host is required"),
  port: z.number().int().positive().max(65_535),
  // eslint-disable-next-line no-control-regex -- reject control bytes at the connection boundary
  endpoint: z.string().refine((path) => /^\/(?!\/)[^\s\\?#\u0000-\u001f\u007f-\u009f]*$/u.test(path), "A local endpoint path is required")
}).strict();

export type LocalWebSocketConnection = z.infer<typeof localWebSocketConnectionSchema>;

export function buildLocalWebSocketUrl(input: LocalWebSocketConnection): string {
  const connection = localWebSocketConnectionSchema.safeParse(input);
  if (!connection.success) throw new Error("Invalid local WebSocket connection");
  const { protocol, host, port, endpoint } = connection.data;
  const literalHost = host === "localhost" ? "127.0.0.1" : host === "::1" ? "[::1]" : host;
  return new URL(`${protocol}://${literalHost}:${port}${endpoint}`).toString();
}

export function validateLocalWebSocketUrl(url: string): string {
  // eslint-disable-next-line no-control-regex -- reject control bytes before URL normalization
  const match = /^(ws|wss):\/\/(127\.0\.0\.1|localhost|\[::1\])(?::([0-9]+))?(\/[^\s\\?#\u0000-\u001f\u007f-\u009f]*)?$/u.exec(url);
  if (match === null) throw new Error("Invalid local WebSocket connection");
  return buildLocalWebSocketUrl({
    protocol: match[1] as "ws" | "wss",
    host: match[2]!,
    port: match[3] === undefined ? (match[1] === "wss" ? 443 : 80) : Number(match[3]),
    endpoint: match[4] ?? "/"
  });
}
