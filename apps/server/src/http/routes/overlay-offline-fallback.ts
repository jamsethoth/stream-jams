import { overlayOfflineFallback } from "@stream-jams/core";
import type { FastifyInstance } from "fastify";

export type OverlayOfflineWorkerConfig = Pick<typeof overlayOfflineFallback, "fallbackPath" | "navigationPrefix" | "cachePrefix" | "cacheName">;

interface OfflineWorkerEvents {
  readonly install: { waitUntil(work: Promise<unknown>): void };
  readonly activate: { waitUntil(work: Promise<unknown>): void };
  readonly fetch: { readonly request: Pick<Request, "mode" | "method" | "url">; respondWith(response: Promise<Response>): void };
}

/** The subset of ServiceWorkerGlobalScope the overlay worker uses; the server lib has no WebWorker types. */
export interface OverlayOfflineWorkerScope {
  addEventListener<K extends keyof OfflineWorkerEvents>(type: K, listener: (event: OfflineWorkerEvents[K]) => void): void;
  readonly caches: {
    open(name: string): Promise<{ add(url: string): Promise<void> }>;
    keys(): Promise<string[]>;
    delete(name: string): Promise<boolean>;
    match(url: string, options: { readonly cacheName: string }): Promise<Response | undefined>;
  };
  fetch(request: OfflineWorkerEvents["fetch"]["request"]): Promise<Response>;
  skipWaiting(): Promise<void>;
}

/**
 * Runs in the browser's service worker, served through `toString()`, so it must not close over module scope.
 * Only a network failure on an overlay navigation gets the stored fallback; every HTTP response passes through.
 */
export function overlayOfflineWorker(scope: OverlayOfflineWorkerScope, config: OverlayOfflineWorkerConfig): void {
  scope.addEventListener("install", (event) => {
    event.waitUntil(scope.caches.open(config.cacheName)
      .then((cache) => cache.add(config.fallbackPath))
      .then(() => scope.skipWaiting()));
  });
  scope.addEventListener("activate", (event) => {
    event.waitUntil(scope.caches.keys().then((names) => Promise.all(names
      .filter((name) => name.startsWith(config.cachePrefix) && name !== config.cacheName)
      .map((name) => scope.caches.delete(name)))));
  });
  scope.addEventListener("fetch", (event) => {
    const { request } = event;
    if (request.mode !== "navigate" || request.method !== "GET" || !new URL(request.url).pathname.startsWith(config.navigationPrefix)) return;
    event.respondWith(scope.fetch(request).catch(
      // error-provenance: allow expected -- a refused overlay navigation is the outage this fallback answers
      async () => (await scope.caches.match(config.fallbackPath, { cacheName: config.cacheName })) ?? Response.error()));
  });
}

const { fallbackPath, navigationPrefix, cachePrefix, cacheName } = overlayOfflineFallback;
const workerConfig: OverlayOfflineWorkerConfig = { fallbackPath, navigationPrefix, cachePrefix, cacheName };
export const overlayOfflineWorkerSource = `"use strict";\n(${overlayOfflineWorker.toString()})(self, ${JSON.stringify(workerConfig)});\n`;

// No script: a meta refresh is an ordinary reload, so the worker handles it until Stream Jams answers again.
export const overlayOfflineFallbackHtml = '<!doctype html><html><head><meta http-equiv="refresh" content="2"><style>html,body{margin:0;background:transparent}</style></head><body></body></html>';

export function registerOverlayOfflineFallbackRoutes(app: FastifyInstance): void {
  app.get(overlayOfflineFallback.workerPath, async (_request, reply) => reply
    .header("cache-control", "no-cache")
    .type("text/javascript; charset=utf-8")
    .send(overlayOfflineWorkerSource));
  app.get(overlayOfflineFallback.fallbackPath, async (_request, reply) => reply
    .header("cache-control", "no-store")
    .header("referrer-policy", "no-referrer")
    .header("content-security-policy", "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'")
    .type("text/html; charset=utf-8")
    .send(overlayOfflineFallbackHtml));
}
