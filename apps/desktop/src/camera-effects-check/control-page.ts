import type { Command, OpenResult, PipelineSettings, ProbeResult } from "./check-protocol.js";
import { formatPresets } from "./formats.js";
import { api, base, report } from "./page-api.js";

/* The camera effects check control window. Every action goes through the check's main process. */

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const results = element<HTMLTextAreaElement>("results");
let latest = "";
setInterval(() => {
  void api<unknown>("/results").then(value => { latest = JSON.stringify(value, null, 2); results.value = latest; },
    // error-provenance: allow expected -- the results view refreshes every second; a missed read changes nothing
    () => undefined);
}, 1000);
element("copy").onclick = async () => {
  await navigator.clipboard.writeText(latest);
  element("copied").textContent = " Copied.";
};

const status = document.getElementById("status");
if (status !== null) wireControls(status);

function wireControls(status: HTMLElement): void {
  const say = (text: string) => { status.textContent = text; };
  async function command<T>(body: Command): Promise<T | null> {
    try { return await api<T>("/command", body); }
    catch (error) { say(error instanceof Error ? error.message : String(error)); return null; }
  }

  const checkbox = (id: string) => element<HTMLInputElement>(id).checked;
  const settings = (): PipelineSettings => ({
    mirror: checkbox("mirror"),
    matte: (document.querySelector<HTMLInputElement>("input[name=matte]:checked")?.value ?? "none") as PipelineSettings["matte"],
    keyColor: element<HTMLInputElement>("keyColor").value,
    keyTolerance: Number(element<HTMLInputElement>("keyTolerance").value),
    tracking: checkbox("tracking"), eyeBulge: checkbox("eyeBulge"), glitch: checkbox("glitch"), bigEyes: checkbox("bigEyes"),
    pack: checkbox("pack"),
    codec: element<HTMLSelectElement>("codec").value as PipelineSettings["codec"]
  });
  const configure = () => void command({ action: "configure", settings: settings() });
  for (const id of ["mirror", "keyColor", "keyTolerance", "tracking", "eyeBulge", "glitch", "bigEyes", "pack", "codec"]) element(id).addEventListener("change", configure);
  for (const input of document.querySelectorAll("input[name=matte]")) input.addEventListener("change", configure);

  const cameras = element<HTMLSelectElement>("camera");
  const formats = element<HTMLSelectElement>("format");
  const fillFormats = (ids: readonly string[]) => {
    formats.replaceChildren(...formatPresets.filter(preset => ids.includes(preset.id)).map(preset => new Option(`${preset.id} (${preset.width}x${preset.height})`, preset.id)));
  };
  fillFormats(formatPresets.map(preset => preset.id));
  element("list").onclick = async () => {
    say("Listing cameras");
    const list = await command<{ deviceId: string; label: string }[]>({ action: "list-cameras" });
    if (list === null) return;
    cameras.replaceChildren(...list.map(camera => new Option(camera.label, camera.deviceId)));
    say(`${list.length} camera${list.length === 1 ? "" : "s"} found`);
  };
  element("probe").onclick = async () => {
    if (cameras.value === "") { say("List cameras first."); return; }
    say("Probing formats (this closes the camera)");
    const result = await command<ProbeResult>({ action: "probe", deviceId: cameras.value });
    if (result === null) return;
    const escape = (text: string) => text.replace(/[&<>"]/gu, character => `&#${character.charCodeAt(0)};`);
    const rows = result.presets.map(preset => `<tr><td>${escape(preset.id)}</td><td>${preset.advertised ? "yes" : "no"}</td><td>${preset.native === null ? "-" : preset.native ? "yes" : `no (${escape(preset.error ?? "")})`}</td><td>${preset.actual === null ? "-" : `${preset.actual.width}x${preset.actual.height} @ ${preset.actual.frameRate ?? "?"}`}</td></tr>`);
    element("formats").innerHTML = `<table><tr><th>Format</th><th>Advertised</th><th>Native</th><th>Opened as</th></tr>${rows.join("")}</table>`;
    const native = result.presets.filter(preset => preset.native === true).map(preset => preset.id);
    fillFormats(native.length > 0 ? native : formatPresets.map(preset => preset.id));
    say(`Probed ${result.label}`);
  };
  element("open").onclick = async () => {
    const preset = formatPresets.find(candidate => candidate.id === formats.value);
    if (cameras.value === "" || preset === undefined) { say("Pick a camera and a format first."); return; }
    say("Opening the camera");
    await command({ action: "configure", settings: settings() });
    const result = await command<OpenResult>({ action: "open", deviceId: cameras.value, width: preset.width, height: preset.height, frameRate: preset.frameRate });
    if (result === null) return;
    say(result.ok ? `Open: ${result.label} ${result.width}x${result.height} @ ${result.frameRate ?? "?"} fps; camera alpha ${result.alphaSurvives === null ? "unknown" : result.alphaSurvives ? "survives" : "is lost"}` : `Could not open: ${result.error ?? ""}`);
  };

  const obsUrl = () => `${location.origin}${base}/receiver?label=obs&cap=${element<HTMLSelectElement>("cap").value}`;
  const showUrl = () => { element("obsUrl").textContent = obsUrl(); };
  element("cap").addEventListener("change", showUrl);
  showUrl();
  element("copyUrl").onclick = () => void navigator.clipboard.writeText(obsUrl());
  element("desktopOpen").onclick = () => void command({ action: "open-desktop-receiver" });
  element("desktopClose").onclick = () => void command({ action: "close-desktop-receiver" });
  element("barcode").onclick = () => void command({ action: "open-barcode-screen" });
  element("showPipeline").addEventListener("change", () => void command({ action: "show-pipeline", visible: checkbox("showPipeline") }));

  const layoutInputs = ["lx", "ly", "lw", "lh"].map(id => element<HTMLInputElement>(id));
  const applyLayout = () => {
    const [x, y, width, height] = layoutInputs.map(input => Math.round(Number(input.value)));
    void command({ action: "layout", layout: { x: x!, y: y!, width: width!, height: height! } });
  };
  element("applyLayout").onclick = applyLayout;
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-layout]")) {
    button.onclick = () => {
      (button.dataset.layout ?? "").split(",").forEach((value, index) => { layoutInputs[index]!.value = value; });
      applyLayout();
    };
  }

  const scenario = () => void command({
    action: "scenario", scenario: document.querySelector<HTMLInputElement>("input[name=scenario]:checked")?.value === "game" ? "game" : "idle",
    game: element<HTMLInputElement>("game").value.slice(0, 120)
  });
  for (const input of document.querySelectorAll("input[name=scenario]")) input.addEventListener("change", scenario);
  element("game").addEventListener("change", scenario);

  for (const input of document.querySelectorAll<HTMLInputElement>("[data-manual]")) {
    input.onchange = () => report({ kind: "manual", data: { [input.dataset.manual ?? "unknown"]: input.checked } });
  }
  for (const input of document.querySelectorAll<HTMLInputElement>("[data-manual-text]")) {
    input.onchange = () => report({ kind: "manual", data: { [input.dataset.manualText ?? "unknown"]: input.value.slice(0, 1000) } });
  }
  say("Ready. List cameras to start.");
}
