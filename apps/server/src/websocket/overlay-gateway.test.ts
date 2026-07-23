import type {
  OverlayAccessService,
  OverlayAccessVerification,
  OverlayInstruction,
  OverlayPurpose,
  OverlayRouteAccessRequest,
  OverlayScope
} from "@stream-jams/core";
import { describe, expect, it } from "vitest";
import { OverlayGateway, type OverlayGatewaySocket } from "./overlay-gateway.js";

describe("OverlayGateway", () => {
  it("sends authoritative audio state on connect and broadcasts mute and targeted stop changes", async () => {
    const gateway = createGateway({
      allowed: [{
        overlayId: "default",
        moduleId: "alerts",
        purpose: "live",
        scope: "module",
        rawKey: "ovl_moduleLive"
      }],
      initialPlaybackMuted: true
    });
    const firstSocket = new RecordingSocket();
    await gateway.registerClient(firstSocket, {
      overlayId: "default",
      moduleId: "alerts",
      purpose: "live",
      scope: "module",
      rawKey: "ovl_moduleLive"
    });

    expect(firstSocket.messages.at(-1)).toEqual({ type: "overlay.playback.audio-state", muted: true });

    gateway.setPlaybackMuted(false);
    gateway.stopPlaybackInstructions(["instruction-1", "instruction-1", "instruction-2"]);
    gateway.stopPlaybackInstructions([]);

    expect(firstSocket.messages.slice(-2)).toEqual([
      { type: "overlay.playback.audio-state", muted: false },
      { type: "overlay.playback.stop", instructionIds: ["instruction-1", "instruction-2"] }
    ]);

    const reconnect = new RecordingSocket();
    await gateway.registerClient(reconnect, {
      overlayId: "default",
      moduleId: "alerts",
      purpose: "live",
      scope: "module",
      rawKey: "ovl_moduleLive"
    });
    expect(reconnect.messages.at(-1)).toEqual({ type: "overlay.playback.audio-state", muted: false });
  });

  it("registers an authorized module client and delivers only matching module instructions", async () => {
    const gateway = createGateway({
      allowed: [
        {
          overlayId: "default",
          moduleId: "alerts",
          purpose: "live",
          scope: "module",
          rawKey: "ovl_moduleLive"
        },
        {
          overlayId: "default",
          moduleId: "alerts",
          purpose: "test",
          scope: "module",
          rawKey: "ovl_moduleTest"
        }
      ]
    });
    const matchingClient = new RecordingSocket();
    const wrongPurposeClient = new RecordingSocket();

    await gateway.registerClient(matchingClient, {
      overlayId: "default",
      moduleId: "alerts",
      purpose: "live",
      scope: "module",
      rawKey: "ovl_moduleLive"
    });
    await gateway.registerClient(wrongPurposeClient, {
      overlayId: "default",
      moduleId: "alerts",
      purpose: "test",
      scope: "module",
      rawKey: "ovl_moduleTest"
    });

    const result = gateway.deliverPlaybackInstruction(createInstruction({ purpose: "live", scope: "module" }));

    expect(result).toEqual({
      deliveredClientIds: ["client-1"],
      skippedClientIds: ["client-2"]
    });
    expect(matchingClient.messages).toContainEqual({
      type: "overlay.playback",
      instruction: createInstruction({ purpose: "live", scope: "module" })
    });
    expect(JSON.stringify(matchingClient.messages)).not.toContain("sourceEvent");
    expect(JSON.stringify(matchingClient.messages)).not.toContain("management");
    expect(wrongPurposeClient.messages).not.toContainEqual(
      expect.objectContaining({
        type: "overlay.playback"
      })
    );
  });

  it("delivers unified playback only to matching unified clients", async () => {
    const gateway = createGateway({
      allowed: [
        {
          overlayId: "default",
          moduleId: null,
          purpose: "test",
          scope: "unified",
          rawKey: "ovl_unifiedTest"
        },
        {
          overlayId: "default",
          moduleId: "alerts",
          purpose: "test",
          scope: "module",
          rawKey: "ovl_moduleTest"
        }
      ]
    });
    const unifiedClient = new RecordingSocket();
    const moduleClient = new RecordingSocket();

    await gateway.registerClient(unifiedClient, {
      overlayId: "default",
      moduleId: null,
      purpose: "test",
      scope: "unified",
      rawKey: "ovl_unifiedTest"
    });
    await gateway.registerClient(moduleClient, {
      overlayId: "default",
      moduleId: "alerts",
      purpose: "test",
      scope: "module",
      rawKey: "ovl_moduleTest"
    });

    const result = gateway.deliverPlaybackInstruction(createInstruction({ purpose: "test", scope: "unified" }));

    expect(result.deliveredClientIds).toEqual(["client-1"]);
    expect(result.skippedClientIds).toEqual(["client-2"]);
    expect(unifiedClient.messages).toContainEqual({
      type: "overlay.playback",
      instruction: createInstruction({ purpose: "test", scope: "unified" })
    });
    expect(moduleClient.messages).not.toContainEqual(
      expect.objectContaining({
        type: "overlay.playback"
      })
    );
  });

  it("delivers playback only to the matching target profile", async () => {
    const gateway = createGateway({
      allowed: [
        {
          overlayId: "default",
          moduleId: "alerts",
          purpose: "live",
          scope: "module",
          targetProfileId: "landscape",
          rawKey: "ovl_landscape"
        },
        {
          overlayId: "default",
          moduleId: "alerts",
          purpose: "live",
          scope: "module",
          targetProfileId: "vertical",
          rawKey: "ovl_vertical"
        }
      ]
    });
    const landscapeSocket = new RecordingSocket();
    const verticalSocket = new RecordingSocket();
    await gateway.registerClient(landscapeSocket, {
      overlayId: "default",
      moduleId: "alerts",
      purpose: "live",
      scope: "module",
      targetProfileId: "landscape",
      rawKey: "ovl_landscape"
    });
    await gateway.registerClient(verticalSocket, {
      overlayId: "default",
      moduleId: "alerts",
      purpose: "live",
      scope: "module",
      targetProfileId: "vertical",
      rawKey: "ovl_vertical"
    });

    const result = gateway.deliverPlaybackInstruction(
      createInstruction({ purpose: "live", scope: "module", targetProfileId: "vertical" })
    );

    expect(result).toEqual({ deliveredClientIds: ["client-2"], skippedClientIds: ["client-1"] });
  });

  it("retains the latest disconnected client state per output for regeneration impact", async () => {
    let now = new Date("2026-07-15T10:00:00.000Z");
    const disconnectedClientIds: string[] = [];
    const gateway = createGateway({
      allowed: [
        {
          overlayId: "default",
          moduleId: "alerts",
          purpose: "live",
          scope: "module",
          targetProfileId: "vertical",
          rawKey: "ovl_vertical"
        }
      ],
      clock: () => now,
      onClientDisconnected: (clientId) => disconnectedClientIds.push(clientId)
    });
    await gateway.registerClient(new RecordingSocket(), {
      overlayId: "default",
      moduleId: "alerts",
      purpose: "live",
      scope: "module",
      targetProfileId: "vertical",
      rawKey: "ovl_vertical"
    });
    now = new Date("2026-07-15T10:05:00.000Z");

    gateway.unregisterClient("client-1");

    expect(gateway.clients).toEqual([]);
    expect(disconnectedClientIds).toEqual(["client-1"]);
    expect(gateway.clientStates).toEqual([
      expect.objectContaining({
        id: "client-1",
        targetProfileId: "vertical",
        connectionState: "disconnected",
        connectedAt: "2026-07-15T10:00:00.000Z",
        disconnectedAt: "2026-07-15T10:05:00.000Z"
      })
    ]);
  });

  it("closes unauthorized clients without registering them", async () => {
    const gateway = createGateway({
      allowed: [
        {
          overlayId: "default",
          moduleId: "alerts",
          purpose: "live",
          scope: "module",
          rawKey: "ovl_moduleLive"
        }
      ]
    });
    const socket = new RecordingSocket();

    const result = await gateway.registerClient(socket, {
      overlayId: "default",
      moduleId: "alerts",
      purpose: "test",
      scope: "module",
      rawKey: "ovl_moduleLive"
    });

    expect(result).toEqual({
      authorized: false,
      reason: "purpose-mismatch"
    });
    expect(socket.closed).toEqual({
      code: 1008,
      reason: "Overlay route key is not authorized for this output"
    });
    expect(gateway.clients).toEqual([]);
  });

  it("unregisters closed clients so overlays can reconnect", async () => {
    const gateway = createGateway({
      allowed: [
        {
          overlayId: "default",
          moduleId: "alerts",
          purpose: "live",
          scope: "module",
          rawKey: "ovl_moduleLive"
        }
      ]
    });
    const firstSocket = new RecordingSocket();
    const secondSocket = new RecordingSocket();

    await gateway.registerClient(firstSocket, {
      overlayId: "default",
      moduleId: "alerts",
      purpose: "live",
      scope: "module",
      rawKey: "ovl_moduleLive"
    });
    gateway.unregisterClient("client-1");
    await gateway.registerClient(secondSocket, {
      overlayId: "default",
      moduleId: "alerts",
      purpose: "live",
      scope: "module",
      rawKey: "ovl_moduleLive"
    });

    const result = gateway.deliverPlaybackInstruction(createInstruction({ purpose: "live", scope: "module" }));

    expect(result.deliveredClientIds).toEqual(["client-2"]);
    expect(firstSocket.messages).not.toContainEqual(expect.objectContaining({ type: "overlay.playback" }));
    expect(secondSocket.messages).toContainEqual(expect.objectContaining({ type: "overlay.playback" }));
  });

  it("records playback lifecycle reports from registered clients", async () => {
    const reports: unknown[] = [];
    const gateway = createGateway({
      allowed: [
        {
          overlayId: "default",
          moduleId: "alerts",
          purpose: "live",
          scope: "module",
          rawKey: "ovl_moduleLive"
        }
      ],
      onPlaybackReport: (report) => reports.push(report)
    });
    const socket = new RecordingSocket();
    await gateway.registerClient(socket, {
      overlayId: "default",
      moduleId: "alerts",
      purpose: "live",
      scope: "module",
      rawKey: "ovl_moduleLive"
    });

    gateway.handleClientMessage(
      "client-1",
      JSON.stringify({
        type: "overlay.playback.completed",
        instructionId: "instruction-1"
      })
    );
    gateway.handleClientMessage(
      "client-1",
      JSON.stringify({
        type: "overlay.playback.failed",
        instructionId: "instruction-2",
        message: "media decode failed"
      })
    );

    expect(reports).toEqual([
      {
        clientId: "client-1",
        instructionId: "instruction-1",
        status: "completed",
        message: null
      },
      {
        clientId: "client-1",
        instructionId: "instruction-2",
        status: "failed",
        message: "media decode failed"
      }
    ]);
  });
});

