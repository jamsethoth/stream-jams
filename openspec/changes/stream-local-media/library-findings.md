# File delivery library feasibility

Verified September 30, 2026 against the locked dependencies: Node 24.16.0, Fastify 5.12.5, @fastify/static 10.1.4 and @fastify/send 4.1.1.

Run `node openspec/changes/stream-local-media/library-probe.mjs` from the repository root. This diagnostic intentionally exits 1 when the proposed direct integration differs from the contract; it is not part of the application test suite.

The ordinary byte-range case passes. Eight other cases do not: HEAD with Range returns 206; an oversized suffix and malformed range return 416; weak/date If-Range conditions return 206; a custom checksum ETag is not used for conditional evaluation; and replacing the path between library inspection and delivery serves the replacement bytes. Source inspection confirms that send accepts a path, calls fs.stat, then opens a new fs.createReadStream; there is no supported opened-handle or custom-validator input. Static's setHeaders runs after send has evaluated conditions.

## Integration decision

Preserve the approved integrity and response contract. Use Node FileHandle streams with Fastify stream replies, and the established jshttp `range-parser` and `fresh` utilities for range calculation and validator matching. Replace the existing handwritten range calculation rather than maintaining both paths. Keep the application adapter responsible for its deliberately restricted single-range policy, strong checksum identity, precondition order, ownership, and safe errors. No library fork, monkey patch, or undocumented API access.

This is a concrete exception to reusing @fastify/static for media, not a change to its existing web-shell use. A general-purpose replacement streaming framework would increase integration and dependency scope. Neither caching nor the documented integrity guarantee changes.

References: https://github.com/jshttp/range-parser and https://github.com/jshttp/fresh. Both are MIT-licensed jshttp components; installed versions are pinned in the server manifest and lockfile.
