import { resolve } from "node:path";

/** @type {import('@electron-forge/shared-types').ForgeConfig} */
export default {
  outDir: resolve(import.meta.dirname, "../out"),
  packagerConfig: {
    name: "Stream Jams",
    executableName: "Stream Jams",
    // One archive avoids thousands of cold filesystem reads. Native libraries
    // remain real files so dlopen never extracts them during startup.
    asar: { unpack: "**/*.node" },
    prune: false,
    icon: resolve(import.meta.dirname, "assets/tray.ico")
  },
  rebuildConfig: { onlyModules: [] },
  makers: [],
  publishers: []
};
