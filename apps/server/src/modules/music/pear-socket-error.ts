/** ws protocol/limit codes; remote English messages and URLs are never a classifier. */
const protocolCodes = new Set([
  "WS_ERR_EXPECTED_FIN", "WS_ERR_EXPECTED_MASK", "WS_ERR_INVALID_CLOSE_CODE",
  "WS_ERR_INVALID_CONTROL_PAYLOAD_LENGTH", "WS_ERR_INVALID_OPCODE", "WS_ERR_INVALID_UTF8",
  "WS_ERR_UNEXPECTED_MASK", "WS_ERR_UNEXPECTED_RSV_1", "WS_ERR_UNEXPECTED_RSV_2_3",
  "WS_ERR_TOO_MANY_BUFFERED_PARTS", "WS_ERR_UNSUPPORTED_DATA_PAYLOAD_LENGTH", "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH"
]);

export function isPearProtocolSocketError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error &&
    typeof error.code === "string" && protocolCodes.has(error.code);
}
