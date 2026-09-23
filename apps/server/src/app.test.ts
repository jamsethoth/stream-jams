import { describe, expect, it, vi } from "vitest";
import { createBaseServerApp } from "./app.js";

describe("createBaseServerApp", () => {
  it("returns health without binding a production port", async () => {
    const app = createBaseServerApp({
      metadata: { appName: "stream-jams", version: "1.2.3" }
    });

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok", app: "stream-jams", version: "1.2.3" });
    expect(response.headers["content-type"]).toContain("application/json");
  });

  it("keeps safe error responses and detailed server logging in the base factory", async () => {
    const serverErrorLogger = vi.fn();
    const app = createBaseServerApp({
      metadata: { appName: "stream-jams", version: "1.2.3" },
      generateServerErrorId: () => "err_base",
      serverErrorLogger
    });
    app.get("/failure", async () => { throw new Error("sensitive failure detail"); });

    const response = await app.inject({ method: "GET", url: "/failure" });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        id: "err_base",
        message: "A server error occurred. Use the error ID to find details in backend logs."
      }
    });
    expect(response.body).not.toContain("sensitive failure detail");
    expect(serverErrorLogger).toHaveBeenCalledWith(expect.objectContaining({
      errorId: "err_base",
      code: "INTERNAL_SERVER_ERROR",
      method: "GET",
      url: "/failure"
    }));
  });
});