import type { ModerationSettings } from "./moderation-service.js";

export interface ModerationSettingsRepository {
  read(): ModerationSettings | null;
  replace(settings: ModerationSettings): void;
}
