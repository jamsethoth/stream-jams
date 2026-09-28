import { describe, expect, it, vi } from "vitest";
import { EmergencyLogWriter } from "./emergency-log-writer.js";

const input = {
  timestamp: "2026-09-27T23:30:00.000Z",
  component: "overlay",
  event: "overlay.playback.failed",
  referenceId: "err_emergency_1",
  message: "Playback failed for ovl_secretKey\r\nfor Bearer oauth-secret",
  originalException: new Error("Source https://local.test/video?access_token=oauth-secret failed"),
  loggerException: new Error("runtime append failed")
};

describe("EmergencyLogWriter", () => {
  it("writes one independently sanitized bounded synchronous record", () => {
    const lines: string[] = [];
    const writer = new EmergencyLogWriter({
      filePath: "C:/logs/emergency.jsonl",
      appendFile: (_path, data) => { lines.push(data); },
      writeStderr: vi.fn()
    });

    writer.write(input);

    expect(lines).toHaveLength(1);
    const record = JSON.parse(lines[0] ?? "") as Record<string, unknown>;
    expect(record).toMatchObject({
      timestamp: input.timestamp,
      component: input.component,
      event: input.event,
      referenceId: input.referenceId,
      message: "Playback failed for [REDACTED]  for Bearer [REDACTED]"
    });
    expect(JSON.stringify(record)).toContain("runtime append failed");
    expect(JSON.stringify(record)).not.toContain("oauth-secret");
    expect(JSON.stringify(record)).not.toContain("ovl_secretKey");
    expect(lines[0]?.endsWith("\n")).toBe(true);
  });

  it("prevents recursive writes and falls back to standard error", () => {
    const stderr: string[] = [];
    // eslint-disable-next-line prefer-const -- the recursive callback closes over the subsequently constructed writer
    let writer: EmergencyLogWriter;
    const appendFile = vi.fn(() => {
      writer.write({ ...input, referenceId: "err_recursive" });
      throw new Error("emergency destination unavailable");
    });
    writer = new EmergencyLogWriter({
      filePath: "C:/logs/emergency.jsonl",
      appendFile,
      writeStderr: (data) => { stderr.push(data); }
    });

    expect(() => writer.write(input)).not.toThrow();

    expect(appendFile).toHaveBeenCalledOnce();
    expect(stderr).toHaveLength(1);
    expect(stderr[0]).toContain("err_emergency_1");
    expect(stderr[0]).not.toContain("oauth-secret");
  });

  it("redacts credential assignments and nested secondary exceptions", () => {
    const lines: string[] = [];
    const writer = new EmergencyLogWriter({
      filePath: "C:/logs/emergency.jsonl",
      appendFile: (_path, data) => { lines.push(data); },
      writeStderr: vi.fn()
    });
    const primary = new Error("password=hunter2");
    const cleanup = new Error("client_secret: cleanup-secret credential=credential-secret");

    writer.write({
      ...input,
      originalException: new AggregateError([primary, cleanup], "token=outer-secret", { cause: primary })
    });

    const output = lines.join("");
    expect(output).toContain("password=[REDACTED]");
    expect(output).toContain("client_secret=[REDACTED]");
    expect(output).toContain("token=[REDACTED]");
    expect(output).toContain("credential=[REDACTED]");
    expect(output).not.toContain("hunter2");
    expect(output).not.toContain("cleanup-secret");
    expect(output).not.toContain("outer-secret");
    expect(output).not.toContain("credential-secret");
  });
});
