import { describe, expect, it } from "vitest";
import { createServerApp } from "./app.js";

describe("createServerApp", () => {
  it("returns health without binding a production port", async () => {
    const app = createServerApp({
      appName: "stream-jams",
      version: "1.2.3"
    });

    const response = await app.inject({
      method: "GET",
      url: "/health"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: "ok",
      app: "stream-jams",
      version: "1.2.3"
    });
  });
});
