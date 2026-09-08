import { once } from "node:events";

export function observeNativeExit(child) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(child.exitCode);
  return once(child, "exit").then(([code]) => code);
}
