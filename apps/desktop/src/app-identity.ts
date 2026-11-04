/**
 * Windows AppUserModelID. The installer writes it into its shortcuts, and the
 * app sets it at startup so tray notifications group with those shortcuts.
 */
export const appUserModelId = "io.github.jamsethoth.streamjams";

/** Dev and test launches use their own ID so they never group with the installed app. */
export const devAppUserModelId = "io.github.jamsethoth.streamjams.dev";
