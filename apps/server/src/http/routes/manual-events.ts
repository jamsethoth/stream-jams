import { manualEventSubmissionSchema } from "@stream-jams/core";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { ManualSubmissionRejectedError } from "../../modules/events/manual-event-service.js";
import { EventBusInputRejectedError } from "../../modules/events/event-bus.js";
import { sendHttpError } from "../errors.js";
import type { ManagementUiRouteDependencies } from "./management-ui.js";

/** Generic management entrypoint accepts only source simulations. Targeted commands keep their own adapters. */
export function registerManualEventRoutes(app: FastifyInstance, submit: NonNullable<ManagementUiRouteDependencies["submitManualSimulation"]>, preHandler: preHandlerHookHandler[]): void {
  app.post("/management/events/manual", { preHandler, bodyLimit: 65_536 }, async (request, reply) => {
    const input = manualEventSubmissionSchema.safeParse(request.body);
    if (!input.success || (input.data.action.kind !== "simulate-canonical" && input.data.action.kind !== "simulate-external")) {
      return sendHttpError(reply, 400, { code: "INVALID_MANUAL_SIMULATION", message: "Choose a supported source simulation with bounded sample data. Targeted module actions use their own management commands." });
    }
    try { return await submit(input.data); }
    catch (error) {
      if (error instanceof EventBusInputRejectedError) return sendHttpError(reply, error.reason === "retired" ? 410 : 422, { code: error.code, message: error.message });
      if (error instanceof ManualSubmissionRejectedError) return sendHttpError(reply, 422, { code: "MANUAL_SIMULATION_REJECTED", message: `${error.message} Reference ${error.referenceId}.` });
      throw error;
    }
  });
}
