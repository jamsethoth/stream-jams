import type { FastifyRequest, preHandlerHookHandler } from "fastify";
import { sendHttpError } from "../errors.js";
import { extractBearerToken } from "./management-bearer-token.js";
import type { LocalManagementRateLimiter } from "./local-management-rate-limit.js";

interface TimerAutomationSecurityLogger {
  warn(message: string, context: {
    readonly module: string;
    readonly source: string;
    readonly correlationId: string;
    readonly processingId: null;
    readonly metadata: Record<string, unknown>;
  }): Promise<void>;
}

interface TimerAutomationSecurityOptions {
  readonly credentials: { verify(token: string): boolean };
  readonly limiter: LocalManagementRateLimiter;
  readonly logger?: TimerAutomationSecurityLogger;
}

export function createTimerAutomationSecurityPreHandler(
  options: TimerAutomationSecurityOptions
): preHandlerHookHandler {
  return async (request, reply) => {
    if (!isLoopback(request.ip)) {
      await logRejection(options.logger, request, "timer-automation.loopback.rejected");
      return sendHttpError(reply, 403, {
        code: "TIMER_AUTOMATION_LOOPBACK_REQUIRED",
        message: "Timer automation is available only from this computer"
      });
    }

    if (request.headers.origin !== undefined) {
      await logRejection(options.logger, request, "timer-automation.origin.rejected");
      return sendHttpError(reply, 403, {
        code: "TIMER_AUTOMATION_ORIGIN_FORBIDDEN",
        message: "Browser-origin requests cannot use timer automation"
      });
    }

    const decision = options.limiter.consume({
      clientId: request.ip,
      routeId: `${request.method} ${request.routeOptions.url ?? "/automation/timers"}`
    });
    if (!decision.allowed) {
      reply.header("retry-after", decision.retryAfterSeconds.toString());
      return sendHttpError(reply, 429, {
        code: "TIMER_AUTOMATION_RATE_LIMITED",
        message: "Too many timer automation requests",
        retryAfterSeconds: decision.retryAfterSeconds
      });
    }

    const bearer = extractBearerToken(request.headers.authorization);
    if (bearer === null || !options.credentials.verify(bearer)) {
      await logRejection(options.logger, request, "timer-automation.credential.rejected");
      return sendHttpError(reply, 401, {
        code: "TIMER_AUTOMATION_UNAUTHORIZED",
        message: "A valid timer automation bearer token is required"
      });
    }
  };
}

function isLoopback(address: string): boolean {
  return address === "127.0.0.1"
    || address === "::1"
    || address === "0:0:0:0:0:0:0:1"
    || address === "::ffff:127.0.0.1";
}

async function logRejection(
  logger: TimerAutomationSecurityLogger | undefined,
  request: FastifyRequest,
  source: string
): Promise<void> {
  await logger?.warn("Timer automation request rejected", {
    module: "timer-automation-security",
    source,
    correlationId: String(request.id),
    processingId: null,
    metadata: {
      method: request.method,
      route: request.routeOptions.url ?? "/automation/timers",
      peer: request.ip
    }
  });
}
