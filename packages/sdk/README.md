# @karmaniverous/jeeves-meta-sdk

Typed TypeScript client for the [jeeves-meta](https://github.com/karmaniverous/jeeves-meta) HTTP API: metas, synthesis, the queue, previews, seeding, unlocking, status and config.

The client is generated from jeeves-meta's endpoint catalog (`META_CATALOG` in `@karmaniverous/jeeves-meta-core`), so every method, input and response type matches the routes the service registers. Requests are validated before they are sent and responses are parsed on arrival.

## Install

```bash
npm install @karmaniverous/jeeves-meta-sdk
```

Requires Node.js 24.22.2 or later.

## Usage

```typescript
import { createMetaClient, isMetaError } from '@karmaniverous/jeeves-meta-sdk';

const meta = createMetaClient({ baseUrl: 'http://127.0.0.1:1938' });

const { summary } = await meta.listMetas({ hasError: 'true' });
const detail = await meta.metaDetail({ path: 'j:/domains/projects/x' });

try {
  const queued = await meta.synthesize({ path: 'j:/domains/projects/x' });
  console.log(queued.status, summary.errors, detail.owedPhase);
} catch (error) {
  if (isMetaError(error) && error.code === 'META_WATCHER_UNAVAILABLE') {
    console.log(`${error.message} (HTTP ${String(error.status)})`);
  } else throw error;
}
```

Every method is named after its catalog entry and takes one input object holding the entry's path parameters, query fields and body fields, flat. Query fields are strings, as on the wire (`hasError: 'true'`):

| Method | Route | Input |
| --- | --- | --- |
| `status` | `GET /status` | none |
| `listMetas` | `GET /metas` | `{ pathPrefix?, hasError?, staleHours?, neverSynthesized?, locked?, disabled?, fields? }` |
| `metaDetail` | `GET /metas/:path` | `{ path, fields?, includeArchive? }` |
| `updateMeta` | `PATCH /metas/:path` | `{ path, _steer?, _emphasis?, _depth?, _crossRefs?, _disabled? }` (`null` removes) |
| `synthesize` | `POST /synthesize` | `{ path? }` |
| `abort` | `POST /synthesize/abort` | none |
| `preview` | `GET /preview` | `{ path? }` |
| `seed` | `POST /seed` | `{ path, crossRefs?, steer? }` |
| `unlock` | `POST /unlock` | `{ path }` |
| `config` | `GET /config` | `{ path? }` (JSONPath) |
| `configApply` | `POST /config/apply` | `{ patch, replace? }` |
| `queue` | `GET /queue` | none |
| `queueClear` | `POST /queue/clear` | none |

`path` is a meta's owner path or `.meta/` path; the client encodes it once in the URL, so spaces, `/`, `:` and `%` are safe. The request and response types are exported (`MetaInput<'listMetas'>`, `MetaResponse<'synthesize'>`, `MetaHealth`, ...). Responses are parsed against the schemas of the meta-core version the SDK was built with: fields a newer jeeves-meta adds are dropped until you upgrade the SDK.

`synthesize` only enqueues: it answers at once (`202` queued, or `200` skipped when nothing is owed). Follow progress with `status` or `queue`.

## Timeouts

- Every call times out after **120 s** by default (`timeoutMs` option).
- Any call can override its timeout: `meta.preview({}, { timeoutMs: 10_000 })`.

The SDK never retries.

## Errors

Every failure is a `MetaError`. Branch on `code`, never on `message`:

| `code` | `status` | When |
| --- | --- | --- |
| the body's `code` | the HTTP status | jeeves-meta answered non-2xx with a code (`META_*`, `JEEVES_*`, `FST_ERR_*`, below); `message` is the body's `message`, `body` the whole body and `responseText` the body as received |
| `http_<status>` | the HTTP status | jeeves-meta answered non-2xx without a code: a masked 500 (an unexpected failure; the cause is in the service log), an unknown route, or a body that isn't jeeves-meta's (a proxy's page) |
| `invalid_request` | `0` | the input failed the entry's schema; nothing was sent (`issues`) |
| `invalid_response` | 2xx | the response was not JSON or did not match the entry's schema |
| `timeout` | `0` | no response within the call's timeout |
| `network_error` | `0` | the request failed (service not running, DNS, ...) |
| `invalid_options` | `0` | `createMetaClient` options are invalid |

A non-2xx body is always Fastify's standard error body, `{ statusCode, code?, error, message }`. jeeves-meta's own codes (`META_ERROR_CODES` and `META_ERROR_STATUS`, exported here and by `@karmaniverous/jeeves-meta-core`):

| `code` | Status | When |
| --- | --- | --- |
| `META_INVALID_JSONPATH` | 400 | `config` with a `path` that is not valid JSONPath |
| `META_NOT_FOUND` | 404 | no meta at the path given to `metaDetail`, `updateMeta` or `preview` |
| `META_ALREADY_EXISTS` | 409 | `seed` where a `.meta/` already exists |
| `META_NOT_LOCKED` | 409 | `unlock` where there is no lock file |
| `META_CONFIG_UNAVAILABLE` | 500 | `configApply` on a service started without a config file |
| `META_WATCHER_UNAVAILABLE` | 503 | `listMetas`, `preview` or `synthesize` could not reach jeeves-watcher; retry later |
| `META_NOT_READY` | 503 | the service is still starting; retry shortly (`config` and `configApply` are served during start-up) |

Also: `FST_ERR_VALIDATION` (400) when a request fails the catalog's schemas (the SDK checks input first, so you see `invalid_request` instead), jeeves' `JEEVES_CONFIG_INVALID` from `configApply`, and `JEEVES_RESPONSE_VALIDATION` (500) if jeeves-meta's own response fails its schema. No error carries `Retry-After`.

## OpenAPI

The service serves its OpenAPI 3.1 document at `GET /openapi.json`; the same document ships as `@karmaniverous/jeeves-meta-core/openapi.json`.

## License

BSD-3-Clause
