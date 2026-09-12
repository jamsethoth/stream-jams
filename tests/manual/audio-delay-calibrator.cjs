/* eslint-disable @typescript-eslint/no-require-imports */
/* global __filename, process, require */
const { existsSync } = require("node:fs");
const { basename, dirname, join } = require("node:path");
const { pathToFileURL } = require("node:url");
const { app, BrowserWindow, dialog } = require("electron");

const here = dirname(__filename);
const requestedAsset = process.argv[2];
const defaultAsset = "C:\\Users\\James\\Downloads\\9855bf4d-ada5-4b68-952d-89dd21030f36.webm";

app.whenReady().then(async () => {
  const assetPath = requestedAsset ?? defaultAsset;
  if (!existsSync(assetPath)) {
    dialog.showErrorBox("Flashbang file not found", `Expected the test media at:\n${assetPath}`);
    app.quit();
    return;
  }

  const window = new BrowserWindow({
    width: 660,
    height: 720,
    minWidth: 560,
    minHeight: 620,
    title: "Flashbang Delay Calibrator",
    backgroundColor: "#10151c",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  window.setMenuBarVisibility(false);
  await window.loadFile(join(here, "audio-delay-calibrator.html"), {
    query: {
      asset: pathToFileURL(assetPath).href,
      assetName: basename(assetPath)
    }
  });
});

app.on("window-all-closed", () => app.quit());
