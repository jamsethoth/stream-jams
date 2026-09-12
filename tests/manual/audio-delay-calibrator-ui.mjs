/* global URLSearchParams, document, performance, window */
import { createAudioDelayCalibrator } from "./audio-delay-calibrator-controller.mjs";

const parameters = new URLSearchParams(window.location.search);
const assetUrl = parameters.get("asset");
const assetName = parameters.get("assetName") ?? "Flashbang WebM";
const players = document.querySelector("#players");
const status = document.querySelector("#status");
const history = document.querySelector("#history");
const activeCount = document.querySelector("#active-count");
const delayRange = document.querySelector("#delay-range");
const delayNumber = document.querySelector("#delay-number");
const delayOutput = document.querySelector("#delay-output");
const referenceVolume = document.querySelector("#reference-volume");
const comparisonVolume = document.querySelector("#comparison-volume");
const referenceVolumeOutput = document.querySelector("#reference-volume-output");
const comparisonVolumeOutput = document.querySelector("#comparison-volume-output");
const recentStarts = [];

document.querySelector("#asset-name").textContent = assetName;

const calibrator = createAudioDelayCalibrator({
  schedule: (callback, delayMs) => window.setTimeout(callback, delayMs),
  cancelScheduled: (timerId) => window.clearTimeout(timerId),
  createPlayer({ channel, volume, onEnded }) {
    const element = document.createElement("video");
    element.preload = "auto";
    element.src = assetUrl ?? "";
    element.volume = volume;
    element.setAttribute("aria-hidden", "true");
    players.append(element);
    let disposed = false;
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      element.pause();
      element.removeAttribute("src");
      element.load();
      element.remove();
      onEnded();
    };
    element.addEventListener("ended", dispose, { once: true });
    element.addEventListener("error", () => {
      status.textContent = `Playback failed for ${channel}. Confirm the Flashbang WebM still exists and can be decoded.`;
      dispose();
    }, { once: true });
    return {
      start() {
        addHistory(channel);
        void element.play().catch(() => {
          status.textContent = "Playback was blocked. Activate the window and try again.";
          dispose();
        });
      },
      stop: dispose
    };
  },
  onActiveCountChange: (count) => { activeCount.textContent = String(count); }
});

function delayMs() {
  return Math.min(500, Math.max(0, Math.round(Number(delayNumber.value) || 0)));
}

function volume(input) {
  return Number(input.value) / 100;
}

function setDelay(value) {
  const normalized = Math.min(500, Math.max(0, Math.round(Number(value) || 0)));
  delayRange.value = String(normalized);
  delayNumber.value = String(normalized);
  delayOutput.textContent = `${normalized} ms`;
}

function addHistory(channel) {
  recentStarts.unshift(`${channel === "reference" ? "Reference" : "Delayed"} started at ${performance.now().toFixed(1)} ms`);
  recentStarts.splice(8);
  history.replaceChildren(...recentStarts.map((entry) => {
    const item = document.createElement("li");
    item.textContent = entry;
    return item;
  }));
}

delayRange.addEventListener("input", () => setDelay(delayRange.value));
delayNumber.addEventListener("input", () => setDelay(delayNumber.value));
for (const preset of document.querySelectorAll("[data-delay]")) {
  preset.addEventListener("click", () => setDelay(preset.dataset.delay));
}
referenceVolume.addEventListener("input", () => { referenceVolumeOutput.textContent = `${referenceVolume.value}%`; });
comparisonVolume.addEventListener("input", () => { comparisonVolumeOutput.textContent = `${comparisonVolume.value}%`; });

document.querySelector("#play-pair").addEventListener("click", () => {
  const delay = delayMs();
  calibrator.playPair({ delayMs: delay, referenceVolume: volume(referenceVolume), comparisonVolume: volume(comparisonVolume) });
  status.textContent = `Playing a reference plus a copy delayed by ${delay} ms. Repeated presses will overlap.`;
});
document.querySelector("#play-reference").addEventListener("click", () => {
  calibrator.playReference(volume(referenceVolume));
  status.textContent = "Playing an immediate reference copy.";
});
document.querySelector("#play-delayed").addEventListener("click", () => {
  const delay = delayMs();
  calibrator.playDelayed({ delayMs: delay, volume: volume(comparisonVolume) });
  status.textContent = `Scheduled one copy after ${delay} ms.`;
});
document.querySelector("#stop-all").addEventListener("click", () => {
  calibrator.stopAll();
  status.textContent = "All active and scheduled copies stopped.";
});

if (assetUrl === null) {
  status.textContent = "No media path was supplied. Relaunch the tool with a WebM file path.";
  for (const button of document.querySelectorAll("button")) button.disabled = true;
}
