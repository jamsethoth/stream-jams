import { expect, it } from "vitest";
import { isPearProtocolSocketError } from "./pear-socket-error.js";

it.each([
  "WS_ERR_EXPECTED_FIN", "WS_ERR_EXPECTED_MASK", "WS_ERR_INVALID_CLOSE_CODE",
  "WS_ERR_INVALID_CONTROL_PAYLOAD_LENGTH", "WS_ERR_INVALID_OPCODE", "WS_ERR_INVALID_UTF8",
  "WS_ERR_UNEXPECTED_MASK", "WS_ERR_UNEXPECTED_RSV_1", "WS_ERR_UNEXPECTED_RSV_2_3",
  "WS_ERR_TOO_MANY_BUFFERED_PARTS", "WS_ERR_UNSUPPORTED_DATA_PAYLOAD_LENGTH", "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH"
])("classifies %s independently of vendor wording", (code) => {
  expect(isPearProtocolSocketError(Object.assign(new Error("changed vendor copy"), { code }))).toBe(true);
});

it("keeps unknown network failures and English lookalikes out of protocol handling", () => {
  expect(isPearProtocolSocketError(new Error("invalid WebSocket frame utf-8 too big"))).toBe(false);
  expect(isPearProtocolSocketError(Object.assign(new Error("max payload"), { code: "ECONNRESET" }))).toBe(false);
  expect(isPearProtocolSocketError({ code: "WS_ERR_UNKNOWN" })).toBe(false);
});
