import { expect, it } from "vitest";
import { closeAction, isManagementNavigation, isTrustedManagementSender } from "./close-policy.js";

it.each([[true, false, "hide"], [false, false, "quit"], [true, true, "quit"]] as const)("close policy %s / %s", (closeToTray, explicitQuit, expected) => {
  expect(closeAction(closeToTray, explicitQuit)).toBe(expected);
});

it("limits privileged navigation to management and operator on the owned origin", () => {
  const origin = "http://127.0.0.1:39187";
  for (const url of [`${origin}/manage`, `${origin}/manage/alerts`, `${origin}/operator`]) expect(isManagementNavigation(url, origin)).toBe(true);
  for (const url of [`${origin}/overlays/key`, `${origin}/management`, "http://127.0.0.1:39188/manage", "https://hostile.example/manage", "file:///manage"]) expect(isManagementNavigation(url, origin)).toBe(false);
});

it("rejects another renderer, a subframe, and an unexpected origin before granting quit authority", () => {
  const valid = { senderId: 7, expectedId: 7, isMainFrame: true, url: "http://127.0.0.1:39187/manage", origin: "http://127.0.0.1:39187" };
  expect(isTrustedManagementSender(valid)).toBe(true);
  expect(isTrustedManagementSender({ ...valid, senderId: 8 })).toBe(false);
  expect(isTrustedManagementSender({ ...valid, isMainFrame: false })).toBe(false);
  expect(isTrustedManagementSender({ ...valid, url: "http://localhost:39187/manage" })).toBe(false);
});
