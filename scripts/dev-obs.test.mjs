import assert from "node:assert/strict";
import test from "node:test";
import { URL } from "node:url";
import {
  assertDevStreamJamsOrigin, devBasicIni, devCollectionName, devGlobalIni, devPluginModules, devUserIni, formatIni, parseIni,
  parseStreamJamsOverlayUrl, placeholderKey, prepareCollection, resolveDevUrls, sanitizeAitum, streamJamsTargets
} from "./dev-obs.mjs";

const dev = "http://127.0.0.1:39287";
const productionUrl = (path) => `http://127.0.0.1:39187${path}`;

test("parses Stream Jams module URLs on the production and dev ports only", () => {
  assert.deepEqual(parseStreamJamsOverlayUrl(productionUrl("/overlay/modules/alerts/live/ovl_secret?profile=vertical"), dev),
    { scope: "module", moduleId: "alerts", purpose: "live", targetProfileId: "vertical" });
  assert.deepEqual(parseStreamJamsOverlayUrl(`${dev}/overlay/modules/videos/live/${placeholderKey}`, dev),
    { scope: "module", moduleId: "videos", purpose: "live", targetProfileId: null });
  assert.equal(parseStreamJamsOverlayUrl("https://widgets.nutty.gg/overlay/modules/x/live/y", dev), null);
  assert.equal(parseStreamJamsOverlayUrl("http://127.0.0.1:8080/overlay/modules/x/live/y", dev), null);
  assert.equal(parseStreamJamsOverlayUrl(productionUrl("/overlay/unified/live/ovl_x"), dev).scope, "unified");
});

test("prepares a collection that cannot reach production or live devices", () => {
  const original = {
    name: "Stream",
    DesktopAudioDevice1: { id: "wasapi_output_capture" }, AuxAudioDevice1: { id: "wasapi_input_capture" },
    modules: { "output-timer": {}, "auto-scene-switcher": {}, "scripts-tool": [], refresh_browser_sources_hotkey: [], downstream_keyers: {} },
    sources: [
      { id: "dshow_input", name: "Webcam", enabled: true, hotkeys: { mute: [{ key: "F1" }] } },
      { id: "game_capture", name: "Game", enabled: true },
      { id: "browser_source", name: "Alerts", monitoring_type: 1, filters: [{ hotkeys: { a: [] } }], settings: { url: productionUrl("/overlay/modules/alerts/live/ovl_production_key?profile=landscape"), reroute_audio: false } },
      { id: "browser_source", name: "Timers", settings: { url: productionUrl("/overlay/modules/timers/live/ovl_other?profile=vertical") } },
      { id: "browser_source", name: "Retired unified", settings: { url: productionUrl("/overlay/unified/live/ovl_old") } },
      { id: "browser_source", name: "Widget", settings: { url: "https://widgets.nutty.gg/alerts/token" } }
    ]
  };
  const devUrlFor = target => target.moduleId === "alerts" ? `${dev}/overlay/modules/alerts/live/ovl_dev?profile=landscape` : null;
  const { collection, report } = prepareCollection(original, { name: "StreamJamsDev", devOrigin: dev, devUrlFor });
  const byName = Object.fromEntries(collection.sources.map(source => [source.name, source]));
  assert.equal(collection.name, "StreamJamsDev");
  assert.equal(collection.DesktopAudioDevice1, undefined);
  assert.deepEqual(Object.keys(collection.modules), ["downstream_keyers"]);
  assert.equal(byName.Webcam.enabled, false);
  assert.deepEqual(byName.Webcam.hotkeys, {});
  assert.equal(byName.Game.enabled, false);
  assert.equal(byName.Alerts.settings.url, `${dev}/overlay/modules/alerts/live/ovl_dev?profile=landscape`);
  assert.equal(byName.Alerts.settings.reroute_audio, true);
  assert.equal(byName.Alerts.monitoring_type, 0);
  assert.equal(byName.Timers.settings.url, `${dev}/overlay/modules/timers/live/${placeholderKey}?profile=vertical`);
  assert.ok(!byName["Retired unified"].settings.url.includes("ovl_old"));
  assert.equal(byName.Widget.settings.url, "https://widgets.nutty.gg/alerts/token");
  assert.ok(!JSON.stringify(collection).includes("39187"), "no production Stream Jams URL remains");
  assert.ok(!JSON.stringify(collection).includes("ovl_production_key"), "no production key remains");
  assert.deepEqual(report.unmapped, ["Timers", "Retired unified"]);
  assert.equal(original.sources[0].enabled, true, "the production collection object is not modified");
});

test("collects each module output a set of collections needs once", () => {
  const sources = [productionUrl("/overlay/modules/alerts/live/a?profile=landscape"), productionUrl("/overlay/modules/alerts/live/b?profile=landscape"),
    productionUrl("/overlay/modules/alerts/test/c?profile=vertical"), productionUrl("/overlay/unified/live/d")].map(url => ({ id: "browser_source", settings: { url } }));
  assert.deepEqual(streamJamsTargets([{ sources }], dev).map(target => `${target.moduleId}:${target.targetProfileId}`), ["alerts:landscape", "alerts:vertical"]);
});

test("removes Aitum outputs, stream keys and output hotkeys but keeps layout", () => {
  const clean = sanitizeAitum({ dock_state_mode: "x", canvas: [{ name: "Vertical", width: 1080 }], outputs: [{ stream_key: "live_123", stream_server: "rtmp://x" }],
    start_all_outputs_hotkey: [{ key: "F9" }], nested: { video_encoders: [{ stream_key: "k", name: "enc" }] } });
  assert.deepEqual(clean.outputs, []);
  assert.deepEqual(clean.start_all_outputs_hotkey, []);
  assert.deepEqual(clean.canvas, [{ name: "Vertical", width: 1080 }]);
  assert.deepEqual(clean.nested.video_encoders, [{ name: "enc" }]);
  assert.ok(!/stream_key|stream_server/u.test(JSON.stringify(clean)));
});

