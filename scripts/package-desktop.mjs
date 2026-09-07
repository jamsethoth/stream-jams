import { createRequire } from "node:module";
import { resolve } from "node:path";

const desktop = resolve(import.meta.dirname, "../apps/desktop");
const require = createRequire(resolve(desktop, "package.json"));
const { api } = require("@electron-forge/core");
await api.package({ dir: resolve(desktop, ".stage"), platform: "win32", arch: "x64", interactive: false });
