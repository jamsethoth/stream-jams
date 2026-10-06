import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ["**/dist/**", "**/dist-desktop-overlay/**", "**/coverage/**", "**/node_modules/**", "**/storybook-static/**", "apps/desktop/.stage/**", "apps/desktop/out/**", ".agents/**", ".codex/**", ".superpowers/**", "prototypes/**", "test-results/**", "playwright-report/**"]
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
    files: ["apps/web/src/management/**/*.{ts,tsx}", "apps/web/src/operator/**/*.{ts,tsx}"],
    ignores: ["**/*.test.tsx", "**/*.test.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{ group: ["**/ModalSurface.js", "./ModalSurface.js"], allowTypeImports: true, message: "Management and Operator dialogs use ManagementModalSurface. Type-only shared contracts are allowed." }]
      }]
    }
  },
  {
    files: ["**/*.{ts,tsx,cts}"],
    rules: {
      "@typescript-eslint/use-unknown-in-catch-callback-variable": "error"
    },
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["vitest.config.ts", "playwright.config.ts", "playwright.desktop.config.ts", "playwright.hardware.config.ts", "playwright.security-installed.config.ts", "apps/web/.storybook/*.ts"]
        },
        tsconfigRootDir: import.meta.dirname
      }
    }
  }
);
