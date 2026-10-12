import Fastify from "fastify";
import { expect, it } from "vitest";
import { DataOverlayService, DataTemplateService } from "@stream-jams/core";
import { createInMemoryStreamJamsDatabase } from "../../modules/db/database.js";
import { SqliteDataOverlayRepository } from "../../modules/data-overlays/sqlite-data-overlay-repository.js";
import { SqliteDataTemplateRepository } from "../../modules/data-overlays/sqlite-data-template-repository.js";
import { LocalManagementSessionService } from "../../modules/auth/management-session-service.js";
import { createTestManagementSecurity, managementTestHeaders } from "../test-support/management-security-fixture.js";
import { registerDataOverlayRoutes } from "./data-overlays.js";

it("protects template routes, creates atomically, saves sanitized copies and flattens insertion", async () => {
  const db = createInMemoryStreamJamsDatabase(); let id=0;
  const options={generateId:()=>`id-${++id}`,now:()=>"2026-10-08T00:00:00Z"};
  const overlays=new DataOverlayService(new SqliteDataOverlayRepository(db),options);
  const templates=new DataTemplateService(new SqliteDataTemplateRepository(db),overlays,options);
  const sessions=new LocalManagementSessionService();const session=await sessions.createSession(); const headers=managementTestHeaders(session,"POST");const app=Fastify();
  registerDataOverlayRoutes(app,{dataOverlayService:overlays,dataTemplateService:templates,managementAuthPreHandler:createTestManagementSecurity(sessions),managementRateLimitPreHandler:(_req,_reply,done)=>done()});
  try {
    expect((await app.inject({url:"/data-overlays/templates"})).statusCode).toBe(401);
    const get=await app.inject({url:"/data-overlays/templates",headers:managementTestHeaders(session)});expect(get.statusCode).toBe(200);expect(get.json().templates).toHaveLength(4);
    const input={name:"Goal canvas",enabled:false,order:0,outputs:{browser:true,desktop:false},mappings:[{slotId:"goal",mapping:{kind:"new-goal",value:{kind:"new",definition:{name:"Count",kind:"integer",resetDefault:0,resetGroupId:null}},goal:{name:"Goal",mode:"fixed-target",target:100}}}]};
    expect((await app.inject({method:"POST",url:"/data-overlays/templates/goal-bar/instantiate",headers:managementTestHeaders(session),payload:input})).statusCode).toBe(403);
    const created=await app.inject({method:"POST",url:"/data-overlays/templates/goal-bar/instantiate",headers,payload:input});expect(created.statusCode,created.body).toBe(201);
    const state=created.json();expect(state.values).toHaveLength(1);expect(state.goals).toHaveLength(1);
    const failed=await app.inject({method:"POST",url:"/data-overlays/templates/goal-bar/instantiate",headers,payload:{...input,name:"Bad",mappings:[]}});expect(failed.statusCode).toBe(400);expect(overlays.getState()).toEqual(state);
    const saved=await app.inject({method:"POST",url:"/data-overlays/templates/save",headers,payload:{name:"Saved",canvasId:state.canvases[0].id}});expect(saved.statusCode,saved.body).toBe(201);
    const template=saved.json().templates.find((t:{origin:string})=>t.origin==="user");
    const inserted=await app.inject({method:"POST",url:`/data-overlays/templates/${template.id}/insert`,headers,payload:{canvasId:state.canvases[0].id,x:600,y:0,mappings:[{slotId:template.slots[0].id,mapping:{kind:"goal",goalId:state.goals[0].id}}]}});expect(inserted.statusCode,inserted.body).toBe(200);expect(inserted.json().canvases[0].elements).toHaveLength(state.canvases[0].elements.length*2);
    expect((await app.inject({method:"DELETE",url:"/data-overlays/templates/goal-bar",headers})).statusCode).toBe(400);
    expect((await app.inject({method:"DELETE",url:`/data-overlays/templates/${template.id}`,headers})).statusCode).toBe(200);
    const source=overlays.createTwitchFollowerValue("Followers","account").values.find(v=>v.source)!;
    const sourceCanvas=templates.instantiate("counter-badge",{name:"Followers canvas",enabled:false,order:0,outputs:{browser:true,desktop:false},mappings:[{slotId:"count",mapping:{kind:"value",valueId:source.id}}]}).canvases.find(c=>c.name==="Followers canvas")!;
    const providerTemplate=templates.save({name:"Provider",canvasId:sourceCanvas.id}).templates.find(t=>t.name==="Provider")!;
    const unavailable=await app.inject({method:"POST",url:`/data-overlays/templates/${providerTemplate.id}/instantiate`,headers,payload:{...input,name:"Unavailable",mappings:[{slotId:providerTemplate.slots[0]!.id,mapping:{kind:"value",valueId:source.id}}]}});
    expect(unavailable.statusCode).toBe(409);expect(unavailable.json().error.code).toBe("DATA_SOURCE_NOT_READY");
  } finally {await app.close();db.close();}
});
