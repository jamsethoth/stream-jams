import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ["**/dist/**", "**/dist-desktop-overlay/**", "**/coverage/**", "**/node_modules/**", "**/storybook-static/**", "apps/desktop/.stage/**", "apps/desktop/out/**", ".agents/**", ".codex/**", ".superpowers/**", "test-results/**", "playwright-report/**"]
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
          allowDefaultProject: ["vitest.config.ts", "playwright.config.ts", "playwright.desktop.config.ts", "apps/web/.storybook/*.ts"]
        },
        tsconfigRootDir: import.meta.dirname
      }
    }
  }
);
