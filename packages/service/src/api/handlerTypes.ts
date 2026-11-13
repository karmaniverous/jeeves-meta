/**
 * Types of jeeves-meta's catalog handlers. Pure types.
 *
 * @module api/handlerTypes
 */

import type { CatalogHandlers } from '@karmaniverous/jeeves/fastify';
import type { MetaCatalog } from '@karmaniverous/jeeves-meta-core';

/** One handler per `META_CATALOG` entry. */
export type MetaHandlers = CatalogHandlers<MetaCatalog>;
