# @karmaniverous/jeeves-meta-core

Shared types, schemas, the endpoint catalog and utilities for the jeeves-meta monorepo. This package is the single source of truth for the API contract: the [service](../service/) registers its routes from it, and the [SDK](../sdk/) and [OpenClaw plugin](../openclaw/) call them through it.

## Install

```bash
npm install @karmaniverous/jeeves-meta-core
```

## Exports

### Constants

- **`META_COMPONENT`** — component descriptor (name, default port, packages, dependencies)

### Endpoint Catalog

- **`META_CATALOG`** — the 13 endpoints as jeeves catalog entries: name, method, path, description, auth (`none`), kind, and Zod request (params, query, body) and response schemas
- Types: `MetaCatalog`, `MetaEntryName`, `MetaEntry<N>`, `MetaInput<N>`, `MetaResponse<N>`, `MetaHealth`
- Request schemas (`metasQuerySchema`, `metaDetailQuerySchema`, `updateBodySchema`, `seedBodySchema`, `synthesizeBodySchema`, `unlockBodySchema`, `previewQuerySchema`), response schemas (`metasResponseSchema`, `metaDetailResponseSchema`, ...) and `metaHealthSchema` (the `health` block of `GET /status`)
- **`META_OPENAPI_DOCUMENT`** — the OpenAPI 3.1 document generated from the catalog; also the `@karmaniverous/jeeves-meta-core/openapi.json` sub-path

### Error Codes

- **`META_ERROR_CODES`** — every `META_*` code an error response can carry; type `MetaErrorCode`
- **`META_ERROR_STATUS`** — the HTTP status of each code
- Error responses are Fastify's standard body `{ statusCode, code?, error, message }`; see the [service README](../service/README.md#errors)

### Deprecated

- **`META_ENDPOINTS`**, **`getEndpoint(name)`** and types `HttpMethod`, `EndpointDescriptor`, `EndpointName`, `Endpoint<N>` — the name, method, path and description of each catalog entry. Use `META_CATALOG.entries`.

### Configuration Schema

- **`metaConfigSchema`** — Zod schema for core config fields (watcherUrl, gatewayUrl, schedule, etc.)
- Type: `MetaConfig`

### Phase Vocabulary

- **`phaseNames`** — `['architect', 'builder', 'critic']`
- **`phaseStatuses`** — `['fresh', 'stale', 'pending', 'running', 'failed']`
- **`phaseStateSchema`** / **`phaseStatusSchema`** — Zod schemas
- Types: `PhaseName`, `PhaseStatus`, `PhaseState`

### Synthesis Error Schema

- **`metaErrorSchema`** — Zod schema for the `_error` a failed phase writes to `meta.json`: `{ step, code, message }`
- Type: `MetaError`

### HTTP Response Contracts

- `MetaListSummary` — summary stats from `GET /metas`
- `MetasItem` — per-meta projected item
- `MetasResponse` — `{ summary, metas }` envelope
- `DepHealth`, `WatcherDepHealth`, `GatewayDepHealth` — dependency health
- `ServiceState` — `'idle' | 'synthesizing' | 'waiting' | 'stopping'`

### Utilities

- **`normalizePath(p)`** — converts backslashes to forward slashes

## Requirements

- Node.js >= 24.22.2
- ESM only

## License

BSD-3-Clause
