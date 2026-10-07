import { X509Certificate } from "node:crypto";
import { readFileSync } from "node:fs";
import * as https from "node:https";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { buildPearAuthUrl, inspectPearCertificate, isLoopbackAddress, parsePearConfiguration, pearTlsOptions } from "./pear-config.js";

// Public test material: trusted.pem is signed by a test CA that this process does not trust, like a self-signed Pear certificate.
const fixture = (name: string) => readFileSync(new URL(`../../test-support/provider-tls/${name}`, import.meta.url), "utf8");
const servedPem = fixture("trusted.pem");
const otherPem = fixture("expired.pem");
const fingerprint = (pem: string) => new X509Certificate(pem).fingerprint256;
let server: https.Server | null = null;
afterEach(async () => { await new Promise(resolve => server === null ? resolve(undefined) : server.close(resolve)); server = null; });

async function startServer(): Promise<{ baseUrl: string; requests: () => number }> {
  let requests = 0;
  server = https.createServer({ cert: servedPem, key: fixture("trusted-key.pem") }, (_request, response) => { requests += 1; response.end("ok"); });
  await new Promise<void>(resolve => server!.listen(0, "127.0.0.1", resolve));
  return { baseUrl: `https://127.0.0.1:${(server.address() as AddressInfo).port}/`, requests: () => requests };
}

function get(baseUrl: string, config: ReturnType<typeof parsePearConfiguration>): Promise<number> {
  const url = new URL(baseUrl);
  return new Promise((resolve, reject) => {
    https.get({ host: url.hostname, port: url.port, path: "/", agent: false, ...pearTlsOptions(config, url.hostname) }, response => { response.resume(); resolve(response.statusCode ?? 0); }).on("error", reject);
  });
}

describe("Pear configuration", () => {
  it("uses a single auth path for loopback IPv4, IPv6 and localhost", () => {
    for (const baseUrl of ["http://127.0.0.1:26538", "https://[::1]:26538", "http://localhost:26538"]) {
      const url = buildPearAuthUrl(parsePearConfiguration({ baseUrl, transport: "auto" }), "client-1");
      expect(url.pathname).toBe("/auth/client-1");
      expect(url.search).toBe("");
    }
  });

  it("rejects credentials, paths and nonloopback destinations", () => {
    for (const baseUrl of ["http://user:pass@localhost:26538", "http://localhost:26538/path", "http://10.0.0.1:26538"]) {
      expect(() => parsePearConfiguration({ baseUrl, transport: "auto" })).toThrow();
    }
  });

  it("recognizes only actual loopback socket addresses", () => {
    expect(isLoopbackAddress("127.0.0.1")).toBe(true);
    expect(isLoopbackAddress("127.23.45.67")).toBe(true);
    expect(isLoopbackAddress("::1")).toBe(true);
    expect(isLoopbackAddress("127.0.0.1.example.com")).toBe(false);
    expect(isLoopbackAddress("10.0.0.1")).toBe(false);
  });

  it("reads an untrusted HTTPS certificate without sending a request and skips plain HTTP", async () => {
    const { baseUrl, requests } = await startServer();
    const presented = await inspectPearCertificate(parsePearConfiguration({ baseUrl }), AbortSignal.timeout(5_000));
    expect(presented).toMatchObject({ sha256: fingerprint(servedPem), authorized: false, subject: "CN=trusted" });
    expect(fingerprint(presented!.pem)).toBe(fingerprint(servedPem));
    expect(requests()).toBe(0);
    await expect(inspectPearCertificate(parsePearConfiguration({ baseUrl: "http://127.0.0.1:26538" }), AbortSignal.timeout(5_000))).resolves.toBeNull();
  });

  it("trusts only the accepted certificate once pinned", async () => {
    const { baseUrl } = await startServer();
    await expect(get(baseUrl, parsePearConfiguration({ baseUrl }))).rejects.toThrow();
    await expect(get(baseUrl, parsePearConfiguration({ baseUrl, trustedCertificate: { sha256: fingerprint(servedPem), pem: servedPem } }))).resolves.toBe(200);
    await expect(get(baseUrl, parsePearConfiguration({ baseUrl, trustedCertificate: { sha256: fingerprint(otherPem), pem: otherPem } }))).rejects.toThrow();
  });

  it("rejects a pinned certificate whose fingerprint does not match and omits IP server names", () => {
    expect(() => pearTlsOptions(parsePearConfiguration({ baseUrl: "https://127.0.0.1:26538", trustedCertificate: { sha256: fingerprint(otherPem), pem: servedPem } }), "127.0.0.1")).toThrow("does not match");
    expect(pearTlsOptions(parsePearConfiguration({ baseUrl: "https://127.0.0.1:26538" }), "127.0.0.1")).toEqual({});
    expect(pearTlsOptions(parsePearConfiguration({ baseUrl: "https://localhost:26538" }), "localhost")).toEqual({ servername: "localhost" });
  });
});