interface AllowedRoute {
  readonly overlayId: string;
  readonly moduleId: string | null;
  readonly purpose: OverlayPurpose;
  readonly scope: OverlayScope;
  readonly targetProfileId?: "landscape" | "vertical" | null;
  readonly rawKey: string;
}

function createGateway(options: {
  readonly allowed: readonly AllowedRoute[];
  readonly onClientDisconnected?: ConstructorParameters<typeof OverlayGateway>[0]["onClientDisconnected"];
  readonly onPlaybackReport?: ConstructorParameters<typeof OverlayGateway>[0]["onPlaybackReport"];
  readonly clock?: () => Date;
  readonly initialPlaybackMuted?: boolean;
}): OverlayGateway {
  let clientNumber = 0;
  return new OverlayGateway({
    overlayAccessService: new StubOverlayAccessService(options.allowed),
    generateClientId: () => {
      clientNumber += 1;
      return `client-${clientNumber}`;
    },
    ...(options.initialPlaybackMuted === undefined ? {} : { initialPlaybackMuted: options.initialPlaybackMuted }),
    ...(options.clock === undefined ? {} : { clock: options.clock }),
    ...(options.onClientDisconnected === undefined ? {} : { onClientDisconnected: options.onClientDisconnected }),
    ...(options.onPlaybackReport === undefined ? {} : { onPlaybackReport: options.onPlaybackReport })
  });
}

