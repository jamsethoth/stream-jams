import { randomUUID } from "node:crypto";
import {
  audioDeviceCapabilitySchema, audioOutputDeviceSchema, audioOutputRouteCreateSchema,
  audioOutputRoutePatchSchema, audioOutputRouteTestSchema, audioOutputStatusSchema, audioRouteIdSchema,
  resolveAudioDestinations, deviceAudioBatchSchema, findExactUniqueLabelMatch,
  type AudioDeviceHost, type AudioOutputRoute, type AudioOutputRouteRepository,
  type ResolvedAlertAudio, type DeviceAudioBatch, type AutomaticBindingState,
  type AudioDeviceCapability
} from "@stream-jams/core";
import { AudioOutputError } from "./audio-output-error.js";

interface AudioOutputServiceDependencies {
  readonly routes: AudioOutputRouteRepository;
  readonly host?: AudioDeviceHost;
  readonly isMuted: () => boolean;
  readonly generateId?: () => string;
  readonly runMutation: <T>(work: () => T) => T;
  readonly runTest: <T>(work: () => Promise<T>) => Promise<T>;
}

export class AudioOutputService {
  #testing = false;
  readonly #automaticBindingStates = new Map<string, AutomaticBindingState>();
  constructor(private readonly dependencies: AudioOutputServiceDependencies) {}

  listRoutes(): readonly AudioOutputRoute[] { return this.dependencies.routes.list(); }

