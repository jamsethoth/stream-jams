import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { registerAutomationControlRoutes } from "./automation-controls.js";
import { createAutomationSecurityPreHandler } from "../middleware/automation-security.js";
import { LocalManagementRateLimiter } from "../middleware/local-management-rate-limit.js";

describe("automation control routes",()=>{
 it("rejects management credentials, Origin and unknown command fields before dispatch",async()=>{
  const app=Fastify();let calls=0;
  const grant={id:"install",clientName:"Deck",scopes:["timers:read","timers:control"] as const,createdAt:new Date(0).toISOString(),revokedAt:null};
  registerAutomationControlRoutes(app,{automationAuthPreHandler:createAutomationSecurityPreHandler({credentials:{verify:token=>token==="native"?grant:null},limiter:new LocalManagementRateLimiter({maxRequests:100,windowMs:60000})}),automationControlService:{capabilities:()=>({}),snapshot:()=>({}),command:async()=>{calls++;return{};}}});
  const url="/automation/v1/timers/one/activate";const payload={observedRuntimeId:"runtime",expectedGeneration:null};
  expect((await app.inject({method:"POST",url,payload,headers:{authorization:"Bearer management"}})).statusCode).toBe(401);
  expect((await app.inject({method:"POST",url,payload,headers:{authorization:"Bearer native",origin:"http://localhost"}})).statusCode).toBe(403);
  expect((await app.inject({method:"POST",url,payload:{...payload,amountMs:12},headers:{authorization:"Bearer native"}})).statusCode).toBe(400);
  expect(calls).toBe(0);
  expect((await app.inject({method:"POST",url,payload,headers:{authorization:"Bearer native"}})).statusCode).toBe(200);
  expect(calls).toBe(1);await app.close();
 });
});
