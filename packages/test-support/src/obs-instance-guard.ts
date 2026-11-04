import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { canonicalPath, isInsideOrEqual } from "./environment-safety.js";

/**
 * Every automated obs-websocket client goes through this guard, so tests can only change a
 * portable dev OBS (C:\StreamJamsDev\obs by default), never the maintainer's production OBS.
 */
export const productionObsPort = 4455;
export const devObsProfileName = "StreamJamsDev";
export const devObsMarkerFileName = "stream-jams-dev-obs.json";
export const devObsPersistentSlot = "StreamJamsDevInstance";

export interface DevObsInstance {
  /** The portable dev OBS folder (contains bin\64bit\obs64.exe and the marker file). */
  readonly root: string;
  readonly port: number;
}

export type ObsRequest = (requestType: string, requestData?: Record<string, unknown>) => Promise<Record<string, unknown>>;

export interface ObsGuardDependencies {
  /** Executable path of the process listening on 127.0.0.1:<port>, or null when none. */
  readonly owningProcessPath: (port: number) => Promise<string | null>;
  /** Opens and authenticates the obs-websocket connection; called only after the pre-connect checks pass. */
  readonly connect: () => Promise<ObsRequest>;
  readonly readMarker?: (root: string) => Promise<string>;
}

export class ObsGuardError extends Error {
  constructor(message: string) {
    super(`${message} Automated OBS changes may only target the dev OBS instance.`);
    this.name = "ObsGuardError";
  }
}

export function devObsInstanceFromEnvironment(environment: NodeJS.ProcessEnv = process.env): DevObsInstance {
  const root = environment.STREAM_JAMS_DEV_OBS_ROOT?.trim() || "C:\\StreamJamsDev\\obs";
  const port = Number(environment.STREAM_JAMS_DEV_OBS_PORT ?? 4456);
  // The dev OBS is a Windows install; accept its drive-letter form on every platform (CI unit tests run on Linux).
  if (!path.win32.isAbsolute(root) && !path.posix.isAbsolute(root)) throw new ObsGuardError("STREAM_JAMS_DEV_OBS_ROOT must be absolute.");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new ObsGuardError("STREAM_JAMS_DEV_OBS_PORT must be a TCP port.");
  return { root, port };
}

const deniedRequests = new Set(["StartStream", "ToggleStream", "StartRecord", "ToggleRecord", "StartReplayBuffer", "ToggleReplayBuffer",
  "StartVirtualCam", "ToggleVirtualCam", "SetStreamServiceSettings"]);
const deniedProfileCategories = new Set(["Output", "SimpleOutput", "AdvOut", "Stream"]);
const deniedInputKinds = new Set(["dshow_input", "wasapi_input_capture", "wasapi_output_capture", "wasapi_process_output_capture"]);

/** Throws for requests that reach live outputs, streaming settings or capture devices. */
export function assertObsRequestAllowed(requestType: string, requestData: Record<string, unknown> = {}): void {
  if (deniedRequests.has(requestType)) throw new ObsGuardError(`${requestType} is not allowed from tests.`);
  if (requestType === "SetProfileParameter" && deniedProfileCategories.has(String(requestData.parameterCategory))) {
    throw new ObsGuardError(`SetProfileParameter for ${String(requestData.parameterCategory)} is not allowed from tests.`);
  }
  if (requestType === "CreateInput" && deniedInputKinds.has(String(requestData.inputKind))) {
    throw new ObsGuardError(`Creating a ${String(requestData.inputKind)} input is not allowed from tests.`);
  }
}

async function readMarkerFile(root: string): Promise<string> {
  const parsed: unknown = JSON.parse(await readFile(path.join(root, devObsMarkerFileName), "utf8"));
  const id = typeof parsed === "object" && parsed !== null && "instanceId" in parsed ? parsed.instanceId : undefined;
  if (typeof id !== "string" || id.length < 16) throw new ObsGuardError(`${devObsMarkerFileName} has no instanceId.`);
  return id;
}

/** Verifies the dev instance, then returns a request function that applies the deny list. */
export async function connectGuardedObs(instance: DevObsInstance, dependencies: ObsGuardDependencies): Promise<ObsRequest> {
  if (instance.port === productionObsPort) throw new ObsGuardError(`Port ${productionObsPort} belongs to the production OBS.`);
  const expectedExecutable = path.join(instance.root, "bin", "64bit", "obs64.exe");
  const owner = await dependencies.owningProcessPath(instance.port);
  if (owner === null || canonicalPath(owner) !== canonicalPath(expectedExecutable)) {
    throw new ObsGuardError(`Port ${instance.port} is owned by ${owner ?? "no process"}, not ${expectedExecutable}.`);
  }
  const markerId = await (dependencies.readMarker ?? readMarkerFile)(instance.root);
  const request = await dependencies.connect();
  const profiles = await request("GetProfileList");
  const collections = await request("GetSceneCollectionList");
  if (profiles.currentProfileName !== devObsProfileName || collections.currentSceneCollectionName !== devObsProfileName) {
    throw new ObsGuardError(`The connected OBS is on profile "${String(profiles.currentProfileName)}" and collection "${String(collections.currentSceneCollectionName)}", not ${devObsProfileName}.`);
  }
  const slot = await request("GetPersistentData", { realm: "OBS_WEBSOCKET_DATA_REALM_PROFILE", slotName: devObsPersistentSlot });
  if (slot.slotValue !== markerId) throw new ObsGuardError("The connected OBS does not carry this dev instance's marker.");
  return async (requestType, requestData = {}) => {
    assertObsRequestAllowed(requestType, requestData);
    return request(requestType, requestData);
  };
}

/** Windows: the executable listening on a loopback port, via the same PID-to-path proof the OBS acceptance test uses. */
export async function windowsOwningProcessPath(port: number): Promise<string | null> {
  if (!Number.isInteger(port)) throw new ObsGuardError("Invalid port.");
  const { stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
    `$c = Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if ($c) { (Get-Process -Id $c.OwningProcess).Path }`],
  { windowsHide: true, timeout: 20_000 });
  return stdout.trim() || null;
}

/**
 * `portable_mode.txt` switches an OBS folder to its local config. Written into an installed OBS it
 * would empty the production OBS's profiles, so harnesses may create it only inside a copy they own.
 */
export function assertPortableMarkerTarget(obsFolder: string, protectedInstalls: readonly string[], ownedRoots: readonly string[]): void {
  for (const install of protectedInstalls) {
    if (isInsideOrEqual(obsFolder, install)) throw new ObsGuardError(`Refusing to write portable_mode.txt into the OBS install ${install}.`);
  }
  if (!ownedRoots.some(root => isInsideOrEqual(obsFolder, root))) {
    throw new ObsGuardError(`Refusing to write portable_mode.txt outside an owned OBS copy: ${obsFolder}.`);
  }
}
