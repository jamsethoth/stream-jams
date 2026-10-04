import { describe, expect, it, vi } from "vitest";
import { PearPairingService } from "./pear-pairing-service.js";
import { createServer } from "node:http";

const config = { baseUrl: "http://127.0.0.1:26538", transport: "auto" } as const;

function setup(response: Promise<{ status: number; body: unknown }>) {
  const secrets = new Map<string, string>();
  const service = new PearPairingService({
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
    const first = new PearPairingService({
      identityStore, generateClientId: () => "stable-client-id", generateId: () => "attempt-first",
      requestApproval: async (url) => { urls.push(url.toString()); return { status: 302, body: { accessToken: "redirect-token" } }; }
    });
    const attempt = await first.begin(config);
    await vi.waitFor(() => expect(first.get(attempt.attemptId).status).toBe("denied"));
    await first.dispose();
    const second = new PearPairingService({
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
      const service = new PearPairingService({
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
    const service = new PearPairingService({
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
    const service = new PearPairingService({
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
});
