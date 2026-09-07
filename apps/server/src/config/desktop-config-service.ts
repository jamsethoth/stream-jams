import { desktopConfigUpdateSchema, type ConfigStore, type DesktopConfig } from "@stream-jams/core";

export class DesktopConfigError extends Error {
  constructor(readonly statusCode: number, readonly code: string, message: string) { super(message); }
}

/** Configuration is owned by the server; host availability is never persisted. */
export class DesktopConfigService {
  #pending: Promise<unknown> = Promise.resolve();
  constructor(
    private readonly store: ConfigStore,
    private readonly apply?: (config: DesktopConfig) => void | Promise<void>
  ) {}

  async getConfig(): Promise<DesktopConfig & { readonly available: boolean }> {
    return { ...(await this.store.readConfig()).desktop, available: this.apply !== undefined };
  }

  updateConfig(candidate: unknown): Promise<DesktopConfig & { readonly available: boolean }> {
    const result = this.#pending.then(async () => {
      if (this.apply === undefined) throw new DesktopConfigError(409, "DESKTOP_UNAVAILABLE", "Open Stream Jams in the desktop app to change its close behavior.");
      const parsed = desktopConfigUpdateSchema.safeParse(candidate);
      if (!parsed.success) throw new DesktopConfigError(400, "INVALID_DESKTOP_CONFIG", "Close window to tray must be a boolean.");
      const config = await this.store.updateConfig({ desktop: parsed.data.closeToTray === undefined ? {} : { closeToTray: parsed.data.closeToTray } });
      try { await this.apply(config.desktop); } catch {
        throw new DesktopConfigError(503, "DESKTOP_CONFIG_NOT_APPLIED", "The preference was saved but the desktop host could not apply it. Restart the desktop app to use the saved setting.");
      }
      return { ...config.desktop, available: true };
    });
    this.#pending = result.catch(() => undefined);
    return result;
  }

  async refresh(): Promise<void> {
    await this.apply?.((await this.store.readConfig()).desktop);
  }
}
