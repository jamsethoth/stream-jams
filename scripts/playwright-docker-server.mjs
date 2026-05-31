import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import process from "node:process";

const require = createRequire(import.meta.url);
const playwrightPackage = require("@playwright/test/package.json");
const playwrightVersion = playwrightPackage.version;
const image = `mcr.microsoft.com/playwright:v${playwrightVersion}-noble`;
const requestedPort = process.env.PLAYWRIGHT_DOCKER_SERVER_PORT ?? "3000";
const portNumber = Number(requestedPort);

if (!Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65535) {
  console.error("PLAYWRIGHT_DOCKER_SERVER_PORT must be a TCP port number.");
  process.exit(1);
}

const port = String(portNumber);
const endpoint = `ws://127.0.0.1:${port}/`;

const dockerArgs = [
  "run",
  "--rm",
  "--init",
  "--ipc=host",
  "--add-host=hostmachine:host-gateway",
  "-p",
  `127.0.0.1:${port}:${port}`,
  "--workdir",
  "/home/pwuser",
  "--user",
  "pwuser",
  image,
  "npx",
  "-y",
  `playwright@${playwrightVersion}`,
  "run-server",
  "--port",
  port,
  "--host",
  "0.0.0.0"
];

console.log(`Starting Playwright server with ${image} on ${endpoint}`);
console.log("Run tests in another terminal with:");
console.log(
  `PLAYWRIGHT_WEB_SERVER_HOST=0.0.0.0 PLAYWRIGHT_BASE_URL=http://hostmachine:4173 PW_TEST_CONNECT_WS_ENDPOINT=${endpoint} corepack pnpm test:e2e`
);

const child = spawn("docker", dockerArgs, {
  stdio: "inherit"
});

child.on("exit", (code, signal) => {
  if (signal !== null) {
    console.error(`Docker Playwright server stopped by signal ${signal}`);
    process.exitCode = 1;
    return;
  }

  process.exitCode = code ?? 1;
});
