import { describe, expect, it, vi } from "vitest";
import { PearPairingService } from "./pear-pairing-service.js";
import { createServer } from "node:http";

// Keep tests off the network: a Pear instance on this machine must not change pairing outcomes.
const hermeticTls = { inspectCertificate: async () => null };

const config = { baseUrl: "http://127.0.0.1:26538", transport: "auto" } as const;

function setup(response: Promise<{ status: number; body: unknown }>) {
  const secrets = new Map<string, string>();
  const service = new PearPairingService({ ...hermeticTls,
    identityStore: {
      getSecret: async () => secrets.get("client") ?? null,
      setSecret: async (_ref, value) => { secrets.set("client", value); }
    },
    requestApproval: async () => response,
    generateId: () => "attempt-opaque",
    generateClientId: () => "stable-client-id",
    now: () => Date.now()
  });
  return { service, secrets };
}

describe("PearPairingService", () => {
  it("uses a rotated restore identity instead of its cached client ID and cancels old approvals", async () => {
    let stored = "old-client";
    const urls: string[] = [];
    const service = new PearPairingService({ ...hermeticTls,
      identityStore: { getSecret: async () => stored, setSecret: async (_ref, value) => { stored = value; } },
      generateId: (() => { let next = 0; return () => `attempt-${++next}`; })(),
      requestApproval: async url => { urls.push(url.pathname); return new Promise(() => {}); }
    });
    try {
      const old = await service.begin(config);
      stored = "new-client";
      await service.invalidateIdentity();
      expect(() => service.get(old.attemptId)).toThrow("not found");
      await service.begin(config);
      expect(urls).toEqual(["/auth/old-client", "/auth/new-client"]);
    } finally { await service.dispose(); }
  });

  it("waits for an in-flight client ID creation before rotating and rejects its late begin", async () => {
    let finishRead!: (value: string | null) => void;
    let stored: string | null = null;
    let firstRead = true;
    const urls: string[] = [];
    const service = new PearPairingService({ ...hermeticTls,
      identityStore: {
        getSecret: async () => firstRead ? new Promise(resolve => { firstRead = false; finishRead = resolve; }) : stored,
        setSecret: async (_ref, value) => { stored = value; }
      },
      generateClientId: () => "old-created-id",
      requestApproval: async url => { urls.push(url.pathname); return { status: 403, body: null }; }
    });
    try {
      const lateBegin = service.begin(config);
      const rejected = expect(lateBegin).rejects.toThrow("identity changed");
      const rotation = service.changeIdentity(async () => { stored = "restored-new-id"; });
      finishRead(null);
      await rotation;
      await rejected;
      await service.begin(config);
      expect(stored).toBe("restored-new-id");
      expect(urls).toEqual(["/auth/restored-new-id"]);
    } finally { await service.dispose(); }
  });
  it("holds an approved token server-side and exposes an opaque status", async () => {
    const { service, secrets } = setup(Promise.resolve({ status: 200, body: { accessToken: "sentinel-secret" } }));
    const begun = await service.begin(config);
    await vi.waitFor(() => expect(service.get(begun.attemptId).status).toBe("approved"));
    expect(JSON.stringify(service.get(begun.attemptId))).not.toContain("sentinel-secret");
    expect(secrets.get("client")).toBe("stable-client-id");
    const claim = service.reserve(begun.attemptId, config);
    expect(claim.token).toBe("sentinel-secret");
    expect(() => service.reserve(begun.attemptId, config)).toThrow();
    claim.complete();
    expect(() => service.reserve(begun.attemptId, config)).toThrow();
  });

  it("discards late approval after cancellation", async () => {
    let approve!: (value: { status: number; body: unknown }) => void;
    const { service } = setup(new Promise((resolve) => { approve = resolve; }));
    const begun = await service.begin(config);
    await service.cancel(begun.attemptId);
    approve({ status: 200, body: { accessToken: "late-secret" } });
    await vi.waitFor(() => expect(service.get(begun.attemptId).status).toBe("cancelled"));
    expect(() => service.reserve(begun.attemptId, config)).toThrow();
  });

  it("expires pending approval after sixty seconds", async () => {
    vi.useFakeTimers();
    try {
      const { service } = setup(new Promise(() => {}));
      const begun = await service.begin(config);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(service.get(begun.attemptId).status).toBe("expired");
    } finally { vi.useRealTimers(); }
  });

  it("keeps the client identity across service restart and never accepts a redirect as approval", async () => {
    const secrets = new Map<string, string>();
    const urls: string[] = [];
    const identityStore = {
      getSecret: async () => secrets.get("client") ?? null,
      setSecret: async (_ref: unknown, value: string) => { secrets.set("client", value); }
    };
    const first = new PearPairingService({ ...hermeticTls,
      identityStore, generateClientId: () => "stable-client-id", generateId: () => "attempt-first",
      requestApproval: async (url) => { urls.push(url.toString()); return { status: 302, body: { accessToken: "redirect-token" } }; }
    });
    const attempt = await first.begin(config);
    await vi.waitFor(() => expect(first.get(attempt.attemptId).status).toBe("denied"));
    await first.dispose();
    const second = new PearPairingService({ ...hermeticTls,
      identityStore, generateClientId: () => "different-id", generateId: () => "attempt-second",
      requestApproval: async (url) => { urls.push(url.toString()); return { status: 403, body: null }; }
    });
    const next = await second.begin(config);
    await vi.waitFor(() => expect(second.get(next.attemptId).status).toBe("denied"));
    expect(urls).toEqual(["http://127.0.0.1:26538/auth/stable-client-id", "http://127.0.0.1:26538/auth/stable-client-id"]);
    await second.dispose();
  });

  it("uses the real loopback transport without following an approval redirect", async () => {
    let requestCount = 0;
    const server = createServer((_request, response) => {
      requestCount += 1;
      response.writeHead(302, { location: "http://example.com/auth/escape" }).end();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address();
      if (address === null || typeof address === "string") throw new Error("Missing test listener");
      const service = new PearPairingService({ ...hermeticTls,
        identityStore: { getSecret: async () => "stable-client", setSecret: async () => undefined },
        generateId: () => "attempt-real-loopback"
      });
      const attempt = await service.begin({ baseUrl: `http://127.0.0.1:${address.port}`, transport: "auto" });
      await vi.waitFor(() => expect(service.get(attempt.attemptId).status).toBe("denied"));
      expect(requestCount).toBe(1);
      await service.dispose();
    } finally { server.close(); }
  });

  it("invalidates an exclusive claim when cancelled and permits reuse only after release", async () => {
    const { service } = setup(Promise.resolve({ status: 200, body: { accessToken: "one-token" } }));
    const first = await service.begin(config);
    await vi.waitFor(() => expect(service.get(first.attemptId).status).toBe("approved"));
    const claim = service.reserve(first.attemptId, config);
    expect(() => service.reserve(first.attemptId, config)).toThrow();
    claim.release();
    const secondClaim = service.reserve(first.attemptId, config);
    expect(() => claim.assertActive()).toThrow();
    await service.cancel(first.attemptId);
    expect(() => secondClaim.assertActive()).toThrow();
  });

  it("serializes initial client identity creation across concurrent pairing starts", async () => {
    const stored = new Map<string, string>();
    let writes = 0;
    const service = new PearPairingService({ ...hermeticTls,
      identityStore: {
        getSecret: async () => stored.get("client") ?? null,
        setSecret: async (_ref, value) => { writes += 1; stored.set("client", value); }
      },
      generateClientId: () => "single-client-id",
      requestApproval: async () => ({ status: 403, body: null })
    });
    await Promise.all([service.begin(config), service.begin(config)]);
    expect(writes).toBe(1);
    await service.dispose();
  });

  it("bounds outstanding attempts while preserving active ones", async () => {
    const service = new PearPairingService({ ...hermeticTls,
      identityStore: { getSecret: async () => "stable-client", setSecret: async () => undefined },
      requestApproval: async () => new Promise(() => {})
    });
    const attempts = await Promise.all(Array.from({ length: 32 }, () => service.begin(config)));
    await expect(service.begin(config)).rejects.toThrow("Too many active Pear pairing attempts");
    expect(service.get(attempts[0]!.attemptId).status).toBe("pending");
    await service.cancel(attempts[0]!.attemptId);
    await expect(service.begin(config)).resolves.toMatchObject({ status: "pending" });
    await service.dispose();
  });

  describe("self-signed certificates", () => {
    const httpsConfig = { baseUrl: "https://127.0.0.1:26538", transport: "auto" } as const;
    const pem = "-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----\n";
    const sha256 = Array.from({ length: 32 }, () => "AB").join(":");
    const otherSha256 = Array.from({ length: 32 }, () => "CD").join(":");
    const presented = { pem, sha256, subject: "CN=localhost", issuer: "CN=localhost", validFrom: "Oct  4 23:22:12 2026 GMT", validTo: "Oct  4 23:22:12 2027 GMT", authorized: false };

    function certificateService(certificate: typeof presented) {
      const approvals: { config: unknown }[] = [];
      const service = new PearPairingService({ ...hermeticTls,
        identityStore: { getSecret: async () => "stable-client", setSecret: async () => undefined },
        inspectCertificate: async () => certificate,
        requestApproval: async (_url, _signal, approvalConfig) => { approvals.push({ config: approvalConfig }); return { status: 200, body: { accessToken: "pear-token" } }; }
      });
      return { service, approvals };
    }

    it("switches a plain HTTP address to HTTPS when Pear serves TLS on that port", async () => {
      const inspected: string[] = [];
      const approvals: string[] = [];
      const service = new PearPairingService({
        identityStore: { getSecret: async () => "stable-client", setSecret: async () => undefined },
        // Mirrors inspectPearCertificate: plain HTTP is never inspected over TLS.
        inspectCertificate: async candidate => { inspected.push(candidate.baseUrl); return candidate.baseUrl.startsWith("https:") ? presented : null; },
        requestApproval: async url => { approvals.push(url.href); return new Promise(() => {}); }
      });
      try {
        await expect(service.begin(config)).resolves.toMatchObject({ status: "certificate-review", configuration: httpsConfig, certificate: { sha256 } });
        expect(inspected).toEqual(["http://127.0.0.1:26538", "https://127.0.0.1:26538"]);
        expect(approvals).toEqual([]);
      } finally { await service.dispose(); }
    });

    it("keeps a plain HTTP address when nothing answers TLS on that port", async () => {
      const approvals: string[] = [];
      const service = new PearPairingService({
        identityStore: { getSecret: async () => "stable-client", setSecret: async () => undefined },
        inspectCertificate: async candidate => { if (candidate.baseUrl.startsWith("https:")) throw new Error("wrong version number"); return null; },
        requestApproval: async url => { approvals.push(url.href); return new Promise(() => {}); }
      });
      try {
        await expect(service.begin(config)).resolves.toMatchObject({ status: "pending", configuration: config });
        expect(approvals).toEqual(["http://127.0.0.1:26538/auth/stable-client"]);
      } finally { await service.dispose(); }
    });

    it("holds Pear approval until the user accepts the exact reviewed certificate", async () => {
      const { service, approvals } = certificateService(presented);
      try {
        const review = await service.begin(httpsConfig);
        expect(review).toMatchObject({ status: "certificate-review", configuration: httpsConfig, certificate: { sha256, subject: "CN=localhost", replacesTrusted: false } });
        expect(approvals).toHaveLength(0);
        expect(() => service.reserve(review.attemptId, httpsConfig)).toThrow("unavailable");
        expect(() => service.acceptCertificate(review.attemptId, otherSha256)).toThrow("does not match");
        expect(approvals).toHaveLength(0);
        const accepted = service.acceptCertificate(review.attemptId, sha256);
        const pinned = { ...httpsConfig, trustedCertificate: { sha256, pem } };
        expect(accepted).toMatchObject({ status: "pending", configuration: pinned, certificate: null });
        expect(approvals).toEqual([{ config: pinned }]);
        await vi.waitFor(() => expect(service.get(review.attemptId).status).toBe("approved"));
        expect(() => service.reserve(review.attemptId, httpsConfig)).toThrow("does not match");
        expect(service.reserve(review.attemptId, pinned).token).toBe("pear-token");
        expect(() => service.acceptCertificate(review.attemptId, sha256)).toThrow("unavailable");
      } finally { await service.dispose(); }
    });

    it("reuses a matching accepted certificate and asks again when it changes", async () => {
      const { service, approvals } = certificateService(presented);
      try {
        const same = await service.begin({ ...httpsConfig, trustedCertificate: { sha256, pem } });
        expect(same).toMatchObject({ status: "pending", certificate: null });
        expect(approvals).toHaveLength(1);
        const changed = await service.begin({ ...httpsConfig, trustedCertificate: { sha256: otherSha256, pem } });
        expect(changed).toMatchObject({ status: "certificate-review", certificate: { sha256, replacesTrusted: true } });
        expect(approvals).toHaveLength(1);
      } finally { await service.dispose(); }
    });

    it("drops a stale pin when the certificate is already trusted by the system", async () => {
      const { service, approvals } = certificateService({ ...presented, authorized: true });
      try {
        await expect(service.begin({ ...httpsConfig, trustedCertificate: { sha256: otherSha256, pem } })).resolves.toMatchObject({ status: "pending", configuration: httpsConfig });
        expect(approvals).toEqual([{ config: httpsConfig }]);
      } finally { await service.dispose(); }
    });

    it("expires an unanswered certificate review", async () => {
      let now = 1_000;
      const service = new PearPairingService({ ...hermeticTls,
        identityStore: { getSecret: async () => "stable-client", setSecret: async () => undefined },
        inspectCertificate: async () => presented, requestApproval: async () => new Promise(() => {}), now: () => now
      });
      try {
        const review = await service.begin(httpsConfig);
        now += 60_000;
        expect(service.get(review.attemptId)).toMatchObject({ status: "expired", certificate: null });
        expect(() => service.acceptCertificate(review.attemptId, sha256)).toThrow("unavailable");
      } finally { await service.dispose(); }
    });
  });
});
