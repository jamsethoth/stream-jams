import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ["**/dist/**", "**/coverage/**", "**/node_modules/**", "**/storybook-static/**", ".agents/**", ".codex/**"]
  },
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: {
        console: "readonly"
      }
    }
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["vitest.config.ts", "playwright.config.ts", "apps/web/.storybook/*.ts"]
        },
        tsconfigRootDir: import.meta.dirname
      }
    }
  }
);
