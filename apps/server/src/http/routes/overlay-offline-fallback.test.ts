import { runInNewContext } from "node:vm";
import { overlayOfflineFallback } from "@stream-jams/core";
import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import {
  overlayOfflineFallbackHtml,
  overlayOfflineWorker,
  overlayOfflineWorkerSource,
  registerOverlayOfflineFallbackRoutes,
  type OverlayOfflineWorkerScope
} from "./overlay-offline-fallback.js";

type Listener = (event: never) => void;

function createScope(network: (url: string) => Promise<Response>, cacheNames: string[] = []) {
  const listeners = new Map<string, Listener>();
  const stores = new Map<string, Map<string, Response>>(cacheNames.map(name => [name, new Map()]));
  const deleted: string[] = [];
  const networkRequests: string[] = [];
  let skipped = false;
  const scope: OverlayOfflineWorkerScope = {
    addEventListener: (type, listener) => { listeners.set(type, listener as Listener); },
    caches: {
      open: async (name) => {
        const store = stores.get(name) ?? new Map<string, Response>();
        stores.set(name, store);
        return { add: async (url) => { store.set(url, new Response(`stored ${url}`)); } };
      },
      keys: async () => [...stores.keys()],
      delete: async (name) => { deleted.push(name); return stores.delete(name); },
      match: async (url, { cacheName }) => stores.get(cacheName)?.get(url)?.clone()
    },
    fetch: async (request) => { networkRequests.push(request.url); return network(request.url); },
    skipWaiting: async () => { skipped = true; }
  };
  const extend = async (type: "install" | "activate") => {
    let work: Promise<unknown> | undefined;
    listeners.get(type)!({ waitUntil: (promise: Promise<unknown>) => { work = promise; } } as never);
    await work;
  };
  const navigate = (url: string, init: { mode?: string; method?: string } = {}): Promise<Response> | null => {
    let response: Promise<Response> | null = null;
    listeners.get("fetch")!({ request: { mode: init.mode ?? "navigate", method: init.method ?? "GET", url }, respondWith: (value: Promise<Response>) => { response = value; } } as never);
    return response;
  };
  return { scope, stores, deleted, networkRequests, extend, navigate, skipped: () => skipped };
}

const overlayUrl = "http://127.0.0.1:39187/overlay/modules/alerts/live/ovl_secretKey?profile=landscape";
const refused = () => Promise.reject(new TypeError("Failed to fetch"));

describe("overlay offline worker", () => {
  it("stores only the key-free fallback on install and takes over without waiting", async () => {
    const worker = createScope(refused);
    overlayOfflineWorker(worker.scope, overlayOfflineFallback);
    await worker.extend("install");
    expect([...worker.stores.entries()].map(([name, store]) => [name, [...store.keys()]]))
      .toEqual([[overlayOfflineFallback.cacheName, [overlayOfflineFallback.fallbackPath]]]);
    expect(worker.skipped()).toBe(true);
  });

  it("deletes only older offline caches on activate", async () => {
    const worker = createScope(refused, ["stream-jams-overlay-offline-v0", overlayOfflineFallback.cacheName, "another-app-cache"]);
    overlayOfflineWorker(worker.scope, overlayOfflineFallback);
    await worker.extend("activate");
    expect(worker.deleted).toEqual(["stream-jams-overlay-offline-v0"]);
    expect([...worker.stores.keys()]).toEqual([overlayOfflineFallback.cacheName, "another-app-cache"]);
  });

  it("passes every network response through, including the transparent key rejection", async () => {
    const live = new Response("live shell", { status: 200 });
    const rejected = new Response("", { status: 401 });
    const worker = createScope(async url => url.includes("ovl_secretKey") ? live : rejected);
    overlayOfflineWorker(worker.scope, overlayOfflineFallback);
    await worker.extend("install");
    expect(await worker.navigate(overlayUrl)).toBe(live);
    expect(await worker.navigate("http://127.0.0.1:39187/overlay/modules/alerts/live/ovl_revoked")).toBe(rejected);
    // Forwarding never adds the keyed response to the cache.
    expect([...worker.stores.get(overlayOfflineFallback.cacheName)!.keys()]).toEqual([overlayOfflineFallback.fallbackPath]);
  });

  it("answers a failed overlay navigation with the stored fallback, or a network error when none is stored", async () => {
    const worker = createScope(refused);
    overlayOfflineWorker(worker.scope, overlayOfflineFallback);
    const withoutCache = await worker.navigate(overlayUrl);
    expect(withoutCache?.type).toBe("error");
    await worker.extend("install");
    expect(await (await worker.navigate(overlayUrl))!.text()).toBe(`stored ${overlayOfflineFallback.fallbackPath}`);
    expect(worker.networkRequests).toEqual([overlayUrl, overlayUrl]);
  });

  it("ignores non-navigations, other methods and every path outside overlay module routes", () => {
    const worker = createScope(refused);
    overlayOfflineWorker(worker.scope, overlayOfflineFallback);
    expect(worker.navigate(overlayUrl, { mode: "cors" })).toBeNull();
    expect(worker.navigate(overlayUrl, { method: "POST" })).toBeNull();
    for (const path of ["/manage", "/operator", "/overlay/offline-fallback", "/overlay/unified/live/ovl_x", "/assets/index.js", "/overlay-modules/alerts/config"]) {
      expect(worker.navigate(`http://127.0.0.1:39187${path}`)).toBeNull();
    }
    expect(worker.networkRequests).toEqual([]);
  });

  it("serves self-contained source that runs with only the worker globals", async () => {
    const worker = createScope(refused);
    runInNewContext(overlayOfflineWorkerSource, { self: worker.scope, URL, Response });
    await worker.extend("install");
    expect(await (await worker.navigate(overlayUrl))!.text()).toBe(`stored ${overlayOfflineFallback.fallbackPath}`);
    expect(worker.navigate("http://127.0.0.1:39187/manage")).toBeNull();
  });
});

describe("overlay offline routes", () => {
  it("serves the worker as uncached JavaScript under the overlay scope", async () => {
    const app = Fastify();
    registerOverlayOfflineFallbackRoutes(app);
    try {
      const response = await app.inject({ url: overlayOfflineFallback.workerPath });
      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toBe("text/javascript; charset=utf-8");
      expect(response.headers["cache-control"]).toBe("no-cache");
      // A worker CSP would also govern the worker's own fetch, so none is sent.
      expect(response.headers["content-security-policy"]).toBeUndefined();
      expect(response.body).toBe(overlayOfflineWorkerSource);
      expect(overlayOfflineFallback.workerPath.startsWith(overlayOfflineFallback.scope)).toBe(true);
    } finally { await app.close(); }
  });

  it("serves a transparent, script-free, self-refreshing fallback page", async () => {
    const app = Fastify();
    registerOverlayOfflineFallbackRoutes(app);
    try {
      const response = await app.inject({ url: overlayOfflineFallback.fallbackPath });
      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toBe("text/html; charset=utf-8");
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(response.headers["content-security-policy"]).toBe("default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'");
      expect(response.body).toBe(overlayOfflineFallbackHtml);
      expect(response.body).toContain('<meta http-equiv="refresh" content="2">');
      expect(response.body).toContain("background:transparent");
      expect(response.body).not.toMatch(/<script|ovl_|<body>[^<]/u);
    } finally { await app.close(); }
  });
});
