import { expect, it } from "vitest";
import { alertTestNotice } from "./alert-test-notice.js";
it("pending feedback identifies acceptance without claiming delivery or inviting replay", () => {
  const result = alertTestNotice({ status: "pending", targetProfileId: "landscape", referenceId: "bus", busId: "bus", eventId: "manual", test: true, deliveredDestinations: [], unavailableDestinations: [] });
  expect(result.message).toContain("delivery is pending");
  expect(result.message).not.toContain("queued");
  expect(result.detail).toContain("do not resend");
});
