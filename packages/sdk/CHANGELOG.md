# Changelog

All notable changes to this project will be documented in this file.

## [0.1.0-0] - 2026-11-13

### ≡ƒÆ╝ Other

- [234] feat(sdk): @karmaniverous/jeeves-meta-sdk (T8)

New packages/sdk, scaffolded like the runner SDK (Decision 210): release-it with sdk/<version> tags and git-cliff, eslint, knip and root build/typecheck entries, a packaging test (jeeves pinned like core, no Fastify or zod-openapi, release config like core's). createMetaClient on jeeves createCatalogClient(META_CATALOG): one method per entry, request and response validated with core's schemas, :path encoded once, 120 s default timeout with per-call timeoutMs, no retries; every failure is a MetaError (status, server code or a client code, body, raw text) (Decision 186). The README example is compiled and run as a test.

The service tests a round trip through all 13 entries against the real app on a loopback port, including :path values with spaces, /, : and %. Created at version 0.0.0; the first release is 0.1.0 (Decision 215). npm publish --dry-run passes.
- Updated dependencies
- Updated core
