import { describe, expect, it } from "vitest";
import { createServerApp } from "../../app.js";
import { LocalManagementSessionService } from "../../modules/auth/management-session-service.js";
import { DiagnosticsLimitError, type DiagnosticsExport, type DiagnosticsView } from "../../modules/diagnostics/diagnostics-service.js";
import {
  createLocalManagementRateLimitPreHandler,
  LocalManagementRateLimiter
} from "../middleware/local-management-rate-limit.js";
import { createManagementAuthPreHandler } from "../middleware/management-auth.js";

describe("diagnostics routes", () => {
  it("returns diagnostics views and redacted export data for management sessions", async () => {
    const { app, authHeaders, service } = await createAppWithDiagnostics();

    const listResponse = await app.inject({
      method: "GET",
      url: "/diagnostics?limit=2",
      headers: authHeaders
    });
    const exportResponse = await app.inject({
      method: "GET",
      url: "/diagnostics/export?limit=2",
      headers: authHeaders
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toEqual(createDiagnosticsView());
    expect(exportResponse.statusCode).toBe(200);
    expect(exportResponse.json()).toEqual(createDiagnosticsExport());
    expect(service.diagnosticsLimits).toEqual([2]);
    expect(service.exportLimits).toEqual([2]);
  });

  it("rejects missing management sessions before diagnostics work", async () => {
    const { app, service } = await createAppWithDiagnostics();

    const response = await app.inject({
      method: "GET",
      url: "/diagnostics"
    });

    expect(response.statusCode).toBe(401);
    expect(service.diagnosticsLimits).toEqual([]);
    expect(service.exportLimits).toEqual([]);
  });

  it("returns controlled 400 responses for malformed and out-of-range limits", async () => {
    const { app, authHeaders, service } = await createAppWithDiagnostics({ throwLimitError: true });

    const malformedResponse = await app.inject({
      method: "GET",
      url: "/diagnostics?limit=abc",
      headers: authHeaders
    });
    const outOfRangeResponse = await app.inject({
      method: "GET",
      url: "/diagnostics/export?limit=999",
      headers: authHeaders
    });

    expect(malformedResponse.statusCode).toBe(400);
    expect(malformedResponse.json()).toEqual({
      error: {
        code: "INVALID_DIAGNOSTICS_LIMIT",
        message: "Invalid diagnostics limit"
      }
    });
    expect(outOfRangeResponse.statusCode).toBe(400);
    expect(outOfRangeResponse.json()).toEqual({
      error: {
        code: "INVALID_DIAGNOSTICS_LIMIT",
        message: "Diagnostics limit must be a positive integer no greater than 200"
      }
    });
    expect(service.diagnosticsLimits).toEqual([]);
    expect(service.exportLimits).toEqual([999]);
  });
});

async function createAppWithDiagnostics(options: { readonly throwLimitError?: boolean | undefined } = {}) {
  const service = new RecordingDiagnosticsService(options);
  const managementSessionService = new LocalManagementSessionService({
    clock: () => new Date("2026-05-31T02:00:00.000Z"),
    generateId: () => "mgmt_diagnostics-session",
    sessionTtlMs: 60_000
  });
  const session = await managementSessionService.createSession();
  const managementRateLimiter = new LocalManagementRateLimiter({
    maxRequests: 100,
    windowMs: 60_000,
    clock: () => new Date("2026-05-31T02:00:00.000Z")
  });
  const app = createServerApp({
    metadata: {
      appName: "stream-jams",
      version: "1.2.3"
    },
    diagnosticsService: service,
    managementAuthPreHandler: createManagementAuthPreHandler({ sessionService: managementSessionService }),
    managementRateLimitPreHandler: createLocalManagementRateLimitPreHandler({ limiter: managementRateLimiter })
  });

  return {
    app,
    service,
    authHeaders: {
      authorization: `Bearer ${session.id}`
    }
  };
}

class RecordingDiagnosticsService {
  readonly diagnosticsLimits: Array<number | undefined> = [];
  readonly exportLimits: Array<number | undefined> = [];
  readonly #throwLimitError: boolean;

  constructor(options: { readonly throwLimitError?: boolean | undefined }) {
    this.#throwLimitError = options.throwLimitError === true;
  }

  async getDiagnostics(options: { readonly limit?: number | undefined } = {}): Promise<DiagnosticsView> {
    this.diagnosticsLimits.push(options.limit);
    return createDiagnosticsView();
  }

  async createExport(options: { readonly limit?: number | undefined } = {}): Promise<DiagnosticsExport> {
    this.exportLimits.push(options.limit);
    if (this.#throwLimitError) {
      throw new DiagnosticsLimitError(200);
    }

    return createDiagnosticsExport();
  }
}

function createDiagnosticsView(): DiagnosticsView {
  return {
    eventLogs: [
      {
        id: "event-log-1",
        eventId: "event-1",
        providerId: "twitch",
        eventType: "follow",
        actorDisplayName: "Viewer",
        status: "processed",
        receivedAt: "2026-05-31T02:00:00.000Z",
        correlationId: "correlation-1",
        processingId: "processing-1",
        errorMessage: null
      }
    ],
    alertMatchLogs: [
      {
        id: "match-log-1",
        sourceEventId: "event-1",
        ruleId: "rule-1",
        variantId: "variant-1",
        matchedAt: "2026-05-31T02:00:01.000Z",
        correlationId: "correlation-1",
        processingId: "processing-1"
      }
    ],
    playbackLogs: [
      {
        id: "playback-log-1",
        queueItemId: "queue-item-1",
        sourceEventId: "event-1",
        alertIds: ["resolved-alert-1"],
        status: "queued",
        occurredAt: "2026-05-31T02:00:02.000Z",
        correlationId: "correlation-1",
        processingId: "processing-1",
        message: null
      }
    ],
    providerErrors: []
  };
}

function createDiagnosticsExport(): DiagnosticsExport {
  return {
    generatedAt: "2026-05-31T02:05:00.000Z",
    ...createDiagnosticsView(),
    rawEventLogs: []
  };
}
