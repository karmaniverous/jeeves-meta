/**
 * POST /config/apply — apply a config patch via the core SDK handler.
 *
 * @module routes/configApply
 */

import { createConfigApplyHandler } from '@karmaniverous/jeeves';
import type { FastifyInstance } from 'fastify';

import { metaDescriptor } from '../descriptor.js';

/** Register the POST /config/apply route. */
export function registerConfigApplyRoute(app: FastifyInstance): void {
  const handler = createConfigApplyHandler(metaDescriptor);

  app.post('/config/apply', async (request, reply) => {
    const result = await handler(
      request.body as { patch: Record<string, unknown>; replace?: boolean },
    );
    return reply.status(result.status).send(result.body);
  });
}
