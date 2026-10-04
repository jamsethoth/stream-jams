import type { FastifyRequest, FastifyReply, preHandlerHookHandler } from "fastify";
import type { AutomationCredentialService, AutomationGrant, AutomationScope } from "../../modules/automation/automation-credential-service.js";
import { sendHttpError } from "../errors.js";
import { extractBearerToken } from "./management-bearer-token.js";
import type { LocalManagementRateLimiter } from "./local-management-rate-limit.js";
const grants = new WeakMap<FastifyRequest, AutomationGrant>();
export function getAutomationGrant(request: FastifyRequest): AutomationGrant { const grant = grants.get(request); if (!grant) throw new Error("Automation authentication prehandler is required"); return grant; }
export function createAutomationMachinePreHandler(options: { readonly limiter: LocalManagementRateLimiter }): preHandlerHookHandler {
  return async (request, reply) => {
    if (!["127.0.0.1", "::1", "::ffff:127.0.0.1", "0:0:0:0:0:0:0:1"].includes(request.ip)) return sendHttpError(reply, 403, { code: "AUTOMATION_LOOPBACK_REQUIRED", message: "Automation requires a loopback peer" });
    if (request.headers.origin !== undefined) return sendHttpError(reply, 403, { code: "AUTOMATION_ORIGIN_FORBIDDEN", message: "Automation does not accept browser origins" });
    if (!/^(?:localhost|127\.0\.0\.1|\[::1\])(?::(?:[1-9][0-9]{0,4}))?$/u.test(request.headers.host ?? "") || Number((request.headers.host ?? "").match(/:(\d+)$/u)?.[1] ?? 1) > 65535) return sendHttpError(reply, 403, { code: "AUTOMATION_HOST_FORBIDDEN", message: "Automation requires a loopback Host" });
    const decision = options.limiter.consume({ clientId: request.ip, routeId: "automation-v1" });
    if (!decision.allowed) { reply.header("retry-after", String(decision.retryAfterSeconds)); return sendHttpError(reply, 429, { code: "AUTOMATION_RATE_LIMITED", message: "Too many automation requests", retryAfterSeconds: decision.retryAfterSeconds }); }
  };
}
export function createAutomationSecurityPreHandler(options: { readonly credentials: Pick<AutomationCredentialService, "verify">; readonly limiter: LocalManagementRateLimiter; readonly requiredScopes?: readonly AutomationScope[] }): preHandlerHookHandler {
  const machine = createAutomationMachinePreHandler(options);
  return async (request, reply) => {
    await (machine as (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>)(request, reply);
    if (reply.sent) return;
    const bearer = extractBearerToken(request.headers.authorization); const grant = bearer === null ? null : options.credentials.verify(bearer);
    if (grant === null) return sendHttpError(reply, 401, { code: "AUTOMATION_UNAUTHORIZED", message: "A valid scoped automation credential is required" });
    if (options.requiredScopes?.some(scope => !grant.scopes.includes(scope))) return sendHttpError(reply, 403, { code: "AUTOMATION_SCOPE_REQUIRED", message: "The automation grant lacks required scopes" });
    grants.set(request, grant);
  };
}
