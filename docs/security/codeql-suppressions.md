# CodeQL Suppressions

This file records intentional in-source CodeQL suppressions that rely on repository-specific controls.

## `js/missing-rate-limiting` on `GET /config/server`

- Location: `apps/server/src/http/routes/config.ts`
- Reason: GitHub CodeQL models common rate-limiting packages, but does not recognize the Stream Jams custom Fastify `preHandler` limiter.
- Control: `ServerConfigRouteDependencies` requires `managementRateLimitPreHandler`, and `registerConfigRoutes` installs it as the first pre-handler before management auth and before the filesystem-backed config handler runs.
- Validation: `apps/server/src/http/routes/config.test.ts` asserts repeated authenticated and unauthenticated config requests return HTTP 429 before additional config-store reads or writes.
