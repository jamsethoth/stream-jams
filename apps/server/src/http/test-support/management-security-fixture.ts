import type { ManagementSession, ManagementSessionService } from "@stream-jams/core";
import type { preHandlerHookHandler } from "fastify";
import { createManagementSecurityPreHandler } from "../middleware/management-security.js";

export const testManagementOrigin = "http://127.0.0.1:39187";

export function createTestManagementSecurity(
  sessionService: Pick<ManagementSessionService, "verifySession">
): preHandlerHookHandler {
  return createManagementSecurityPreHandler({
    sessionService,
    originPolicy: { allowedOrigins: new Set([testManagementOrigin]) }
  });
}

export function managementTestHeaders(
  session: Pick<ManagementSession, "id" | "csrfToken">,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" = "GET"
): Record<string, string> {
  return {
    origin: testManagementOrigin,
    authorization: `Bearer ${session.id}`,
    ...((method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE")
      ? { "x-stream-jams-csrf": session.csrfToken }
      : {})
  };
}
