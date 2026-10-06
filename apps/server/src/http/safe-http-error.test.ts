import { expect, it, vi } from "vitest";
import { SafeHttpError } from "./safe-http-error.js";
import { createBaseServerApp } from "../app.js";

it("does not authorize generic HTTP disclosure by inheriting shared envelope mechanics", async () => {
  const app = createBaseServerApp({ metadata: { appName: "stream-jams", version: "test" }, serverErrorLogger: vi.fn() });
  app.get("/", () => { throw new SafeHttpError("UnownedFailure", 409, "UNOWNED", "private detail"); });
  try {
    const response = await app.inject("/");
    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain("private detail");
    expect(response.json()).toMatchObject({ error: { code: "INTERNAL_SERVER_ERROR" } });
  } finally { await app.close(); }
});
