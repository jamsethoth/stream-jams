import { describe, expect, it } from "vitest";
import { NamedError } from "./named-error.js";
import { serializeException } from "../diagnostics/serialized-exception.js";

describe("NamedError", () => {
  it("serializes an explicit stable name and native cause independent of constructor identity", () => {
    class Wrapped extends NamedError { constructor() { super("StableFailure", "safe detail", { cause: new TypeError("source") }); } }
    expect(serializeException(new Wrapped())).toMatchObject({ type: "StableFailure", message: "safe detail", cause: { type: "TypeError", message: "source" } });
  });
});
