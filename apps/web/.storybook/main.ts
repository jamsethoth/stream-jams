import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { StorybookConfig } from "@storybook/react-vite";

const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, "../../..");

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx|mdx)"],
  addons: ["@storybook/addon-a11y"],
  framework: {
    name: "@storybook/react-vite",
    options: {}
  },
  typescript: {
    reactDocgen: "react-docgen-typescript"
  },
  viteFinal(viteConfig) {
    const coreEntry = resolve(repoRoot, "packages/core/src/index.ts");
    const existingAlias = viteConfig.resolve?.alias ?? {};

    viteConfig.resolve = {
      ...viteConfig.resolve,
      alias: Array.isArray(existingAlias)
        ? [...existingAlias, { find: "@stream-jams/core", replacement: coreEntry }]
        : { ...existingAlias, "@stream-jams/core": coreEntry }
    };

    return viteConfig;
  }
};

export default config;
