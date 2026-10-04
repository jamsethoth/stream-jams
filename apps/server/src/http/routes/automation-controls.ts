import { z } from "zod";
import type { FastifyInstance, FastifyReply, preHandlerHookHandler } from "fastify";
import { AutomationControlError, type AutomationCommand } from "../../modules/automation/automation-control-service.js";
import { TimerGenerationConflictError } from "../../modules/timers/timer-runtime-coordinator.js";
import { RuntimeMaintenanceUnavailableError } from "../../modules/backup/runtime-maintenance-gate.js";
import { PlaybackOperationsConflictError, UnknownPlaybackOwnerError } from "../../modules/playback/playback-operations-service.js";
import { getAutomationGrant } from "../middleware/automation-security.js";
import type { AutomationGrant } from "../../modules/automation/automation-credential-service.js";
import { sendHttpError } from "../errors.js";
export interface AutomationControlRouteDependencies {
 readonly automationAuthPreHandler:preHandlerHookHandler;
 readonly automationControlService:{capabilities(grant:AutomationGrant):unknown;snapshot(grant:AutomationGrant):unknown;command(grant:AutomationGrant,command:AutomationCommand):Promise<unknown>};
}
const id=z.string().min(1).max(120).regex(/^[A-Za-z0-9_-]+$/u);
const generation=z.string().min(1).max(200);
const guard=z.object({observedRuntimeId:z.string().min(1).max(200)}).strict();
const moduleId=z.enum(["alerts","screen-effects"]);
export function registerAutomationControlRoutes(app:FastifyInstance,d:AutomationControlRouteDependencies):void {
 const options={preHandler:d.automationAuthPreHandler,bodyLimit:4096};
 app.get("/automation/v1/capabilities",options,async(req,reply)=>{reply.header("cache-control","no-store");return d.automationControlService.capabilities(getAutomationGrant(req));});
 app.get("/automation/v1/state",options,async(req,reply)=>{reply.header("cache-control","no-store");return d.automationControlService.snapshot(getAutomationGrant(req));});
 const dispatch=(reply:FastifyReply,work:()=>Promise<unknown>)=>work().catch((error:unknown)=>sendError(reply,error));
 for(const kind of ["activate","reset","stop","adjust"] as const) {
  app.post(`/automation/v1/timers/:timerId/${kind}`,options,async(req,reply)=>dispatch(reply,async()=>{
   const timerId=z.object({timerId:id}).parse(req.params).timerId;
   if(kind==="activate")return d.automationControlService.command(getAutomationGrant(req),{kind,timerId,...guard.extend({expectedGeneration:generation.nullable()}).parse(req.body)});
   if(kind==="adjust")return d.automationControlService.command(getAutomationGrant(req),{kind,timerId,...guard.extend({expectedGeneration:generation,action:z.enum(["increment","decrement"]),amountMs:z.number().int().positive().max(2592000000)}).parse(req.body)});
   return d.automationControlService.command(getAutomationGrant(req),{kind,timerId,...guard.extend({expectedGeneration:generation}).parse(req.body)});
  }));
 }
 app.post("/automation/v1/timers/toggle-pause",options,async(req,reply)=>dispatch(reply,async()=>d.automationControlService.command(getAutomationGrant(req),{kind:"toggle-timers",...guard.parse(req.body)})));
 for(const kind of ["toggle-pause","skip","clear"] as const){
  app.post(`/automation/v1/playback/:moduleId/${kind}`,options,async(req,reply)=>dispatch(reply,async()=>{
   const target=z.object({moduleId}).parse(req.params).moduleId;
   if(kind==="skip")return d.automationControlService.command(getAutomationGrant(req),{kind,moduleId:target,...guard.extend({expectedOccurrenceId:z.string().min(1).max(256).nullable()}).parse(req.body)});
   if(kind==="clear")return d.automationControlService.command(getAutomationGrant(req),{kind,moduleId:target,...guard.extend({expectedQueueRevision:z.string().regex(/^[a-f0-9]{64}$/u),expectedPendingCount:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)}).parse(req.body)});
   return d.automationControlService.command(getAutomationGrant(req),{kind,moduleId:target,...guard.parse(req.body)});
  }));
 }
 app.post("/automation/v1/playback/toggle-mute",options,async(req,reply)=>dispatch(reply,async()=>d.automationControlService.command(getAutomationGrant(req),{kind:"toggle-mute",...guard.extend({moduleIds:z.array(moduleId).min(1).max(2).refine(ids=>new Set(ids).size===ids.length)}).parse(req.body)})));
}
function sendError(reply:FastifyReply,error:unknown):FastifyReply {
 if(error instanceof AutomationControlError)return sendHttpError(reply,error.statusCode,{code:error.code,message:error.message});
 if(error instanceof z.ZodError)return sendHttpError(reply,400,{code:"AUTOMATION_INVALID_INPUT",message:"Invalid automation command. Refresh the connection and check action settings."});
 if(error instanceof TimerGenerationConflictError||error instanceof PlaybackOperationsConflictError)return sendHttpError(reply,409,{code:"AUTOMATION_STATE_CONFLICT",message:"The target changed. Refresh before issuing another command."});
 if(error instanceof RuntimeMaintenanceUnavailableError)return sendHttpError(reply,409,{code:"AUTOMATION_MAINTENANCE_ACTIVE",message:"Configuration maintenance is active. Wait and refresh."});
 if(error instanceof UnknownPlaybackOwnerError)return sendHttpError(reply,404,{code:"AUTOMATION_MODULE_NOT_FOUND",message:"Playback module not found."});
 throw error;
}
