import { createServerApp } from "./app.js";

const app = createServerApp();
const port = 39187;
const host = "127.0.0.1";

try {
  await app.listen({ host, port });
  app.log.info(`Stream Jams server listening on http://${host}:${port}`);
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}
