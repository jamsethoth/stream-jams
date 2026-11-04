import { win32 } from "node:path";
import { describe, expect, it } from "vitest";
import { allowedDesktopDisplays, desktopProfileIdentity, resolveDesktopUserData } from "./desktop-profile.js";

const appData = process.platform === "win32" ? "C:\\Users\\streamer\\AppData\\Roaming" : "/home/streamer/.config";
const join = (...parts: string[]) => process.platform === "win32" ? win32.join(...parts) : parts.join("/");

describe("desktopProfileIdentity", () => {
  it("keeps the installed identity for production and separates dev and test", () => {
    expect(desktopProfileIdentity("production")).toEqual({ appName: "Stream Jams", appUserModelId: "io.github.jamsethoth.streamjams", trayLabel: "Stream Jams", isolated: false });
    expect(desktopProfileIdentity("dev")).toEqual({ appName: "Stream Jams Dev", appUserModelId: "io.github.jamsethoth.streamjams.dev", trayLabel: "Stream Jams (Dev)", isolated: true });
    expect(desktopProfileIdentity("test")).toEqual(desktopProfileIdentity("dev"));
  });
});

describe("resolveDesktopUserData", () => {
  it("leaves production on Electron's default unless overridden", () => {
    expect(resolveDesktopUserData("production", appData, undefined)).toBeUndefined();
    expect(resolveDesktopUserData("production", appData, join(appData, "x"))).toBe(join(appData, "x"));
  });

  it("gives dev its own profile and accepts an absolute override", () => {
    expect(resolveDesktopUserData("dev", appData, undefined)).toBe(join(appData, "Stream Jams Dev"));
    expect(resolveDesktopUserData("test", appData, join(appData, "run", "electron"))).toBe(join(appData, "run", "electron"));
  });

  it("refuses the production Electron profile in dev and test", () => {
    expect(() => resolveDesktopUserData("dev", appData, join(appData, "Stream Jams"))).toThrow(/production Electron profile/u);
    expect(() => resolveDesktopUserData("test", appData, join(appData, "Stream Jams", "Partitions"))).toThrow(/production Electron profile/u);
  });

  it.runIf(process.platform === "win32")("refuses the production profile spelled with other letter case", () => {
    expect(() => resolveDesktopUserData("dev", appData, join(appData, "STREAM JAMS"))).toThrow(/production Electron profile/u);
  });

  it("rejects a relative or empty override", () => {
    expect(() => resolveDesktopUserData("dev", appData, "relative")).toThrow(/absolute/u);
    expect(() => resolveDesktopUserData("production", appData, " ")).toThrow(/absolute/u);
  });
});

describe("allowedDesktopDisplays", () => {
  const displays = [{ id: "1", label: "VG27A" }, { id: "2", label: "Parsec Virtual Display" }];

  it("offers every display in production", () => {
    expect(allowedDesktopDisplays(displays, "production", {})).toEqual(displays);
  });

  it("offers only the dev display in dev", () => {
    expect(allowedDesktopDisplays(displays, "dev", {})).toEqual([displays[1]]);
    expect(allowedDesktopDisplays(displays, "dev", { STREAM_JAMS_DEV_DISPLAY_LABEL: "vg27" })).toEqual([displays[0]]);
  });

  it("keeps every display for test runs unless a dev display is configured", () => {
    expect(allowedDesktopDisplays(displays, "test", {})).toEqual(displays);
    expect(allowedDesktopDisplays(displays, "test", { STREAM_JAMS_DEV_DISPLAY_LABEL: "parsec" })).toEqual([displays[1]]);
  });

  it("offers nothing when no display matches", () => {
    expect(allowedDesktopDisplays([{ id: "1", label: "VG27A" }], "dev", {})).toEqual([]);
  });
});
