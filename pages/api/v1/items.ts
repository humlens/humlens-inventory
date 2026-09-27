import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';

import { guardApiKey, handleV1Error } from '@/lib/apiKey';
import { validateWithSchema } from '@/lib/zod';
import { createMissingItems } from 'models/storeSync';

const bodySchema = z.object({
  items: z
    .array(
      z.object({
        sku: z.string().trim().min(1).max(100),
        name: z.string().trim().min(1).max(300),
        description: z.string().max(2000).optional(),
        sellPrice: z.number().nonnegative().optional(),
      })
    )
    .min(1)
    .max(500),
});

// POST /api/v1/items — creates items for SKUs this team doesn't have yet.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'POST') return res.status(405).end();
    const { teamId, actorId } = await guardApiKey(req, res, 'item', 'create');
    const body = validateWithSchema(bodySchema, req.body);
    res.status(200).json({ data: await createMissingItems({ teamId, actorId, ...body }) });
  } catch (error) {
    handleV1Error(res, error);
  }
}
