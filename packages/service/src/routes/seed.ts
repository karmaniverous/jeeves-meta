/**
 * POST /seed — create a .meta/ directory with an empty meta.json.
 *
 * @module routes/seed
 */

import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { resolveMetaDir } from '../lock.js';
import type { RouteDeps } from './index.js';

const seedBodySchema = z.object({
  path: z.string().min(1),
  crossRefs: z.array(z.string()).optional(),
});

export function registerSeedRoute(app: FastifyInstance, deps: RouteDeps): void {
  app.post('/seed', async (request, reply) => {
    const body = seedBodySchema.parse(request.body);
    const metaDir = resolveMetaDir(body.path);

    if (existsSync(metaDir)) {
      return reply.status(409).send({
        error: 'CONFLICT',
        message: `.meta directory already exists at ${body.path}`,
      });
    }

    deps.logger.info({ metaDir }, 'creating .meta directory');
    await mkdir(metaDir, { recursive: true });

    const metaJson: Record<string, unknown> = { _id: randomUUID() };
    if (body.crossRefs !== undefined) metaJson._crossRefs = body.crossRefs;
    const metaJsonPath = join(metaDir, 'meta.json');
    deps.logger.info({ metaJsonPath }, 'writing meta.json');
    await writeFile(metaJsonPath, JSON.stringify(metaJson, null, 2) + '\n');

    return reply.status(201).send({
      status: 'created',
      path: body.path,
      metaDir,
      _id: metaJson._id,
    });
  });
}
