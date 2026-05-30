import {
  AlertRuleNotFoundError,
  AlertVariantNotFoundError,
  LastAlertVariantError,
  type AlertService,
  alertVariantSchema,
  createAlertRuleInputSchema,
  updateAlertRuleInputSchema
} from "@stream-jams/core";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { sendHttpError } from "../errors.js";

export interface AlertRuleRouteDependencies {
  readonly alertService: AlertService;
  readonly managementAuthPreHandler: preHandlerHookHandler;
  readonly managementRateLimitPreHandler: preHandlerHookHandler;
}

export function registerAlertRoutes(app: FastifyInstance, dependencies: AlertRuleRouteDependencies): void {
  const preHandler = [dependencies.managementRateLimitPreHandler, dependencies.managementAuthPreHandler];

  app.get("/alerts/rules", { preHandler }, async () => dependencies.alertService.listRules());
  app.get("/alerts/activation", { preHandler }, async () => dependencies.alertService.getActivationState());

  app.post("/alerts/rules", { preHandler }, async (request, reply) => {
    try {
      const rule = await dependencies.alertService.createRule(createAlertRuleInputSchema.parse(request.body));
      return reply.status(201).send(rule);
    } catch (error) {
      return sendAlertError(reply, error);
    }
  });

  app.put("/alerts/rules/:ruleId", { preHandler }, async (request, reply) => {
    try {
      return await dependencies.alertService.updateRule(
        readRuleId(request.params),
        updateAlertRuleInputSchema.parse(request.body)
      );
    } catch (error) {
      return sendAlertError(reply, error);
    }
  });

  app.patch("/alerts/rules/:ruleId/enabled", { preHandler }, async (request, reply) => {
    const payload = parseEnabledPayload(request.body);
    if (payload === null) {
      return sendHttpError(reply, 400, {
        code: "INVALID_ALERT_RULE_ENABLED_REQUEST",
        message: "Invalid alert rule enabled request"
      });
    }

    try {
      return await dependencies.alertService.setRuleEnabled(readRuleId(request.params), payload.enabled);
    } catch (error) {
      return sendAlertError(reply, error);
    }
  });

  app.delete("/alerts/rules/:ruleId", { preHandler }, async (request, reply) => {
    try {
      await dependencies.alertService.deleteRule(readRuleId(request.params));
      return reply.status(204).send();
    } catch (error) {
      return sendAlertError(reply, error);
    }
  });

  app.put("/alerts/rules/:ruleId/variants/:variantId", { preHandler }, async (request, reply) => {
    try {
      return await dependencies.alertService.saveVariant(
        readRuleId(request.params),
        alertVariantSchema.parse({
          ...readObjectBody(request.body),
          id: readVariantId(request.params)
        })
      );
    } catch (error) {
      return sendAlertError(reply, error);
    }
  });

  app.delete("/alerts/rules/:ruleId/variants/:variantId", { preHandler }, async (request, reply) => {
    try {
      return await dependencies.alertService.deleteVariant(readRuleId(request.params), readVariantId(request.params));
    } catch (error) {
      return sendAlertError(reply, error);
    }
  });
}

function readObjectBody(body: unknown): Record<string, unknown> {
  return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
}

function readRuleId(params: unknown): string {
  return String((params as { readonly ruleId?: string }).ruleId ?? "");
}

function readVariantId(params: unknown): string {
  return String((params as { readonly variantId?: string }).variantId ?? "");
}

function parseEnabledPayload(body: unknown): { readonly enabled: boolean } | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }

  const candidate = body as { readonly enabled?: unknown };
  return typeof candidate.enabled === "boolean" ? { enabled: candidate.enabled } : null;
}

function sendAlertError(reply: Parameters<typeof sendHttpError>[0], error: unknown) {
  if (isZodError(error)) {
    return sendHttpError(reply, 400, {
      code: "INVALID_ALERT_RULE_REQUEST",
      message: "Invalid alert rule request"
    });
  }

  if (error instanceof AlertRuleNotFoundError) {
    return sendHttpError(reply, 404, {
      code: "ALERT_RULE_NOT_FOUND",
      message: error.message
    });
  }

  if (error instanceof AlertVariantNotFoundError) {
    return sendHttpError(reply, 404, {
      code: "ALERT_VARIANT_NOT_FOUND",
      message: error.message
    });
  }

  if (error instanceof LastAlertVariantError) {
    return sendHttpError(reply, 400, {
      code: "ALERT_RULE_REQUIRES_VARIANT",
      message: error.message
    });
  }

  throw error;
}

function isZodError(error: unknown): boolean {
  return error instanceof Error && error.name === "ZodError";
}
