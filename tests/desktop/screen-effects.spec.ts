import { access, mkdtemp, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron, expect, test, type ElectronApplication } from "@playwright/test";
import { finishDesktop, windowByUrl, withCleanup } from "./audio-harness.js";

const executablePath = resolve("apps/desktop/out/Stream Jams-win32-x64/Stream Jams.exe");

test("packaged Screen Effects persists definitions and restarts with empty runtime queues", { tag: "@hardware" }, async () => {
  test.skip(process.env.STREAM_JAMS_SCREEN_EFFECTS_TEST !== "1", "Physical desktop output requires explicit approval.");
  await access(executablePath);
  const root = await mkdtemp(join(tmpdir(), "stream-jams-screen-effects-"));
  const port = await unusedPort();
  const configPath = join(root, "config.json");
  await writeFile(configPath, JSON.stringify({
    server: { host: "127.0.0.1", port },
    storage: { dataDirectory: join(root, "data"), assetDirectory: join(root, "assets") }
  }));
  const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
  delete env.ELECTRON_RUN_AS_NODE;
  env.STREAM_JAMS_CONFIG_PATH = configPath;
  env.STREAM_JAMS_DESKTOP_USER_DATA_PATH = join(root, "electron");

  let desktop: ElectronApplication | undefined;
  let child: ReturnType<ElectronApplication["process"]> | undefined;
  const ownedPids: number[] = [];
  await withCleanup(async () => {
    desktop = await _electron.launch({ executablePath, cwd: root, env, chromiumSandbox: true, timeout: 30_000 });
    child = desktop.process();
    const management = await windowByUrl(desktop, `http://127.0.0.1:${port}/manage`);
    ownedPids.push(...await processIds(desktop));
    const errors: string[] = [];
    management.on("pageerror", (error) => errors.push(error.message));

    await management.getByRole("link", { name: "Settings", exact: true }).click();
    const display = management.getByLabel("Desktop display");
    await display.locator('option:not([value=""])').first().waitFor({ state: "attached", timeout: 5_000 }).catch(() => undefined);
    const displayId = await display.locator("option").evaluateAll((options) =>
      options.map((option) => (option as HTMLOptionElement).value).find((value) => value !== "") ?? ""
    );
    const desktopOutputAvailable = displayId !== "";
    if (desktopOutputAvailable) {
      await display.selectOption(displayId);
      await management.getByLabel("Enable desktop overlay").check();
      await management.getByRole("checkbox", { name: "Show screen-effects on Desktop overlay" }).check();
      await management.getByRole("button", { name: "Save Desktop overlay" }).click();
      await expect(management.getByText(/Desktop (?:overlay settings saved|settings saved; output needs attention)\./u)).toBeVisible();
      await expect(management.getByRole("button", { name: "Save Desktop overlay" })).toBeDisabled();
    } else {
      console.info("No desktop display was enumerated; physical display delivery remains in the explicit hardware suite.");
    }

    await management.getByRole("link", { name: "Screen Effects", exact: true }).click();
    await management.getByRole("button", { name: "New effect" }).click();
    await management.getByRole("button", { name: "Choose visual asset" }).click();
    await management.getByRole("tab", { name: "Upload new" }).click();
    await management.getByLabel("Asset file").setInputFiles(resolve("tests/fixtures/media/neutral-trackless.webm"));
    await management.getByLabel("Display name").fill("Neutral desktop effect");
    await management.getByRole("button", { name: "Upload and use" }).click();
    if (desktopOutputAvailable) await management.getByRole("checkbox", { name: "Desktop overlay" }).check();
    await management.getByLabel("Variant duration").fill("30");
    await management.getByRole("button", { name: "Save", exact: true }).click();
    await expect(management.getByRole("status")).toContainText("Screen Effect saved");

    await management.getByRole("button", { name: "Back", exact: true }).click();
    await management.getByRole("button", { name: "Enable", exact: true }).click();
    await management.getByRole("button", { name: "Confirm change" }).click();
    await expect(management.getByText("Enabled", { exact: true })).toBeVisible();
    await management.getByRole("button", { name: "Edit", exact: true }).click();
    await management.getByRole("button", { name: "Live Test…" }).click();
    const testDialog = management.getByRole("dialog", { name: "Send live Screen Effect test?" });
    await expect(testDialog).toContainText("OBS Browser Source visual");
    if (desktopOutputAvailable) await expect(testDialog).toContainText("Desktop overlay visual");
    await management.getByRole("button", { name: "Confirm live test" }).click();

    if (desktopOutputAvailable) {
      await expect(management.getByRole("status")).toContainText("Live Test queued");
      const overlay = await windowByUrl(desktop, "stream-jams-overlay://surface/");
      await expect(overlay.locator("video")).toHaveCount(1);
      await expect.poll(() => overlay.locator("video").evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThan(0.05);
    } else {
      await expect(management.getByRole("alert")).toContainText("Live Test was not queued: unavailable output.");
    }
    expect(errors).toEqual([]);

    const closed = desktop.waitForEvent("close");
    await desktop.evaluate(({ app }) => app.quit());
    await closed;
    await desktop.close();
    desktop = undefined;
    await expect.poll(() => fetch(`http://127.0.0.1:${port}/health`).then(() => true, () => false)).toBe(false);

    desktop = await _electron.launch({ executablePath, cwd: root, env, chromiumSandbox: true, timeout: 30_000 });
    child = desktop.process();
    ownedPids.push(...await processIds(desktop));
    const restarted = await windowByUrl(desktop, `http://127.0.0.1:${port}/manage`);
    await restarted.getByRole("link", { name: "Screen Effects", exact: true }).click();
    await expect(restarted.getByText("New Screen Effect").first()).toBeVisible();
    await expect(restarted.getByText("Enabled", { exact: true })).toBeVisible();
    await restarted.goto(`http://127.0.0.1:${port}/operator`);
    await expect(restarted.getByText("No playback is active.")).toBeVisible();
    await expect(restarted.getByRole("heading", { name: "Pending (0)" })).toBeVisible();
    await expect(restarted.getByRole("heading", { name: "Recent (0)" })).toBeVisible();
  }, () => finishDesktop(desktop, root, ownedPids, child));
});

async function processIds(desktop: ElectronApplication): Promise<number[]> {
  return desktop.evaluate(({ app }) => app.getAppMetrics().map((entry: { pid: number }) => entry.pid));
}

async function unusedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("Expected a TCP address");
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}
