import { RuntimeMaintenanceUnavailableError } from "../../modules/backup/runtime-maintenance-gate.js";
import { z } from "zod";
import type { FastifyInstance, FastifyReply, preHandlerHookHandler } from "fastify";
import { AutomationCredentialError, proofInputSchema, type AutomationCredentialService } from "../../modules/automation/automation-credential-service.js";
import { getAutomationGrant } from "../middleware/automation-security.js";
import { sendHttpError } from "../errors.js";
export interface AutomationPairingRouteDependencies {
 readonly automationCredentialService: AutomationCredentialService;
 readonly managementAuthPreHandler: preHandlerHookHandler;
 readonly automationMachinePreHandler: preHandlerHookHandler;
 readonly automationAuthPreHandler: preHandlerHookHandler;
}
const emptyBody = z.object({}).strict();
const params = z.object({ pairingId: z.uuid() });
export function registerAutomationPairingRoutes(app: FastifyInstance, d: AutomationPairingRouteDependencies): void {
 const s = d.automationCredentialService;
 const machine = { preHandler: d.automationMachinePreHandler, bodyLimit: 4096 };
 const management = { preHandler: d.managementAuthPreHandler, bodyLimit: 4096 };
 app.post("/automation/v1/pairings", machine, async (req, reply) => { try { return reply.status(201).send(s.createPairing(req.body)); } catch (e) { return error(reply, e); } });
 for (const action of ["status", "exchange"] as const) app.post(`/automation/v1/pairings/:pairingId/${action}`, machine, async (req, reply) => { try { const id = params.parse(req.params).pairingId; const { verifier } = proofInputSchema.parse(req.body); reply.header("cache-control", "no-store"); return action === "status" ? s.pairingStatus(id, verifier) : s.exchange(id, verifier); } catch (e) { return error(reply, e); } });
 app.post("/automation/v1/grants/self/revoke", { preHandler: d.automationAuthPreHandler, bodyLimit: 4096 }, async (req, reply) => { try { emptyBody.parse(req.body ?? {}); return { revoked: s.revoke(getAutomationGrant(req).id) }; } catch (e) { return error(reply, e); } });
 app.get("/api/automation/pairings", management, async () => s.listPairings());
 app.get("/api/automation/pairings/:pairingId", management, async (req, reply) => { try { return s.getPairing(params.parse(req.params).pairingId); } catch (e) { return error(reply, e); } });
 app.post("/api/automation/pairings/:pairingId/approve", management, async (req, reply) => { try { return s.approve(params.parse(req.params).pairingId, req.body); } catch (e) { return error(reply, e); } });
 app.post("/api/automation/pairings/:pairingId/deny", management, async (req, reply) => { try { emptyBody.parse(req.body ?? {}); return s.deny(params.parse(req.params).pairingId); } catch (e) { return error(reply, e); } });
 app.get("/api/automation/grants", management, async () => s.listGrants());
 app.post("/api/automation/grants/:grantId/revoke", management, async (req, reply) => { try { emptyBody.parse(req.body ?? {}); return { revoked: s.revoke(z.object({ grantId: z.uuid() }).parse(req.params).grantId) }; } catch (e) { return error(reply, e); } });
}
function error(reply: FastifyReply, e: unknown): FastifyReply { if (e instanceof RuntimeMaintenanceUnavailableError) return sendHttpError(reply, 409, { code: "AUTOMATION_MAINTENANCE_ACTIVE", message: "Configuration maintenance is active. Wait and refresh." }); if (e instanceof AutomationCredentialError) return sendHttpError(reply, e.statusCode, { code: e.code, message: e.message }); if (e instanceof z.ZodError) return sendHttpError(reply, 400, { code: "AUTOMATION_INVALID_INPUT", message: "Invalid automation input" }); throw e; }
