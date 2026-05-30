import fastifyWebsocket from "@fastify/websocket";
import {
  overlayCompositionSchema,
  type OverlayAccessService,
  type OverlayCompositionService,
  type OverlayModuleRegistry,
  type OverlayPurpose,
  type OverlayRouteAccessRequest
} from "@stream-jams/core";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { WebSocket } from "ws";
import { createOverlayAuthPreHandler } from "../middleware/overlay-auth.js";
import type { OverlayGateway, OverlayGatewaySocket } from "../../websocket/overlay-gateway.js";

const defaultOverlayId = "default";

export interface OverlayRouteDependencies {
  readonly overlayAccessService: Pick<OverlayAccessService, "verifyRouteAccess">;
  readonly overlayCompositionService: OverlayCompositionService;
  readonly overlayModuleRegistry: Pick<OverlayModuleRegistry, "listModules">;
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
    sendOverlayShell(reply)
  );
  app.get("/overlay/modules/:moduleId/:purpose/:overlayKey", { preHandler: modulePreHandler }, async (_request, reply) =>
    sendOverlayShell(reply)
  );
  app.get(
    "/overlay/modules/:moduleId/:purpose/:overlayKey/composition",
    { preHandler: modulePreHandler },
    async (request) => {
      const params = readModuleParams(request.params);
      if (params.purpose === null) {
        throw new Error("Overlay purpose must be live or test");
      }

      const composition = await dependencies.overlayCompositionService.resolveModuleOutput({
        moduleId: params.moduleId,
        overlayId: defaultOverlayId,
        purpose: params.purpose
      });

      return overlayCompositionSchema.parse(composition);
    }
  );

  app.get("/overlay/unified/:purpose/:overlayKey", { preHandler: unifiedPreHandler }, async (_request, reply) =>
    sendOverlayShell(reply)
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
    registerWebSocketClient(overlayGateway, socket, resolveModuleOverlayAccessRequest(request));
  });
  app.get("/overlay/ws/unified/:purpose/:overlayKey", { websocket: true }, (socket, request) => {
    registerWebSocketClient(overlayGateway, socket, resolveUnifiedOverlayAccessRequest(request));
  });
}

function registerWebSocketClient(
  overlayGateway: OverlayGateway,
  socket: WebSocket,
  accessRequest: OverlayRouteAccessRequest | null
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

  void overlayGateway.registerClient(toGatewaySocket(socket), accessRequest).then((result) => {
    if (result.authorized) {
      clientId = result.clientId;
    }
  });
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
  if (params.moduleId === "" || params.overlayKey === "" || params.purpose === null) {
    return null;
  }

  return {
    overlayId: defaultOverlayId,
    moduleId: params.moduleId,
    purpose: params.purpose,
    scope: "module",
    rawKey: params.overlayKey
  };
}

function resolveUnifiedOverlayAccessRequest(request: FastifyRequest): OverlayRouteAccessRequest | null {
  const params = readUnifiedParams(request.params);
  if (params.overlayKey === "" || params.purpose === null) {
    return null;
  }

  return {
    overlayId: defaultOverlayId,
    moduleId: null,
    purpose: params.purpose,
    scope: "unified",
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

function sendOverlayShell(reply: FastifyReply) {
  return reply.type("text/html; charset=utf-8").send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Stream Jams Overlay</title>
    <style>
      html,
      body,
      #root {
        background: transparent;
        height: 100%;
        margin: 0;
        overflow: hidden;
        width: 100%;
      }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`);
}
