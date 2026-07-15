import fastifyWebsocket from "@fastify/websocket";
import {
  overlayCompositionSchema,
  type OverlayAccessService,
  type OverlayCompositionService,
  type OverlayModuleRegistry,
  type OverlayPurpose,
  type OverlayRouteAccessRequest
} from "@stream-jams/core";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { WebSocket } from "ws";
import {
  createOverlayAuthPreHandler,
  parseOverlayTargetProfileQuery
} from "../middleware/overlay-auth.js";
import type { OverlayGateway, OverlayGatewaySocket } from "../../websocket/overlay-gateway.js";
import { sendHtml, type WebShellRenderer } from "./web-shell.js";

const defaultOverlayId = "default";

export interface OverlayRouteDependencies {
  readonly overlayAccessService: Pick<OverlayAccessService, "verifyRouteAccess">;
  readonly overlayCompositionService: OverlayCompositionService;
  readonly overlayModuleRegistry: Pick<OverlayModuleRegistry, "listModules">;
  readonly webShellRenderer: Pick<WebShellRenderer, "renderOverlayShell">;
  readonly overlayGateway?: OverlayGateway;
}

export function registerOverlayRoutes(app: FastifyInstance, dependencies: OverlayRouteDependencies): void {
  const modulePreHandler = createOverlayAuthPreHandler({
    overlayAccessService: dependencies.overlayAccessService,
    resolveAccessRequest: resolveModuleOverlayAccessRequest
  });
  const unifiedPreHandler = createOverlayAuthPreHandler({
    overlayAccessService: dependencies.overlayAccessService,
    resolveAccessRequest: resolveUnifiedOverlayAccessRequest
  });

  app.get("/overlay/modules/:moduleId/:purpose", { preHandler: modulePreHandler }, async (_request, reply) =>
    sendHtml(reply, await dependencies.webShellRenderer.renderOverlayShell())
  );
  app.get("/overlay/modules/:moduleId/:purpose/:overlayKey", { preHandler: modulePreHandler }, async (_request, reply) =>
    sendHtml(reply, await dependencies.webShellRenderer.renderOverlayShell())
  );
  app.get(
    "/overlay/modules/:moduleId/:purpose/:overlayKey/composition",
    { preHandler: modulePreHandler },
    async (request) => {
      const params = readModuleParams(request.params);
      const profile = parseOverlayTargetProfileQuery(request.query, true);
      if (params.purpose === null || !profile.valid) {
        throw new Error("Overlay purpose must be live or test");
      }

      const composition = await dependencies.overlayCompositionService.resolveModuleOutput({
        moduleId: params.moduleId,
        overlayId: defaultOverlayId,
        purpose: params.purpose,
        ...(profile.targetProfileId === null ? {} : { targetProfileId: profile.targetProfileId })
      });

      return overlayCompositionSchema.parse(composition);
    }
  );

  app.get("/overlay/unified/:purpose/:overlayKey", { preHandler: unifiedPreHandler }, async (_request, reply) =>
    sendHtml(reply, await dependencies.webShellRenderer.renderOverlayShell())
  );
  app.get(
    "/overlay/unified/:purpose/:overlayKey/composition",
    { preHandler: unifiedPreHandler },
    async (request) => {
      const params = readUnifiedParams(request.params);
      if (params.purpose === null) {
        throw new Error("Overlay purpose must be live or test");
      }

      const composition = await dependencies.overlayCompositionService.resolveUnifiedOutput({
        overlayId: defaultOverlayId,
        purpose: params.purpose,
        enabledModuleIds: dependencies.overlayModuleRegistry.listModules().map((moduleDefinition) => moduleDefinition.id)
      });

      return overlayCompositionSchema.parse(composition);
    }
  );

  if (dependencies.overlayGateway !== undefined) {
    app.register(fastifyWebsocket);
    app.register(async (webSocketApp) => registerOverlayWebSocketRoutes(webSocketApp, dependencies.overlayGateway!));
  }
}

