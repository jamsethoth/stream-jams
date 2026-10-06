import { describe, expect, it, vi } from "vitest";
import { serializeException, type AlertSetActivationImpact } from "@stream-jams/core";
import { createBaseServerApp } from "../app.js";
import { DesktopConfigError } from "../config/desktop-config-service.js";
import { PortUnavailableError, ServerConfigValidationError } from "../config/server-config-service.js";
import { HttpResponseError } from "./errors.js";
import { AlertSetNotFoundError, AlertRuleForSetNotFoundError, AlertSetNameConflictError,
  AlertVariationNameConflictError, AlertSetActivationBlockedError,
  AlertSetActivationConfirmationRequiredError, AlertSetDeleteBlockedError } from "../modules/alerts/alert-set-management-service.js";
import { AudioOutputError } from "../modules/audio/audio-output-error.js";
import { AutomationControlError } from "../modules/automation/automation-control-service.js";
import { AutomationCredentialError } from "../modules/automation/automation-credential-service.js";
import { MusicSourceNotFoundError } from "../modules/music/music-management-service.js";
import { PearAuthenticationError, PearProtocolError, PearTransportUnavailableError } from "../modules/music/pear-music-source.js";
import { SurfaceSettingsError } from "../modules/overlay-surfaces/surface-settings-service.js";
import { UnknownOverlayOutputError, UnrecoverableOverlayRouteKeyError } from "../modules/overlays/overlay-output-management-service.js";
import { MusicCredentialReplacementUnavailableError } from "../modules/providers/provider-management-service.js";
import { StartupPortInUseError } from "../server/start-server.js";

const impact: AlertSetActivationImpact = {
  currentActiveSetId: null, replacingActiveSetName: null, enabledAlertCount: 0,
  affectedTargetProfileIds: [], affectedEventTypes: [], blockers: [], warnings: []
};
const cases: readonly [string, Error][] = [
  ["DesktopConfigError", new DesktopConfigError(409, "DESKTOP_UNAVAILABLE", "Desktop unavailable")],
  ["ServerConfigValidationError", new ServerConfigValidationError([])],
  ["PortUnavailableError", new PortUnavailableError("127.0.0.1", 3000)],
  ["HttpResponseError", new HttpResponseError(409, "CONFLICT", "Safe conflict")],
  ["AlertSetNotFoundError", new AlertSetNotFoundError("set")],
  ["AlertRuleForSetNotFoundError", new AlertRuleForSetNotFoundError("rule")],
  ["AlertSetNameConflictError", new AlertSetNameConflictError("Set")],
  ["AlertVariationNameConflictError", new AlertVariationNameConflictError("rule", "Variation")],
  ["AlertSetActivationBlockedError", new AlertSetActivationBlockedError("set", impact)],
  ["AlertSetActivationConfirmationRequiredError", new AlertSetActivationConfirmationRequiredError("set", impact)],
  ["AlertSetDeleteBlockedError", new AlertSetDeleteBlockedError("set", "active")],
  ["AudioOutputError", new AudioOutputError(409, "AUDIO_CONFLICT", "Safe audio conflict", "Choose a route", ["route"])],
  ["AutomationControlError", new AutomationControlError(409, "CONTROL_CONFLICT", "Safe conflict")],
  ["AutomationCredentialError", new AutomationCredentialError(401, "UNAUTHORIZED", "Safe authorization failure")],
  ["MusicSourceNotFoundError", new MusicSourceNotFoundError()],
  ["PearAuthenticationError", new PearAuthenticationError()],
  ["PearTransportUnavailableError", new PearTransportUnavailableError(1000, true)],
  ["PearProtocolError", new PearProtocolError()],
  ["SurfaceSettingsError", new SurfaceSettingsError(409, "SURFACE_CONFLICT", "Safe conflict")],
  ["UnknownOverlayOutputError", new UnknownOverlayOutputError({ scope: "module", moduleId: "alerts", overlayId: "default", purpose: "live" })],
  ["UnrecoverableOverlayRouteKeyError", new UnrecoverableOverlayRouteKeyError("key")],
  ["MusicCredentialReplacementUnavailableError", new MusicCredentialReplacementUnavailableError()],
  ["StartupPortInUseError", new StartupPortInUseError("127.0.0.1", 3000, [3001])]
];

describe("custom error diagnostic contracts", () => {
  it.each(cases)("serializes %s with its stable domain type", (name, error) => {
    const serialized = serializeException(error);
    expect(serialized.type).toBe(name);
    expect(serialized.message).toBe(error.message);
    expect(serialized.code).toBe("code" in error ? error.code : null);
  });

  it("retains specialized payloads and native cause chains", () => {
    const cause = new TypeError("device disappeared");
    const audio = new AudioOutputError(409, "AUDIO_CONFLICT", "Safe conflict", "Choose a route", ["route"], [], [], { cause });
    expect(audio).toMatchObject({ nextStep: "Choose a route", routeIds: ["route"], references: [], owners: [] });
    expect(serializeException(audio)).toMatchObject({ type: "AudioOutputError", code: "AUDIO_CONFLICT", cause: { type: "TypeError", message: "device disappeared" } });
    expect(new AlertSetActivationBlockedError("set", impact).impact).toBe(impact);
    expect(new StartupPortInUseError("127.0.0.1", 3000, [3001], { cause }).suggestedPorts).toEqual([3001]);
  });

  it("keeps global disclosure limited to owned HttpResponseError", async () => {
    const logger = vi.fn();
    const app = createBaseServerApp({ metadata: { appName: "stream-jams", version: "test" }, serverErrorLogger: logger });
    app.get("/owned", () => { throw new HttpResponseError(409, "CONFLICT", "Safe conflict", { cause: new Error("private detail") }); });
    app.get("/unowned", () => { throw new DesktopConfigError(409, "PRIVATE", "private detail"); });
    try {
      const owned = await app.inject("/owned");
      expect(owned.statusCode).toBe(409);
      expect(owned.json()).toMatchObject({ error: { code: "CONFLICT", message: "Safe conflict" } });
      const unowned = await app.inject("/unowned");
      expect(unowned.statusCode).toBe(500);
      expect(unowned.body).not.toContain("private detail");
    } finally { await app.close(); }
  });
});