  async preparePlayback(playbackId: string, audio: readonly ResolvedAlertAudio[]): Promise<{
    readonly batches: readonly DeviceAudioBatch[];
    readonly unavailableRouteIds: readonly string[];
  }> {
    // Capture bindings synchronously at occurrence start, not after discovery or
    // at enqueue time. A rebind during discovery must not redirect this sound.
    const routes = structuredClone(this.listRoutes());
    const content = structuredClone(audio);
    const capability = await this.getDevices();
    if (capability.available) {
      try { await this.#reconcileWithCapability(capability); }
      catch { /* Current playback remains fail-closed against its captured route snapshot. */ }
    }
    const availableIds = new Set(capability.devices.map(device => device.deviceId));
    const unavailable = new Set<string>();
    const batches = content.flatMap(item => {
      if (item.layers.length === 0 || item.outputs.deviceRouteIds.length === 0) return [];
      const resolved = resolveAudioDestinations(item.outputs.deviceRouteIds, routes, availableIds);
      for (const id of resolved.unavailableRouteIds) unavailable.add(id);
      return resolved.destinations.length === 0 ? [] : [deviceAudioBatchSchema.parse({
        playbackId, documentId: item.documentId, durationMs: item.durationMs,
        layers: item.layers, destinations: resolved.destinations, muted: this.dependencies.isMuted()
      })];
    });
    return { batches, unavailableRouteIds: [...unavailable] };
  }

  async getDevices() {
    if (this.dependencies.host === undefined) return audioDeviceCapabilitySchema.parse({
      available: false, devices: [], reason: "desktop-unavailable", nextStep: "Open the desktop app with local audio support to bind or test a device."
    });
    try {
      const devices = (await this.dependencies.host.listOutputDevices())
        .filter(device => device.deviceId !== "default" && device.deviceId !== "communications")
        .map(device => audioOutputDeviceSchema.parse(device));
      return audioDeviceCapabilitySchema.parse({
        available: true, devices: [...new Map(devices.map(device => [device.deviceId, device])).values()], reason: null, nextStep: null
      });
    } catch {
      return audioDeviceCapabilitySchema.parse({ available: false, devices: [], reason: "enumeration-failed", nextStep: "Reconnect the output device and retry. Restart the desktop app if device discovery remains unavailable." });
    }
  }

  async getStatus() {
    const capability = await this.getDevices();
    if (capability.available) {
      try { await this.#reconcileWithCapability(capability); }
      catch { /* Preserve the saved route as authoritative when persistence fails. */ }
    }
    const availableIds = new Set(capability.devices.map(device => device.deviceId));
    return audioOutputStatusSchema.parse({
      capability, muted: this.dependencies.isMuted(),
      routes: this.listRoutes().map(route => {
        const state = route.deviceId === null ? "unbound" : !capability.available ? "unavailable" : availableIds.has(route.deviceId) ? "ready" : "missing-device";
        const automaticBindingState = state === "ready"
          ? this.#automaticBindingStates.get(route.id) ?? "not-needed"
          : state === "missing-device"
            ? route.autoFollowDeviceName
              ? this.#automaticBindingStates.get(route.id) ?? "no-match"
              : "disabled"
            : "not-needed";
        return { route, state, automaticBindingState };
      })
    });
  }

  async reconcileBindings(): Promise<void> {
    const capability = await this.getDevices();
    if (!capability.available) return;
    await this.#reconcileWithCapability(capability);
  }

  async createRoute(candidate: unknown): Promise<AudioOutputRoute> {
    const input = audioOutputRouteCreateSchema.safeParse(candidate);
    if (!input.success) throw invalidInput();
    const binding = await this.#resolveBinding(input.data.deviceId);
    return this.dependencies.runMutation(() => {
      const id = (this.dependencies.generateId ?? randomUUID)();
      if (this.dependencies.routes.findById(id) !== null) throw new AudioOutputError(409, "AUDIO_ROUTE_ID_CONFLICT", "The route could not be created.", "Retry creating the route.");
      const route = { id, name: input.data.name, ...binding, autoFollowDeviceName: input.data.autoFollowDeviceName };
      this.dependencies.routes.save(route);
      this.#automaticBindingStates.delete(id);
      return route;
    });
  }

  async updateRoute(id: string, candidate: unknown): Promise<AudioOutputRoute> {
    const input = audioOutputRoutePatchSchema.safeParse(candidate);
    if (!input.success) throw invalidInput();
    this.#requireRoute(id);
    const binding = input.data.deviceId === undefined ? undefined : await this.#resolveBinding(input.data.deviceId);
    // Enumeration must finish before the transaction. Re-read inside it: a rename,
    // deletion or alert save may have completed while discovery was pending.
    return this.dependencies.runMutation(() => {
      const current = this.#requireRoute(id);
      if (binding !== undefined && binding.deviceId !== current.deviceId && !input.data.confirmLiveImpact) {
        const references = this.dependencies.routes.findReferences(id);
        const owners = this.dependencies.routes.findModuleReferences(id);
        if (owners.length > 0) {
          throw new AudioOutputError(
            409,
            "AUDIO_ROUTE_CONFIRMATION_REQUIRED",
            "Changing this binding affects saved playback items using the route.",
            "Review the listed Alerts and Screen Effects, then confirm the binding change.",
            [id],
            references,
            owners
          );
        }
      }
      const nextBinding = binding ?? { deviceId: current.deviceId, deviceLabel: current.deviceLabel };
      const route = {
        ...current,
        name: input.data.name ?? current.name,
        ...nextBinding,
        autoFollowDeviceName: nextBinding.deviceId === null
          ? false
          : input.data.autoFollowDeviceName ?? current.autoFollowDeviceName
      };
      this.dependencies.routes.save(route);
      this.#automaticBindingStates.delete(id);
      return route;
    });
  }

  deleteRoute(id: string): void {
    this.dependencies.runMutation(() => {
      this.#requireRoute(id);
      this.dependencies.routes.delete(id);
      this.#automaticBindingStates.delete(id);
    });
  }

  async testRoute(id: string, candidate: unknown): Promise<{ readonly routeId: string; readonly muted: boolean }> {
    if (!audioOutputRouteTestSchema.safeParse(candidate).success) throw invalidInput();
    this.#requireRoute(id);
    return this.dependencies.runTest(async () => {
      if (this.#testing) throw new AudioOutputError(409, "AUDIO_TEST_BUSY", "Another audio route test is still running.", "Wait for that test to finish, then retry.");
      this.#testing = true;
      try {
        const capability = await this.getDevices();
        const route = this.#requireRoute(id);
        this.#requireCapability(capability);
        if (route.deviceId === null || !capability.devices.some(device => device.deviceId === route.deviceId)) {
          throw new AudioOutputError(409, "AUDIO_DEVICE_UNAVAILABLE", "The route has no available bound output device.", "Reconnect the saved device or explicitly bind another device.", [id]);
        }
        const muted = this.dependencies.isMuted();
        if (!muted) {
          try { await this.dependencies.host!.testOutput(route.deviceId); }
          catch { throw new AudioOutputError(503, "AUDIO_ROUTE_TEST_FAILED", "The bound output could not complete the audio test.", "Check the device connection and retry the test.", [id]); }
        }
        return { routeId: id, muted };
      } finally { this.#testing = false; }
    });
  }

  async retry(): Promise<void> {
    return this.dependencies.runTest(async () => {
      if (this.dependencies.host?.retry === undefined) {
        throw new AudioOutputError(503, "AUDIO_RETRY_UNAVAILABLE", "The desktop audio player is unavailable.", "Open or restart the desktop app, then retry.");
      }
      if (this.#testing) {
        throw new AudioOutputError(409, "AUDIO_TEST_BUSY", "Another audio operation is still running.", "Wait for it to finish, then retry.");
      }
      this.#testing = true;
      try {
        await this.dependencies.host.retry();
      } catch {
        throw new AudioOutputError(503, "AUDIO_RETRY_FAILED", "The desktop audio player could not be restarted.", "Restart the desktop app if retry continues to fail.");
      } finally {
        this.#testing = false;
      }
    });
  }

  #requireRoute(id: string): AudioOutputRoute {
    if (!audioRouteIdSchema.safeParse(id).success) throw invalidInput();
    const route = this.dependencies.routes.findById(id);
    if (route === null) throw new AudioOutputError(404, "AUDIO_ROUTE_NOT_FOUND", "The selected audio route no longer exists.", "Refresh the route list and choose an existing route.", [id]);
    return route;
  }

  #requireCapability(capability: Awaited<ReturnType<AudioOutputService["getDevices"]>>): void {
    if (!capability.available) throw new AudioOutputError(503, "AUDIO_DEVICES_UNAVAILABLE", "Local audio device access is unavailable.", capability.nextStep!);
  }

  async #resolveBinding(deviceId: string | null): Promise<Pick<AudioOutputRoute, "deviceId" | "deviceLabel">> {
    if (deviceId === null) return { deviceId: null, deviceLabel: null };
    const capability = await this.getDevices();
    this.#requireCapability(capability);
    const device = capability.devices.find(device => device.deviceId === deviceId);
    if (device === undefined) throw new AudioOutputError(409, "AUDIO_DEVICE_UNAVAILABLE", "The selected output device is unavailable.", "Refresh the device list and explicitly choose a connected output.");
    return { deviceId: device.deviceId, deviceLabel: device.label };
  }

  async #reconcileWithCapability(capability: AudioDeviceCapability): Promise<void> {
    const availableIds = new Set(capability.devices.map(device => device.deviceId));
    for (const snapshot of structuredClone(this.listRoutes())) {
      if (snapshot.deviceId === null || availableIds.has(snapshot.deviceId)) {
        if (this.#automaticBindingStates.get(snapshot.id) !== "rebound") {
          this.#automaticBindingStates.set(snapshot.id, "not-needed");
        }
        continue;
      }
      if (!snapshot.autoFollowDeviceName) {
        this.#automaticBindingStates.set(snapshot.id, "disabled");
        continue;
      }
      const match = findExactUniqueLabelMatch(capability.devices, snapshot.deviceLabel!);
      if (match.kind === "none") {
        this.#automaticBindingStates.set(snapshot.id, "no-match");
        continue;
      }
      if (match.kind === "ambiguous") {
        this.#automaticBindingStates.set(snapshot.id, "ambiguous");
        continue;
      }
      const changed = this.dependencies.runMutation(() => {
        const current = this.dependencies.routes.findById(snapshot.id);
        if (current === null || current.deviceId !== snapshot.deviceId || current.deviceLabel !== snapshot.deviceLabel || current.autoFollowDeviceName !== snapshot.autoFollowDeviceName) {
          return false;
        }
        this.dependencies.routes.save({ ...current, deviceId: match.value.deviceId });
        return true;
      });
      if (changed) this.#automaticBindingStates.set(snapshot.id, "rebound");
    }
  }
}

function invalidInput(): AudioOutputError {
  return new AudioOutputError(400, "INVALID_AUDIO_ROUTE_INPUT", "The audio route request is invalid.", "Use a nonempty route name and an explicit output device; remove unsupported fields.");
}