function registerOverlayWebSocketRoutes(app: FastifyInstance, overlayGateway: OverlayGateway): void {
  app.get("/overlay/ws/modules/:moduleId/:purpose/:overlayKey", { websocket: true }, (socket, request) => {
    registerWebSocketClient(overlayGateway, socket, resolveModuleOverlayAccessRequest(request), readUserAgent(request));
  });
  app.get("/overlay/ws/unified/:purpose/:overlayKey", { websocket: true }, (socket, request) => {
    registerWebSocketClient(overlayGateway, socket, resolveUnifiedOverlayAccessRequest(request), readUserAgent(request));
  });
}

function registerWebSocketClient(
  overlayGateway: OverlayGateway,
  socket: WebSocket,
  accessRequest: OverlayRouteAccessRequest | null,
  userAgent: string | null
): void {
  let clientId: string | null = null;
  socket.on("message", (data) => {
    if (clientId !== null) {
      overlayGateway.handleClientMessage(clientId, data.toString());
    }
  });
  socket.on("close", () => {
    if (clientId !== null) {
      overlayGateway.unregisterClient(clientId);
    }
  });

  if (accessRequest === null) {
    socket.close(1008, "A valid overlay route key path segment is required");
    return;
  }

  void overlayGateway.registerClient(toGatewaySocket(socket), accessRequest, {
    userAgent
  }).then((result) => {
    if (result.authorized) {
      clientId = result.clientId;
    }
  });
}

function readUserAgent(request: FastifyRequest): string | null {
  const value = request.headers["user-agent"];
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function toGatewaySocket(socket: WebSocket): OverlayGatewaySocket {
  return {
    send(data: string) {
      socket.send(data);
    },
    close(code: number, reason: string) {
      socket.close(code, reason);
    }
  };
}

function resolveModuleOverlayAccessRequest(request: FastifyRequest): OverlayRouteAccessRequest | null {
  const params = readModuleParams(request.params);
  const profile = parseOverlayTargetProfileQuery(request.query, true);
  if (params.moduleId === "" || params.overlayKey === "" || params.purpose === null || !profile.valid) {
    return null;
  }

  return {
    overlayId: defaultOverlayId,
    moduleId: params.moduleId,
    purpose: params.purpose,
    scope: "module",
    targetProfileId: profile.targetProfileId,
    rawKey: params.overlayKey
  };
}

function resolveUnifiedOverlayAccessRequest(request: FastifyRequest): OverlayRouteAccessRequest | null {
  const params = readUnifiedParams(request.params);
  const profile = parseOverlayTargetProfileQuery(request.query, false);
  if (params.overlayKey === "" || params.purpose === null || !profile.valid) {
    return null;
  }

  return {
    overlayId: defaultOverlayId,
    moduleId: null,
    purpose: params.purpose,
    scope: "unified",
    targetProfileId: null,
    rawKey: params.overlayKey
  };
}

function readModuleParams(params: unknown): {
  readonly moduleId: string;
  readonly purpose: OverlayPurpose | null;
  readonly overlayKey: string;
} {
  const candidate = params as {
    readonly moduleId?: unknown;
    readonly purpose?: unknown;
    readonly overlayKey?: unknown;
  };

  return {
    moduleId: typeof candidate.moduleId === "string" ? candidate.moduleId : "",
    purpose: parseOverlayPurpose(candidate.purpose),
    overlayKey: typeof candidate.overlayKey === "string" ? candidate.overlayKey : ""
  };
}

function readUnifiedParams(params: unknown): {
  readonly purpose: OverlayPurpose | null;
  readonly overlayKey: string;
} {
  const candidate = params as {
    readonly purpose?: unknown;
    readonly overlayKey?: unknown;
  };

  return {
    purpose: parseOverlayPurpose(candidate.purpose),
    overlayKey: typeof candidate.overlayKey === "string" ? candidate.overlayKey : ""
  };
}

function parseOverlayPurpose(value: unknown): OverlayPurpose | null {
  return value === "live" || value === "test" ? value : null;
}