test("keeps production plugins except the Stream Deck plugin", () => {
  const modules = devPluginModules([{ module_name: "StreamDeckPlugin", enabled: true }, { module_name: "aitum-stream-suite", enabled: true }]);
  assert.deepEqual(modules.map(module => [module.module_name, module.enabled]), [["StreamDeckPlugin", false], ["aitum-stream-suite", true]]);
});

test("derives dev settings without production locations, hotkeys, cookies or recording folders", () => {
  const global = devGlobalIni({ General: { EnableAutoUpdates: "true", LastVersion: "5" }, Locations: { Configuration: "C:/Users/x/AppData/Roaming/obs-studio" }, Video: { Renderer: "Direct3D 11" } });
  assert.equal(global.Locations, undefined);
  assert.equal(global.General.EnableAutoUpdates, "false");
  const user = devUserIni({ Basic: { Profile: "Untitled", ProfileDir: "Untitled", SceneCollection: "Stream", SceneCollectionFile: "Stream.json", ConfigOnNewProfile: "true" },
    BasicWindow: { DockState: "abc", ExtraBrowserDocks: JSON.stringify([{ title: "Manage", url: productionUrl("/manage") }, { title: "Chat", url: "https://twitch.tv/x" }]) } }, dev);
  assert.equal(user.Basic.Profile, "StreamJamsDev");
  assert.equal(user.Basic.SceneCollectionFile, "StreamJamsDev.json");
  assert.equal(user.BasicWindow.DockState, "abc");
  assert.deepEqual(JSON.parse(user.BasicWindow.ExtraBrowserDocks).map(dock => dock.url), [`${dev}/manage`, "https://twitch.tv/x"]);
  const basic = devBasicIni({ General: { Name: "Untitled" }, SimpleOutput: { FilePath: "C:/Users/x/Videos", VBitrate: "6000" }, AdvOut: { RecFilePath: "C:\\Users\\x\\Videos" },
    Hotkeys: { OBSBasic_StartStreaming: "{}" }, Panels: { CookieId: "abc" }, Stream1: { Key: "live_x", IgnoreRecommended: "false" } }, "C:\\StreamJamsDev\\obs-recordings");
  assert.equal(basic.General.Name, "StreamJamsDev");
  assert.equal(basic.SimpleOutput.FilePath, "C:/StreamJamsDev/obs-recordings");
  assert.equal(basic.AdvOut.RecFilePath, "C:/StreamJamsDev/obs-recordings");
  assert.equal(basic.Hotkeys, undefined);
  assert.equal(basic.Panels, undefined);
  assert.deepEqual(basic.Stream1, { IgnoreRecommended: "false" });
  assert.deepEqual(parseIni(formatIni({ A: { b: "1=2" } })), { A: { b: "1=2" } });
});

test("names the active collection after the dev profile", () => {
  assert.equal(devCollectionName("Stream", true), "StreamJamsDev");
  assert.equal(devCollectionName("Stream 2", false), "StreamJamsDev-Stream2");
});

test("never contacts the production Stream Jams port", async () => {
  assert.throws(() => assertDevStreamJamsOrigin("http://127.0.0.1:39187"), /production/u);
  assert.throws(() => assertDevStreamJamsOrigin("http://192.168.1.5:39287"), /loopback/u);
  await assert.rejects(resolveDevUrls("http://127.0.0.1:39187", [], async () => { throw new Error("must not be called"); }), /production/u);
});

test("reuses existing dev outputs and creates or regenerates only missing keys", async () => {
  const calls = [];
  const json = (status, body) => ({ status, ok: status < 400, json: async () => body });
  const request = async (url, init = {}) => {
    calls.push(`${init.method ?? "GET"} ${new URL(url).pathname}`);
    if (url.endsWith("/auth/management/sessions")) return json(201, { id: "s", csrfToken: "c" });
    if (url.endsWith("/management/overlay-outputs")) return json(200, [
      { moduleId: "alerts", targetProfileId: "landscape", url: `${dev}/overlay/modules/alerts/live/ovl_a?profile=landscape`, copyableUrlStatus: "available" },
      { moduleId: "timers", targetProfileId: "vertical", url: null, copyableUrlStatus: "create-required" },
      { moduleId: "music", targetProfileId: "landscape", url: null, copyableUrlStatus: "regenerate-required" }
    ]);
    const body = JSON.parse(init.body);
    return json(200, { url: `${dev}/overlay/modules/${body.moduleId}/live/ovl_new?profile=${body.targetProfileId}` });
  };
  const targets = [{ moduleId: "alerts", targetProfileId: "landscape" }, { moduleId: "timers", targetProfileId: "vertical" },
    { moduleId: "music", targetProfileId: "landscape" }, { moduleId: "videos", targetProfileId: null }];
  const { urlFor, missing } = await resolveDevUrls(dev, targets, request);
  assert.equal(urlFor(targets[0]), `${dev}/overlay/modules/alerts/live/ovl_a?profile=landscape`);
  assert.equal(urlFor(targets[1]), `${dev}/overlay/modules/timers/live/ovl_new?profile=vertical`);
  assert.deepEqual(missing, ["videos:"]);
  assert.deepEqual(calls, ["POST /auth/management/sessions", "GET /management/overlay-outputs", "POST /management/overlay-outputs/keys", "POST /management/overlay-outputs/keys/regenerate"]);
});
