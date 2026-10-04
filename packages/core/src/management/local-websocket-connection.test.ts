import { describe, expect, it } from "vitest";
import { buildLocalWebSocketUrl, validateLocalWebSocketUrl } from "./local-websocket-connection.js";

describe("local WebSocket boundaries", () => {
  it.each(["127.0.0.1", "localhost", "::1", "[::1]"])("accepts literal host %s", (host) => {
    expect(buildLocalWebSocketUrl({ protocol: "ws", host, port: 8080, endpoint: "/" })).toMatch(/^ws:\/\//u);
  });
  it.each(["remote.test", "127.1", "2130706433", "0x7f000001", "127.0.0.1:8080", "user@localhost", " localhost", "localhost\\evil", "LOCALHOST"])("rejects host %s", (host) => {
    expect(() => buildLocalWebSocketUrl({ protocol: "ws", host, port: 8080, endpoint: "/" })).toThrow("Invalid local WebSocket connection");
  });
  it.each(["//evil", "path", "/?token=x", "/#secret", "/\\evil", "/a\nb", "/a b"])("rejects endpoint %s", (endpoint) => {
    expect(() => buildLocalWebSocketUrl({ protocol: "ws", host: "localhost", port: 8080, endpoint })).toThrow();
  });
  it.each(["ws://127.1/", "ws://2130706433/", "ws://user:secret@localhost/", "ws://remote.test/", "ws://localhost/?token=x", "ws://localhost/#secret", "ws://localhost//evil", "ws://localhost\\evil/"])("rejects raw URL %s", (url) => {
    expect(() => validateLocalWebSocketUrl(url)).toThrow("Invalid local WebSocket connection");
  });
});
