import { X509Certificate } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { expect, it } from "vitest";
import { startProviderFixture } from "../provider-websocket-fixture.js";

export function testProviderTls(kind: "streamerbot" | "speakerbot"): void {
  it.each(["trusted", "untrusted", "expired", "wrong-san"])("enforces WSS certificates: %s", async mode => {
    const name = mode === "untrusted" ? "trusted" : mode;
    const certificate = await readFile(new URL(`${name}.pem`, import.meta.url));
    const parsedCertificate = new X509Certificate(certificate);
    const now = Date.now();
    expect(Date.parse(parsedCertificate.validFrom), "TLS fixture must already be valid").toBeLessThan(now);
    if (mode === "expired") expect(Date.parse(parsedCertificate.validTo), "Expired fixture must remain expired").toBeLessThan(now);
    else expect(Date.parse(parsedCertificate.validTo), "Regenerate expired test fixture instead of blaming production TLS").toBeGreaterThan(now);
    expect(parsedCertificate.checkIP("127.0.0.1") !== undefined).toBe(mode !== "wrong-san");
    const peer = await startProviderFixture({ kind, ...(kind === "streamerbot" ? { password: "public-fixture-password" } : {}), tls: {
      key: await readFile(new URL(`${name}-key.pem`, import.meta.url)),
      cert: certificate
    } });
    try {
      const env = { ...process.env };
      delete env.NODE_TLS_REJECT_UNAUTHORIZED;
      delete env.NODE_EXTRA_CA_CERTS;
      if (mode !== "untrusted") env.NODE_EXTRA_CA_CERTS = fileURLToPath(new URL("ca.pem", import.meta.url));
      const result = await promisify(execFile)(process.execPath, [fileURLToPath(new URL("client.mjs", import.meta.url)), kind, peer.url], { env, windowsHide: true, timeout: 5_000 });
      expect(result.stdout.trim()).toBe(`provider-tls:${mode === "trusted" ? "accepted" : "rejected"}`);
      expect(peer.requests.length > 0).toBe(mode === "trusted");
      expect(peer.connections.length > 0).toBe(mode === "trusted");
    } finally { await peer.close(); }
  });
}
