import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
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
  it.each([false, true])("redacts URL credentials and all capability types when stderr fallback is %s", (failFile) => {
    const lines: string[] = [];
    const writer = new EmergencyLogWriter({
      filePath: "C:/logs/emergency.jsonl",
      appendFile: (_path, data) => {
        if (failFile) throw new Error("emergency file unavailable");
        lines.push(data);
      },
      writeStderr: (data) => { lines.push(data); }
    });

    writer.write({
      ...input,
      message: "Failed ws://secret-user:secret-password@localhost:8080/events med_private-media tmr_private-timer",
      originalException: new Error('Provider {"authentication":"challenge-secret"}', {
        cause: new Error("//nested-user:nested-password@localhost/events?token=nested-token")
      }),
      loggerException: new Error("wss://logger-user:logger-password@localhost/events ovl_private-overlay")
    });

    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? "")).toMatchObject({ emergency: true, referenceId: input.referenceId });
    for (const secret of ["secret-user", "secret-password", "med_private-media", "tmr_private-timer", "challenge-secret",
      "nested-user", "nested-password", "nested-token", "logger-user", "logger-password", "ovl_private-overlay"]) {
      expect(lines[0]).not.toContain(secret);
    }
    expect(lines[0]).toContain("ws://localhost:8080/events");
  });

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
  it("strips quoted credentials from real emergency files and stderr including nested causes", async () => {
    const root = await mkdtemp(join(tmpdir(), "stream-jams-quote-emergency-"));
    const filePath = join(root, "emergency.jsonl");
    try {
      const entry = { ...input, message: "Provider wss://alice:p'ass@localhost/events", originalException: new Error('ws://bob:p",ass@[invalid]/events', { cause: new Error("https://cause:p%22ass@safe.test/events?token=query-secret") }), loggerException: new Error('http://logger:p"ass@localhost/logs') };
      new EmergencyLogWriter({ filePath }).write(entry);
      const stderr: string[] = [];
      new EmergencyLogWriter({ filePath, appendFile: () => { throw new Error("unavailable"); }, writeStderr: data => { stderr.push(data); } }).write(entry);
      for (const output of [await readFile(filePath, "utf8"), stderr.join("")]) {
        expect(output).toContain("wss://localhost/events");
        expect(output).toContain("ws://[invalid]/events");
        expect(output).toContain("https://safe.test/events");
        for (const secret of ["alice:", "bob:", "cause:", "logger:", "p'ass", "query-secret"]) expect(output).not.toContain(secret);
      }
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
