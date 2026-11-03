import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertObsRequestAllowed, assertPortableMarkerTarget, connectGuardedObs, devObsInstanceFromEnvironment, ObsGuardError, type ObsRequest } from "./obs-instance-guard.js";

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), "stream-jams-obs-guard-")); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

const markerId = "0123456789abcdef0123";
function fakeObs(overrides: Record<string, Record<string, unknown>> = {}) {
  const responses: Record<string, Record<string, unknown>> = {
    GetProfileList: { currentProfileName: "StreamJamsDev" },
    GetSceneCollectionList: { currentSceneCollectionName: "StreamJamsDev" },
    GetPersistentData: { slotValue: markerId },
    GetVersion: { obsVersion: "32.2.2" },
    ...overrides
  };
  const sent: string[] = [];
  const request: ObsRequest = async type => { sent.push(type); return responses[type] ?? {}; };
  return { request, sent };
}

describe("connectGuardedObs", () => {
  const instance = () => ({ root: join(root, "obs"), port: 4456 });
  const owner = () => async () => join(root, "obs", "bin", "64bit", "obs64.exe");

  it("connects to a verified dev instance and passes allowed requests through", async () => {
    const obs = fakeObs();
    const request = await connectGuardedObs(instance(), { owningProcessPath: owner(), connect: async () => obs.request, readMarker: async () => markerId });
    await expect(request("GetVersion")).resolves.toEqual({ obsVersion: "32.2.2" });
  });

  it("refuses the production port without connecting", async () => {
    const connect = vi.fn();
    await expect(connectGuardedObs({ root: join(root, "obs"), port: 4455 }, { owningProcessPath: owner(), connect })).rejects.toThrow(ObsGuardError);
    expect(connect).not.toHaveBeenCalled();
  });

  it("refuses a port owned by another OBS before authenticating", async () => {
    const connect = vi.fn();
    await expect(connectGuardedObs(instance(), { owningProcessPath: async () => "C:\\Program Files\\obs-studio\\bin\\64bit\\obs64.exe", connect, readMarker: async () => markerId }))
      .rejects.toThrow(/not .*obs64\.exe/u);
    await expect(connectGuardedObs(instance(), { owningProcessPath: async () => null, connect, readMarker: async () => markerId })).rejects.toThrow(/no process/u);
    expect(connect).not.toHaveBeenCalled();
  });

  it("refuses a different profile or scene collection", async () => {
    const obs = fakeObs({ GetProfileList: { currentProfileName: "Untitled" } });
    await expect(connectGuardedObs(instance(), { owningProcessPath: owner(), connect: async () => obs.request, readMarker: async () => markerId })).rejects.toThrow(/Untitled/u);
  });

  it("refuses a marker mismatch and sends nothing after the checks", async () => {
    const obs = fakeObs({ GetPersistentData: { slotValue: "someone-else-0000000" } });
    await expect(connectGuardedObs(instance(), { owningProcessPath: owner(), connect: async () => obs.request, readMarker: async () => markerId })).rejects.toThrow(/marker/u);
    expect(obs.sent).toEqual(["GetProfileList", "GetSceneCollectionList", "GetPersistentData"]);
  });

  it("rejects denied requests locally", async () => {
    const obs = fakeObs();
    const request = await connectGuardedObs(instance(), { owningProcessPath: owner(), connect: async () => obs.request, readMarker: async () => markerId });
    await expect(request("StartVirtualCam")).rejects.toThrow(/StartVirtualCam/u);
    expect(obs.sent).not.toContain("StartVirtualCam");
  });
});

describe("assertObsRequestAllowed", () => {
  it.each(["StartStream", "ToggleStream", "StartRecord", "StartReplayBuffer", "StartVirtualCam", "SetStreamServiceSettings"])("denies %s", type => {
    expect(() => assertObsRequestAllowed(type)).toThrow(ObsGuardError);
  });

  it("denies output profile parameters and capture inputs only", () => {
    expect(() => assertObsRequestAllowed("SetProfileParameter", { parameterCategory: "SimpleOutput", parameterName: "FilePath" })).toThrow(ObsGuardError);
    expect(() => assertObsRequestAllowed("SetProfileParameter", { parameterCategory: "Video", parameterName: "BaseCX" })).not.toThrow();
    expect(() => assertObsRequestAllowed("CreateInput", { inputKind: "dshow_input" })).toThrow(ObsGuardError);
    expect(() => assertObsRequestAllowed("CreateInput", { inputKind: "wasapi_output_capture" })).toThrow(ObsGuardError);
    expect(() => assertObsRequestAllowed("CreateInput", { inputKind: "browser_source" })).not.toThrow();
  });
});

describe("devObsInstanceFromEnvironment", () => {
  it("defaults to the approved dev root and port", () => {
    expect(devObsInstanceFromEnvironment({})).toEqual({ root: "C:\\StreamJamsDev\\obs", port: 4456 });
  });

  it("rejects a relative root or invalid port", () => {
    expect(() => devObsInstanceFromEnvironment({ STREAM_JAMS_DEV_OBS_ROOT: "obs" })).toThrow(/absolute/u);
    expect(() => devObsInstanceFromEnvironment({ STREAM_JAMS_DEV_OBS_PORT: "nope" })).toThrow(/port/u);
  });
});

describe("assertPortableMarkerTarget", () => {
  it("allows only an owned copy outside every install", () => {
    const install = join(root, "Program Files", "obs-studio");
    mkdirSync(install, { recursive: true });
    expect(() => assertPortableMarkerTarget(join(root, "run", "obs"), [install], [join(root, "run")])).not.toThrow();
    expect(() => assertPortableMarkerTarget(install, [install], [root])).toThrow(/OBS install/u);
    expect(() => assertPortableMarkerTarget(join(root, "elsewhere"), [install], [join(root, "run")])).toThrow(/outside an owned OBS copy/u);
  });
});
