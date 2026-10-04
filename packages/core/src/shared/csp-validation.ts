import { config } from "zod/v4/core";

/** Browser validation uses Zod's interpreter without probing dynamic code execution. */
export function configureCspSafeValidation(): void {
  config({ jitless: true });
}
