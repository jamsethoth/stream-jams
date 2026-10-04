import type {
  OverlayAccessService,
  OverlayAccessVerification,
  OverlayInstruction,
  OverlayPurpose,
  OverlayRouteAccessRequest,
  OverlayScope
} from "@stream-jams/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OverlayGateway, type OverlayGatewaySocket } from "./overlay-gateway.js";

describe("OverlayGateway", () => {
  afterEach(() => vi.useRealTimers());
  it("records a bounded sanitized send failure once and reports recovery", async () => {
    const route = { overlayId: "default", moduleId: "alerts", purpose: "live", scope: "module", rawKey: "secret-key" } as const;
    const onTransportDiagnostic = vi.fn();
    const gateway = createGateway({ allowed: [route], onTransportDiagnostic });
    const socket = new RecordingSocket();
    await gateway.registerClient(socket, route);
    socket.send = () => { throw new Error("closed wss://localhost/overlay/secret-key " + "x".repeat(2000)); };
    expect((await gateway.preparePlaybackInstruction(createInstruction(route))).deliveredClientIds).toEqual([]);
    gateway.unregisterClient("client-1", { code: 1006, reason: "secret-key" });
    expect(onTransportDiagnostic).toHaveBeenCalledTimes(1);
    const diagnostic = onTransportDiagnostic.mock.calls[0]![0];
    expect(diagnostic).toMatchObject({ clientId: "client-1", operation: "send", outcome: "disconnected", exception: { type: "Error" } });
    expect(JSON.stringify(diagnostic)).not.toContain("secret-key");
    expect(diagnostic.exception.message.length).toBeLessThanOrEqual(512);
    await gateway.registerClient(new RecordingSocket(), route);
    expect(onTransportDiagnostic).toHaveBeenLastCalledWith(expect.objectContaining({ outcome: "reconnected" }));
  });

  it("records close code and bounded reason once without leaking the route key", async () => {
    const route = { overlayId: "default", moduleId: "alerts", purpose: "live", scope: "module", rawKey: "private-key" } as const;
    const onTransportDiagnostic = vi.fn();
    const gateway = createGateway({ allowed: [route], onTransportDiagnostic });
    await gateway.registerClient(new RecordingSocket(), route);
    gateway.unregisterClient("client-1", { code: 1008, reason: "private-key " + "x".repeat(1000) });
    gateway.unregisterClient("client-1", { code: 1006, reason: "duplicate" });
    expect(onTransportDiagnostic).toHaveBeenCalledTimes(1);
    expect(onTransportDiagnostic.mock.calls[0]![0]).toMatchObject({ operation: "close", closeCode: 1008, outcome: "disconnected" });
    expect(onTransportDiagnostic.mock.calls[0]![0].closeReason).toHaveLength(512);
    expect(JSON.stringify(onTransportDiagnostic.mock.calls)).not.toContain("private-key");
  });
  it("prepares healthy recipients when an earlier socket send fails", async () => {
    const route = { overlayId: "default", moduleId: "alerts", purpose: "live", scope: "module", rawKey: "key" } as const;
    const gateway = createGateway({ allowed: [route] }); const failed = new RecordingSocket(); const healthy = new RecordingSocket();
    await gateway.registerClient(failed, route); const registration = await gateway.registerClient(healthy, route);
    if (!registration.authorized) throw new Error("unauthorized");
    failed.send = () => { throw new Error("Socket closed"); };
    const instruction = createInstruction(route); const pending = gateway.preparePlaybackInstruction(instruction);
    gateway.handleClientMessage(registration.clientId, JSON.stringify({ type: "overlay.playback.ready", instructionId: instruction.id }));
    const prepared = await pending; prepared.start(1000);
    expect(prepared.deliveredClientIds).toEqual([registration.clientId]);
    expect(healthy.messages.at(-1)).toEqual({ type: "overlay.playback.start", instructionId: instruction.id, startsAtEpochMs: 1000 });
  });
  it.each(["stop", "disconnect"])("clears the prepared handle expiry on %s", async action => {
    vi.useFakeTimers();
    const route = { overlayId: "default", moduleId: "alerts", purpose: "live", scope: "module", rawKey: "key" } as const;
    const gateway = createGateway({ allowed: [route] }); const socket = new RecordingSocket();
    const registration = await gateway.registerClient(socket, route);
    if (!registration.authorized) throw new Error("unauthorized");
    const instruction = createInstruction(route); const pending = gateway.preparePlaybackInstruction(instruction);
    gateway.handleClientMessage(registration.clientId, JSON.stringify({ type: "overlay.playback.ready", instructionId: instruction.id }));
    const prepared = await pending;
    if (action === "stop") gateway.stopPlaybackInstructions([instruction.id]); else gateway.unregisterClient(registration.clientId);
    expect(vi.getTimerCount()).toBe(0);
    const messages = [...socket.messages]; prepared.start(1000);
    await vi.advanceTimersByTimeAsync(20000);
    expect(socket.messages).toEqual(messages);
  });
  it("does not resurrect a stopped preparation or expire its same-id replacement", async () => {
    vi.useFakeTimers();
    const route = { overlayId: "default", moduleId: "alerts", purpose: "live", scope: "module", rawKey: "key" } as const;
    const gateway = createGateway({ allowed: [route] }); const socket = new RecordingSocket();
    const registration = await gateway.registerClient(socket, route);
    if (!registration.authorized) throw new Error("unauthorized");
    const instruction = createInstruction(route); const oldPending = gateway.preparePlaybackInstruction(instruction);
    gateway.stopPlaybackInstructions([instruction.id]);
    const nextPending = gateway.preparePlaybackInstruction(instruction);
    const oldHandle = await oldPending;
    gateway.handleClientMessage(registration.clientId, JSON.stringify({ type: "overlay.playback.ready", instructionId: instruction.id }));
    const nextHandle = await nextPending;
    expect(oldHandle.deliveredClientIds).toEqual([]);
    nextHandle.start(1000); oldHandle.start(1000);
    expect(vi.getTimerCount()).toBe(0);
    const messages = [...socket.messages];
    await vi.advanceTimersByTimeAsync(20000);
    expect(socket.messages).toEqual(messages);
    expect(socket.messages.at(-1)).toEqual({ type: "overlay.playback.start", instructionId: instruction.id, startsAtEpochMs: 1000 });
  });
  it("bounds a stalled recipient and lets healthy and subsequent occurrences start", async () => {
    vi.useFakeTimers();
    const route = { overlayId: "default", moduleId: "alerts", purpose: "live", scope: "module", rawKey: "key" } as const;
    const gateway = createGateway({ allowed: [route] });
    const stalled = new RecordingSocket(); const healthy = new RecordingSocket();
    const stalledRegistration = await gateway.registerClient(stalled, route);
    const healthyRegistration = await gateway.registerClient(healthy, route);
    if (!stalledRegistration.authorized || !healthyRegistration.authorized) throw new Error("unauthorized");
    const instruction = createInstruction(route);
    const pending = gateway.preparePlaybackInstruction(instruction);
    gateway.handleClientMessage(healthyRegistration.clientId, JSON.stringify({ type: "overlay.playback.ready", instructionId: instruction.id }));
    await vi.advanceTimersByTimeAsync(6000);
    const prepared = await pending; prepared.start(7000);
    expect(prepared.deliveredClientIds).toEqual([healthyRegistration.clientId]);
    expect(stalled.messages.at(-1)).toEqual({ type: "overlay.playback.stop", instructionIds: [instruction.id] });
    const next = gateway.preparePlaybackInstruction({ ...instruction, id: "next" });
    for (const clientId of [stalledRegistration.clientId, healthyRegistration.clientId]) gateway.handleClientMessage(clientId, JSON.stringify({ type: "overlay.playback.ready", instructionId: "next" }));
    const recovered = await next; recovered.start(8000);
    expect(recovered.deliveredClientIds).toHaveLength(2);
    expect(stalled.messages.at(-1)).toEqual({ type: "overlay.playback.start", instructionId: "next", startsAtEpochMs: 8000 });
  });
  it("removes disconnected prepared recipients before scheduled delivery", async () => {
    const route = { overlayId: "default", moduleId: "alerts", purpose: "live", scope: "module", rawKey: "key" } as const;
    const gateway = createGateway({ allowed: [route] }); const socket = new RecordingSocket();
    const registration = await gateway.registerClient(socket, route);
    if (!registration.authorized) throw new Error("unauthorized");
    const instruction = createInstruction(route); const pending = gateway.preparePlaybackInstruction(instruction);
    gateway.handleClientMessage(registration.clientId, JSON.stringify({ type: "overlay.playback.ready", instructionId: instruction.id }));
    const prepared = await pending; gateway.unregisterClient(registration.clientId); prepared.start(1234);
    expect(socket.messages.at(-1)).toEqual({ type: "overlay.playback.prepare", instruction });
  });
  it("prepares captured clients and starts ready recipients only once", async () => {
    const route = { overlayId: "default", moduleId: "alerts", purpose: "live", scope: "module", rawKey: "key" } as const;
    const gateway = createGateway({ allowed: [route] });
    const socket = new RecordingSocket();
    const registration = await gateway.registerClient(socket, route);
    if (!registration.authorized) throw new Error("unauthorized");
    const instruction = createInstruction(route);
    const pending = gateway.preparePlaybackInstruction(instruction);
    expect(socket.messages.at(-1)).toEqual({ type: "overlay.playback.prepare", instruction });
    gateway.handleClientMessage(registration.clientId, JSON.stringify({ type: "overlay.playback.ready", instructionId: instruction.id }));
    const prepared = await pending;
    const reconnect = new RecordingSocket();
    await gateway.registerClient(reconnect, route);
    prepared.start(1234); prepared.start(1234);
    expect(prepared.deliveredClientIds).toEqual([registration.clientId]);
    expect(socket.messages.filter((message) => (message as { type: string }).type === "overlay.playback.start")).toEqual([
      { type: "overlay.playback.start", instructionId: instruction.id, startsAtEpochMs: 1234 }
    ]);
    expect(reconnect.messages.some((message) => (message as { type: string }).type === "overlay.playback.start")).toBe(false);
  });
  it("delivers validated live compositions only to their registered output", async () => {
    const registration = { overlayId: "default", moduleId: "timers", purpose: "live", scope: "module", targetProfileId: "landscape", rawKey: "timer-key" } as const;
    const gateway = createGateway({ allowed: [registration] }); const socket = new RecordingSocket();
    const result = await gateway.registerClient(socket, registration); expect(result.authorized).toBe(true);
    const composition = { overlayId: "default", purpose: "live", scope: "module", targetProfileId: "landscape", modules: [
      { moduleId: "timers", enabled: true, instructions: [] }
    ] } as const;
    expect(gateway.deliverComposition(result.authorized ? result.clientId : "", composition)).toBe(true);
    expect(socket.messages.at(-1)).toEqual({ type: "overlay.composition", composition });
    expect(gateway.deliverComposition(result.authorized ? result.clientId : "", { ...composition, overlayId: "other" })).toBe(false);
  });

  it("sends saved layers only to matching unified outputs, including reconnects", async () => {
    const unified = { overlayId: "default", moduleId: null, purpose: "live", scope: "unified", rawKey: "test-unified" } as const;
    const module = { ...unified, moduleId: "alerts", scope: "module", rawKey: "test-module" } as const;
    const other = { ...unified, overlayId: "other" };
    const gateway = createGateway({ allowed: [unified, module, other] });
    const sockets = [new RecordingSocket(), new RecordingSocket(), new RecordingSocket()];
    await gateway.registerClient(sockets[0]!, unified);
    await gateway.registerClient(sockets[1]!, module);
    await gateway.registerClient(sockets[2]!, other);
    const surface = { id: "unified-browser:default", kind: "unified-browser", overlayId: "default", layers: [{ moduleId: "alerts", visible: false }] } as const;
    gateway.setSurfaceLayers(surface);
    const message = { type: "overlay.surface-layers", layers: surface.layers };
    expect(sockets[0]!.messages.at(-1)).toEqual(message);
    expect(sockets[1]!.messages).not.toContainEqual(message);
    expect(sockets[2]!.messages).not.toContainEqual(message);
    const reconnect = new RecordingSocket();
    await gateway.registerClient(reconnect, unified);
    expect(reconnect.messages.at(-1)).toEqual(message);
  });

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

  it("accepts bounded timing diagnostics and rejects invalid diagnostics", async () => {
    const route = { overlayId: "default", moduleId: "alerts", purpose: "live", scope: "module", rawKey: "key" } as const;
    const onPlaybackReport = vi.fn();
    const gateway = createGateway({ allowed: [route], onPlaybackReport });
    await gateway.registerClient(new RecordingSocket(), route);
    const diagnostics = { preparationDurationMs: 35, scheduledStartEpochMs: 1000, actualStartEpochMs: 1010, terminalOutcome: "completed" };
    gateway.handleClientMessage("client-1", JSON.stringify({ type: "overlay.playback.completed", instructionId: "one", diagnostics }));
    expect(onPlaybackReport).toHaveBeenCalledWith(expect.objectContaining({ diagnostics }));
    for (const invalid of [{ ...diagnostics, actualStartEpochMs: -1 }, { ...diagnostics, preparationDurationMs: "35" }, { ...diagnostics, terminalOutcome: "unknown" }]) {
      gateway.handleClientMessage("client-1", JSON.stringify({ type: "overlay.playback.completed", instructionId: "one", diagnostics: invalid }));
    }
    expect(onPlaybackReport).toHaveBeenCalledTimes(1);
    const started = { preparationDurationMs: 30, scheduledStartEpochMs: 1000, actualStartEpochMs: 1008 };
    gateway.handleClientMessage("client-1", JSON.stringify({ type: "overlay.playback.started", instructionId: "two", diagnostics: started }));
    expect(onPlaybackReport).toHaveBeenLastCalledWith(expect.objectContaining({ status: "started", diagnostics: started }));
    gateway.handleClientMessage("client-1", JSON.stringify({ type: "overlay.playback.started", instructionId: "two", diagnostics: { ...started, terminalOutcome: "completed" } }));
    expect(onPlaybackReport).toHaveBeenCalledTimes(2);
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
          targetProfileId: "vertical",
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
      rawKey: "ovl_moduleLive",
      targetProfileId: "vertical"
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
        referenceId: "err_decode",
        stage: "decode",
        message: "media decode failed",
        exception: { type: "NotSupportedError", message: "codec unsupported", stack: null, code: null, cause: null, thrownValue: null },
        clientId: "spoofed-client",
        targetProfileId: "landscape"
      })
    );

    expect(reports).toEqual([
      {
        clientId: "client-1",
        instructionId: "instruction-1",
        status: "completed",
        message: null,
        referenceId: null,
        stage: null,
        exception: null,
        targetProfileId: "vertical"
      },
      {
        clientId: "client-1",
        instructionId: "instruction-2",
        status: "failed",
        message: "media decode failed",
        referenceId: "err_decode",
        stage: "decode",
        exception: { type: "NotSupportedError", message: "codec unsupported", stack: null, code: null, cause: null, thrownValue: null },
        targetProfileId: "vertical"
      }
    ]);

    gateway.handleClientMessage("client-1", JSON.stringify({
      type: "overlay.playback.failed",
      instructionId: "bad",
      referenceId: "err_bad",
      stage: "decode",
      message: "bad",
      exception: { type: "Error", message: "x", stack: "x".repeat(40_000) }
    }));
    expect(reports).toHaveLength(2);
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
  readonly onTransportDiagnostic?: ConstructorParameters<typeof OverlayGateway>[0]["onTransportDiagnostic"];
  readonly onClientDisconnected?: ConstructorParameters<typeof OverlayGateway>[0]["onClientDisconnected"];
  readonly onPlaybackReport?: ConstructorParameters<typeof OverlayGateway>[0]["onPlaybackReport"];
  readonly clock?: () => Date;
  readonly initialPlaybackMuted?: boolean;
}): OverlayGateway {
  let clientNumber = 0;
  return new OverlayGateway({
    overlayAccessService: new StubOverlayAccessService(options.allowed),
    ...(options.onTransportDiagnostic === undefined ? {} : { onTransportDiagnostic: options.onTransportDiagnostic }),
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


it("reports failed mute delivery and bootstraps replacement clients with the saved module policy", async () => {
  const route = { overlayId: "default", moduleId: "alerts", purpose: "live", scope: "module", rawKey: "ovl_moduleLive" } as const;
  const gateway = createGateway({ allowed: [route] });
  const socket = new RecordingSocket(); await gateway.registerClient(socket, route);
  socket.send = () => { throw new Error("output disconnected"); };
  const moduleMutes = { alerts: true, "screen-effects": false };
  expect(() => gateway.setModuleMutes(moduleMutes)).toThrow("could not be delivered");
  const replacement = new RecordingSocket(); await gateway.registerClient(replacement, route);
  expect(replacement.messages.at(-1)).toEqual({ type: "overlay.playback.audio-state", muted: false, moduleMutes });
});
