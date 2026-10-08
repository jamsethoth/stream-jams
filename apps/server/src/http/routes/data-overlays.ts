import { DataOverlayError, dataCanvasInputSchema, dataGoalInputSchema, dataIdSchema, dataResetGroupInputSchema, dataValueCreateInputSchema, dataValueDeltaInputSchema, dataValueSetInputSchema, dataValueUpdateInputSchema, twitchFollowerSourceInputSchema, type DataOverlayService } from "@stream-jams/core";
import { z } from "zod";
import type { FastifyInstance, FastifyReply, preHandlerHookHandler } from "fastify";
import { RuntimeMaintenanceUnavailableError } from "../../modules/backup/runtime-maintenance-gate.js";
import type { TwitchDataSourceRuntime } from "../../modules/twitch/twitch-data-source-runtime.js";
import { dataTemplateSaveInputSchema, dataTemplateInstantiateInputSchema, dataTemplateInsertInputSchema, type DataTemplateService } from "@stream-jams/core";
export interface DataOverlayRouteDependencies {
  readonly dataOverlayService: DataOverlayService;
  readonly twitchDataSourceRuntime?: TwitchDataSourceRuntime;
  readonly dataTemplateService?: DataTemplateService;
  readonly managementAuthPreHandler: preHandlerHookHandler;
  readonly managementRateLimitPreHandler: preHandlerHookHandler;
}
const paramsSchema = z.object({ id: dataIdSchema }).strict();
const empty = z.object({}).strict();
export function registerDataOverlayRoutes(app: FastifyInstance, dependencies: DataOverlayRouteDependencies): void {
  const service = dependencies.dataOverlayService;
  const preHandler = [dependencies.managementRateLimitPreHandler, dependencies.managementAuthPreHandler];
  const handle = async (reply: FastifyReply, work: () => unknown, status = 200) => {
    try { return reply.status(status).send(await work()); } catch (error) {
      if (error instanceof DataOverlayError) return reply.status(error.code === "NOT_FOUND" ? 404 : 409).send({ error: { code: `DATA_${error.code}`, message: error.message, references: error.references, currentValue: error.currentValue } });
      if (error instanceof RuntimeMaintenanceUnavailableError) return reply.status(409).send({ error: { code: "DATA_MAINTENANCE_ACTIVE", message: "Data changes are unavailable during maintenance or shutdown." } });
      if (error instanceof TypeError || error instanceof z.ZodError) return reply.status(400).send({ error: { code: "INVALID_DATA_REQUEST", message: "Invalid data request" } });
      throw error;
    }
  };
  const id = (params: unknown) => paramsSchema.parse(params).id;
  app.get("/data-overlays", { preHandler }, async () => service.getState());
  app.get("/operator/data-overlays", { preHandler }, async () => service.getState());
  if (dependencies.dataTemplateService) {
    const templates = dependencies.dataTemplateService;
    app.get("/data-overlays/templates", { preHandler }, async () => templates.getCatalog());
    app.post("/data-overlays/templates/save", { preHandler }, async (request, reply) => handle(reply, () => templates.save(dataTemplateSaveInputSchema.parse(request.body)), 201));
    app.put("/data-overlays/templates/:id", { preHandler }, async (request, reply) => handle(reply, () => templates.replace(id(request.params), dataTemplateSaveInputSchema.parse(request.body))));
    app.delete("/data-overlays/templates/:id", { preHandler }, async (request, reply) => handle(reply, () => templates.delete(id(request.params))));
    app.post("/data-overlays/templates/:id/instantiate", { preHandler }, async (request, reply) => handle(reply, () => templates.instantiate(id(request.params), dataTemplateInstantiateInputSchema.parse(request.body)), 201));
    app.post("/data-overlays/templates/:id/insert", { preHandler }, async (request, reply) => handle(reply, () => templates.insert(id(request.params), dataTemplateInsertInputSchema.parse(request.body))));
  }
  if (dependencies.twitchDataSourceRuntime) {
    const runtime = dependencies.twitchDataSourceRuntime;
    app.get("/data-overlays/sources/twitch", { preHandler }, async () => runtime.getStatus());
    app.post("/data-overlays/sources/twitch/followers", { preHandler }, async (request, reply) => handle(reply, () => runtime.createFollowerSource(twitchFollowerSourceInputSchema.parse(request.body).name), 201));
  }
  app.put("/data-overlays/pins", { preHandler }, async (request,reply) => handle(reply,() => service.setPins(z.object({ valueIds: z.array(dataIdSchema) }).strict().parse(request.body).valueIds)));
  app.post("/data-overlays/values", { preHandler }, async (request,reply) => handle(reply,() => service.createValue(dataValueCreateInputSchema.parse(request.body)),201));
  app.patch("/data-overlays/values/:id", { preHandler }, async (request,reply) => handle(reply,() => service.updateValue(id(request.params),dataValueUpdateInputSchema.parse(request.body))));
  app.delete("/data-overlays/values/:id", { preHandler }, async (request,reply) => handle(reply,() => service.deleteValue(id(request.params))));
  app.post("/data-overlays/goals", { preHandler }, async (request,reply) => handle(reply,() => service.createGoal(dataGoalInputSchema.parse(request.body)),201));
  app.put("/data-overlays/goals/:id", { preHandler }, async (request,reply) => handle(reply,() => service.updateGoal(id(request.params),dataGoalInputSchema.parse(request.body))));
  app.delete("/data-overlays/goals/:id", { preHandler }, async (request,reply) => handle(reply,() => service.deleteGoal(id(request.params))));
  app.post("/data-overlays/groups", { preHandler }, async (request,reply) => handle(reply,() => service.createResetGroup(dataResetGroupInputSchema.parse(request.body)),201));
  app.put("/data-overlays/groups/:id", { preHandler }, async (request,reply) => handle(reply,() => service.updateResetGroup(id(request.params),dataResetGroupInputSchema.parse(request.body))));
  app.delete("/data-overlays/groups/:id", { preHandler }, async (request,reply) => handle(reply,() => service.deleteResetGroup(id(request.params))));
  app.post("/data-overlays/canvases", { preHandler }, async (request,reply) => handle(reply,() => service.createCanvas(dataCanvasInputSchema.parse(request.body)),201));
  app.put("/data-overlays/canvases/:id", { preHandler }, async (request,reply) => handle(reply,() => service.updateCanvas(id(request.params),dataCanvasInputSchema.parse(request.body))));
  app.delete("/data-overlays/canvases/:id", { preHandler }, async (request,reply) => handle(reply,() => service.deleteCanvas(id(request.params))));
  app.post("/operator/data-overlays/values/:id/set", { preHandler }, async (request,reply) => handle(reply,() => service.commandValue(id(request.params), { action: "set", ...dataValueSetInputSchema.parse(request.body) })));
  for (const action of ["add","subtract"] as const) app.post(`/operator/data-overlays/values/:id/${action}`, { preHandler }, async (request,reply) => handle(reply,() => service.commandValue(id(request.params), { action, ...dataValueDeltaInputSchema.parse(request.body) })));
  app.post("/operator/data-overlays/values/:id/reset", { preHandler }, async (request,reply) => handle(reply,() => { empty.parse(request.body ?? {}); return service.commandValue(id(request.params), { action: "reset" }); }));
  app.post("/operator/data-overlays/groups/:id/reset", { preHandler }, async (request,reply) => handle(reply,() => { empty.parse(request.body ?? {}); return service.resetGroup(id(request.params)); }));
  app.post("/operator/data-overlays/goals/:id/restart", { preHandler }, async (request,reply) => handle(reply,() => { empty.parse(request.body ?? {}); return service.restartGoal(id(request.params)); }));
  app.put("/operator/data-overlays/canvases/:id/visibility", { preHandler }, async (request,reply) => handle(reply,() => service.setCanvasVisibility(id(request.params),z.object({ enabled: z.boolean() }).strict().parse(request.body).enabled)));
}
