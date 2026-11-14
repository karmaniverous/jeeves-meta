---
title: Migrating to 0.20
---

# Migrating to jeeves-meta 0.20

Service 0.20.0, plugin 0.17.0, core 0.4.0 and the new SDK 0.1.0 put jeeves-meta's HTTP API on an endpoint catalog (`META_CATALOG`). Success responses are unchanged, byte for byte. What changes is how errors and malformed requests are answered, and the Node.js floor.

## Node.js

Every package requires **Node.js 24.22.2 or later**.

## Error responses

Every non-2xx response is now Fastify's standard error body:

```json
{
  "statusCode": 404,
  "code": "META_NOT_FOUND",
  "error": "Not Found",
  "message": "Meta path not found: j:/domains/x"
}
```

Branch on `code`, never on `message`. What each case answered in 0.19 and answers now:

| Case | 0.19 | 0.20 |
| --- | --- | --- |
| No meta at the path (`GET`/`PATCH /metas/:path`, `GET /preview`) | 404 `{ error: 'NOT_FOUND', message }` | 404 `META_NOT_FOUND` |
| Watcher unreachable (`GET /preview`, `POST /synthesize`) | 503 `{ error: 'SERVICE_UNAVAILABLE', message }` | 503 `META_WATCHER_UNAVAILABLE` |
| Watcher unreachable (`GET /metas`) | 500 `{ error: 'INTERNAL_ERROR', message: <raw cause> }` | 503 `META_WATCHER_UNAVAILABLE` |
| `POST /seed` where `.meta/` exists | 409 `{ error: 'CONFLICT', message }` | 409 `META_ALREADY_EXISTS` |
| `POST /unlock` with no lock | 409 `{ error: 'ALREADY_UNLOCKED', message }` | 409 `META_NOT_LOCKED` |
| `POST /config/apply` without a config file | 500 `{ error }` | 500 `META_CONFIG_UNAVAILABLE` |
| `GET /config?path=` with a bad JSONPath | 400 `{ error: <parser message> }` | 400 `META_INVALID_JSONPATH` |
| `POST /config/apply` with an invalid merged config | 400 `{ error: 'Config validation failed', issues }` | 400 `JEEVES_CONFIG_INVALID` |
| Any route except `GET /status`, `/config`, `/config/apply` and `/openapi.json` while the service starts | 503 `{ status: 'starting', message }` | 503 `META_NOT_READY` |
| An unexpected failure | 500 `{ error: 'INTERNAL_ERROR', message: <raw cause> }` | 500, no `code`, a generic message; the cause is logged |

No response carries `Retry-After`.

## Request validation

Every request is validated against its catalog schema before the handler runs. A malformed request answers **400 `FST_ERR_VALIDATION`** where 0.19 answered:

- **500 `INTERNAL_ERROR`** (a Zod message) for bad query values on `GET /metas` (`staleHours=abc`, `hasError=yes`) and `GET /metas/:path` (`includeArchive=foo`), and bad bodies on `POST /synthesize`, `POST /seed` and `POST /unlock`.
- **400 `BAD_REQUEST`** for unknown or engine-managed keys in `PATCH /metas/:path`.
- **400 `{ error }`** for a missing or malformed `patch`/`replace` in `POST /config/apply`.

Two requests that failed in 0.19 now succeed:

- `GET /metas/:path` with a path containing `%`: 0.19 decoded `:path` twice and answered 500. Encode the path once (`encodeURIComponent`).
- `GET /status` during start-up: 0.19 answered 503 `{ status: 'starting', message }`. 0.20 answers 200 with the usual body, `health.serviceState: "starting"` and `metaCounts`, `nextPhase` null until the first meta list loads, so health probes no longer see an error while meta starts. `ServiceState` in core gains `'starting'`.
- `GET /config?path=...` during start-up: 0.19's readiness gate matched the raw URL, so a JSONPath query got 503. `/config`, `/config/apply` and `/openapi.json` are served while the service starts.

## New

- `GET /openapi.json` serves the OpenAPI 3.1 document; it also ships as `@karmaniverous/jeeves-meta-core/openapi.json`.
- [`@karmaniverous/jeeves-meta-sdk`](../../sdk/README.md) is a typed client for every route. The plugin's tools and the service CLI use it.
- `META_ERROR_CODES` and `META_ERROR_STATUS` (core and SDK) list every `META_*` code and its status.
- The service reports the watcher as `indexing` during its initial scan ([#244](https://github.com/karmaniverous/jeeves-meta/issues/244)).

## Deprecated

`META_ENDPOINTS`, `getEndpoint` and their types (core) still work but are deprecated: use `META_CATALOG.entries`.

## Plugin and CLI

The plugin's tools keep their names, descriptions and inputs. A failed tool reads `Error: HTTP <status>: <body>`, as before; the body is now the standard error body. CLI commands print the same JSON; a failure prints `Error: <message> (HTTP <status> <code>)` and exits 1. `jeeves-meta prune` never had a route ([#69](https://github.com/karmaniverous/jeeves-meta/issues/69)) and now says so instead of failing with HTTP 404.
