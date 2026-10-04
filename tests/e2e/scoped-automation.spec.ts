import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { InMemorySecretStore } from "../../packages/test-support/dist/index.js";
import { createDefaultAppConfig } from "../../apps/server/dist/config/default-config.js";
import { FileConfigStore } from "../../apps/server/dist/config/file-config-store.js";
import { startLocalRuntime } from "../../apps/server/dist/runtime/start-local-runtime.js";

test("approves a proof-bound local client and revokes its real credential in Settings", async ({ page, request }, testInfo) => {
 test.setTimeout(90_000);
 const root = await mkdtemp(join(tmpdir(), "stream-jams-scoped-automation-e2e-"));
 const listener = createServer(); await new Promise<void>(done => listener.listen(0, "127.0.0.1", done));
 const address = listener.address(); if (address === null || typeof address === "string") throw new Error("Expected isolated port");
 const port = address.port; await new Promise<void>((done, reject) => listener.close(error => error ? reject(error) : done()));
 const config = { ...createDefaultAppConfig(root), server: { host: "127.0.0.1" as const, port } };
 const runtime = await startLocalRuntime({ homeDirectory: root, webBuildDirectory: resolve("apps/web/dist"), configStore: new FileConfigStore({ configFilePath: join(root, "config.json"), defaultConfig: config }), environment: {}, secretStore: new InMemorySecretStore() });
 try {
  const verifier = "a".repeat(43); const clientName = "Acceptance client";
  const pending = await request.post(`${runtime.url}/automation/v1/pairings`, { data: { clientName, scopes: ["timers:read"], codeChallenge: createHash("sha256").update(verifier).digest("base64url") } });
  expect(pending.ok()).toBe(true); const pairing = await pending.json() as { id: string; comparisonCode: string; approvalUrl: string };
  await page.goto(`${runtime.url}${pairing.approvalUrl}`);
  const item = page.getByRole("article", { name: `Pairing ${clientName}` });
  await expect(item).toContainText(pairing.comparisonCode); await expect(item).toContainText("timers:read");
  const browserAttempt = await page.evaluate(async () => { const response = await fetch("/automation/v1/pairings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ clientName: "Browser", scopes: ["timers:read"], codeChallenge: "x".repeat(43) }) }); return response.status; });
  expect(browserAttempt).toBe(403);
  await item.getByRole("button", { name: `Approve ${clientName}` }).click();
  await expect(item).toContainText("Waiting for the client to finish pairing.");
  const exchange = await request.post(`${runtime.url}/automation/v1/pairings/${pairing.id}/exchange`, { data: { verifier } }); expect(exchange.ok()).toBe(true);
  const credential = await exchange.json() as { token: string };
  const headers = { authorization: `Bearer ${credential.token}` };
  expect((await request.get(`${runtime.url}/automation/v1/state`, { headers })).status()).toBe(200);
  expect((await request.post(`${runtime.url}/automation/v1/pairings/${pairing.id}/exchange`, { data: { verifier } })).status()).toBe(404);
  await page.getByRole("button", { name: "Refresh automation" }).click();
  const grant = page.getByRole("article", { name: `Permissions for ${clientName}` }); await expect(grant).toContainText("Access granted");
  await page.screenshot({ path: testInfo.outputPath("automation-approved.png") });
  await grant.getByRole("button", { name: `Revoke ${clientName}` }).click(); await expect(grant).toContainText("Access revoked");
  expect((await request.get(`${runtime.url}/automation/v1/state`, { headers })).status()).toBe(401);
  await page.screenshot({ path: testInfo.outputPath("automation-revoked.png") });
 } finally { await runtime.close(); await rm(root, { recursive: true, force: true }); }
});