function createInstruction(input: {
  readonly purpose: OverlayPurpose;
  readonly scope: OverlayScope;
  readonly targetProfileId?: "landscape" | "vertical" | null;
}): OverlayInstruction {
  return {
    id: "instruction-1",
    overlayId: "default",
    moduleId: "alerts",
    purpose: input.purpose,
    scope: input.scope,
    ...(input.targetProfileId === undefined ? {} : { targetProfileId: input.targetProfileId }),
    visual: {
      assetId: "asset-image",
      mediaType: "image",
      layout: {
        x: 10,
        y: 20,
        width: 320,
        height: 120,
        zIndex: 5
      }
    },
    audio: null,
    text: {
      text: "Thanks for the follow",
      layout: {
        x: 10,
        y: 160,
        width: 320,
        height: 80,
        zIndex: 6
      }
    },
    tts: null,
    durationMs: 4000
  };
}

class StubOverlayAccessService implements Pick<OverlayAccessService, "verifyRouteAccess"> {
  constructor(private readonly allowed: readonly AllowedRoute[]) {}

  async verifyRouteAccess(request: OverlayRouteAccessRequest): Promise<OverlayAccessVerification> {
    const keyMatch = this.allowed.find((route) => route.overlayId === request.overlayId && route.rawKey === request.rawKey);
    if (keyMatch === undefined) {
      return {
        authorized: false,
        reason: "key-mismatch"
      };
    }

    if (keyMatch.scope !== request.scope) {
      return {
        authorized: false,
        reason: "scope-mismatch"
      };
    }

    if (keyMatch.purpose !== request.purpose) {
      return {
        authorized: false,
        reason: "purpose-mismatch"
      };
    }

    if (keyMatch.moduleId !== request.moduleId) {
      return {
        authorized: false,
        reason: "module-mismatch"
      };
    }

    if ((keyMatch.targetProfileId ?? null) !== (request.targetProfileId ?? null)) {
      return {
        authorized: false,
        reason: "profile-mismatch"
      };
    }

    return {
      authorized: true,
      record: {
        id: "key-1",
        overlayId: request.overlayId,
        moduleId: request.moduleId,
        purpose: request.purpose,
        scope: request.scope,
        targetProfileId: request.targetProfileId ?? null,
        keyHash: "sha256:hash",
        routeKeySecretRef: null,
        createdAt: "2026-05-30T12:00:00.000Z",
        revokedAt: null
      }
    };
  }
}

class RecordingSocket implements OverlayGatewaySocket {
  readonly messages: unknown[] = [];
  closed: { readonly code: number; readonly reason: string } | null = null;

  send(data: string): void {
    this.messages.push(JSON.parse(data) as unknown);
  }

  close(code: number, reason: string): void {
    this.closed = { code, reason };
  }
}
