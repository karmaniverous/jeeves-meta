/**
 * POST /seed — create a .meta/ directory with an empty meta.json.
 *
 * @module routes/seed
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { createMeta, metaExists } from '../seed/index.js';
import type { RouteDeps } from './index.js';

const seedBodySchema = z.object({
  path: z.string().min(1),
  crossRefs: z.array(z.string()).optional(),
});

export function registerSeedRoute(app: FastifyInstance, deps: RouteDeps): void {
  app.post('/seed', async (request, reply) => {
    const body = seedBodySchema.parse(request.body);

    if (metaExists(body.path)) {
      return reply.status(409).send({
        error: 'CONFLICT',
        message: `.meta directory already exists at ${body.path}`,
      });
    }

    deps.logger.info({ path: body.path }, 'seeding .meta directory');
    const result = await createMeta(body.path, {
      crossRefs: body.crossRefs,
    });

    return reply.status(201).send({
      status: 'created',
      path: body.path,
      metaDir: result.metaDir,
      _id: result._id,
    });
  });
}
