import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, type ElectronApplication } from "@playwright/test";

export interface UtilityResources {
  label: string;
  pid: number;
  before: NodeJS.MemoryUsage;
  peak: NodeJS.MemoryUsage;
  afterGC: NodeJS.MemoryUsage;
  cleanup: { owners: number; grants: number; readers: number; storeReaders: number };
  reads: { expectedSizeBytes: number; readBytes: number; maximumChunkBytes: number; highWaterMark: number }[];
}
interface ObserverGlobal {
  resourceWorker: { postMessage(message: unknown): void };
  utilityResources: UtilityResources[];
  resourceStarted: string | null;
}

/** Test-only loader around unchanged ASAR classes/worker. No shipping API. */
export async function installUtilityResourceObserver(desktop: ElectronApplication, directory: string): Promise<number> {
  const appPath = await desktop.evaluate(({ app }) => app.getAppPath());
  const moduleUrl = (path: string) => JSON.stringify(pathToFileURL(join(appPath, path)).href);
  const loader = join(directory, "resource-worker.mjs");
  await writeFile(loader, `
import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import { setImmediate as tick } from 'node:timers/promises';
import { LocalMediaService } from ${moduleUrl("node_modules/@stream-jams/server/dist/modules/assets/local-media-service.js")};
import { LocalAssetStore } from ${moduleUrl("node_modules/@stream-jams/server/dist/modules/assets/local-asset-store.js")};
setFlagsFromString('--expose-gc');
const collect = runInNewContext('gc');
let media, store, measurement, sampler;
let measuring = false;
const reads = [];
const read = LocalAssetStore.prototype.read;
LocalAssetStore.prototype.read = function(...args) {
  if (measuring) throw new Error('Complete-body playback reads are forbidden in resource acceptance');
  return read.apply(this, args);
};
for (const method of ['acquire', 'captureAdmission', 'reconcile']) {
  const original = LocalMediaService.prototype[method];
  LocalMediaService.prototype[method] = function(...args) { media = this; return original.apply(this, args); };
}
const openRead = LocalAssetStore.prototype.openRead;
LocalAssetStore.prototype.openRead = async function(...args) {
  store = this;
  const opened = await openRead.apply(this, args), create = opened.handle.createReadStream.bind(opened.handle);
  opened.handle.createReadStream = options => {
    const stream = create(options), row = { expectedSizeBytes: args[1], readBytes: 0, maximumChunkBytes: 0, highWaterMark: options.highWaterMark };
    reads.push(row);
    const push = stream.push.bind(stream);
    stream.push = (chunk, encoding) => {
      if (chunk !== null) { row.readBytes += chunk.length; row.maximumChunkBytes = Math.max(row.maximumChunkBytes, chunk.length); }
      return push(chunk, encoding);
    };
    return stream;
  };
  return opened;
};
const sample = () => {
  const current = process.memoryUsage();
  for (const key of Object.keys(current)) measurement.peak[key] = Math.max(measurement.peak[key], current[key]);
};
process.parentPort.on('message', async ({ data }) => {
  if (data?.type !== 'test-resource-observer') return;
  if (data.action === 'start') {
    clearInterval(sampler); collect(); await tick(); collect(); await tick(); reads.length = 0;
    const before = process.memoryUsage();
    measurement = { label: data.label, pid: process.pid, before, peak: { ...before } };
    measuring = true;
    sampler = setInterval(sample, 1);
    process.parentPort.postMessage({ type: 'test-resource-started', label: data.label });
  } else if (data.action === 'finish') {
    sample(); clearInterval(sampler); collect(); await tick(); collect(); await tick();
    measuring = false;
    process.parentPort.postMessage({ type: 'test-resource-finished', measurement: { ...measurement,
      afterGC: process.memoryUsage(), cleanup: { ...media.counts, storeReaders: store?.activeReaders ?? 0 }, reads: [...reads] } });
  }
});
await import(${moduleUrl("dist/service-worker.js")});
`);
  const oldWorkerPid = await desktop.evaluate(({ app, utilityProcess, dialog }, loader) => {
    const observed = globalThis as typeof globalThis & ObserverGlobal;
    observed.utilityResources = [];
    observed.resourceStarted = null;
    const original = utilityProcess.fork.bind(utilityProcess);
    utilityProcess.fork = ((modulePath, args, options) => {
      if (options?.serviceName !== "Stream Jams local service") return original(modulePath, args, options);
      const worker = original(loader, args, options);
      observed.resourceWorker = worker;
      worker.on("message", (message: { type?: string; label?: string; measurement?: UtilityResources }) => {
        if (message.type === "test-resource-started") observed.resourceStarted = message.label!;
        if (message.type === "test-resource-finished") observed.utilityResources.push(message.measurement!);
      });
      return worker;
    }) as typeof utilityProcess.fork;
    const show = dialog.showMessageBox.bind(dialog);
    dialog.showMessageBox = (async (options: Parameters<typeof dialog.showMessageBox>[0]) => options.title === "Stream Jams service unavailable" ? { response: 0, checkboxChecked: false } : show(options)) as typeof dialog.showMessageBox;
    const workers = app.getAppMetrics().filter(metric => metric.name === "Stream Jams local service" || metric.serviceName === "Stream Jams local service");
    if (workers.length !== 1 || workers[0]!.pid <= 0 || workers[0]!.pid === process.pid) throw new Error("Expected exactly one owned disposable worker");
    process.kill(workers[0]!.pid);
    return workers[0]!.pid;
  }, loader);
  await expect.poll(() => desktop.evaluate(() => Boolean((globalThis as typeof globalThis & Partial<ObserverGlobal>).resourceWorker)), { timeout: 20000 }).toBe(true);
  return oldWorkerPid;
}

export async function startUtilityResources(desktop: ElectronApplication, label: string): Promise<void> {
  await desktop.evaluate((_electron, label) => (globalThis as typeof globalThis & ObserverGlobal).resourceWorker.postMessage({ type: "test-resource-observer", action: "start", label }), label);
  await expect.poll(() => desktop.evaluate(() => (globalThis as typeof globalThis & ObserverGlobal).resourceStarted)).toBe(label);
}

export async function finishUtilityResources(desktop: ElectronApplication, label: string): Promise<UtilityResources> {
  await desktop.evaluate(() => (globalThis as typeof globalThis & ObserverGlobal).resourceWorker.postMessage({ type: "test-resource-observer", action: "finish" }));
  await expect.poll(() => desktop.evaluate((_electron, label) => (globalThis as typeof globalThis & ObserverGlobal).utilityResources.some(row => row.label === label), label)).toBe(true);
  return desktop.evaluate((_electron, label) => (globalThis as typeof globalThis & ObserverGlobal).utilityResources.find(row => row.label === label)!, label);
}
